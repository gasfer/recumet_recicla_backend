'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/config');
const service = require('../services/historical-transfer-difference.service');

const product = (id, cod = `P-${id}`, name = `Producto ${id}`, category = null) => ({
  id, cod, name, status: true, category,
});

const transfer = (details, reviewNotes = [], completions = []) => ({
  id: 44,
  cod: 'TRAS00044',
  registry_number: 'ING-000044',
  date_received: new Date('2026-08-14T09:00:00.000Z'),
  id_sucursal_received: 2,
  id_storage_received: 4,
  updatedAt: new Date('2026-08-14T09:05:00.000Z'),
  detailsTransfers: details,
  reviewNotes,
  historicalDifferenceCompletions: completions,
});

const detail = (id, productId, sent, received) => ({
  id,
  id_product: productId,
  quantity: sent,
  quantity_received: received,
  product: product(productId),
});

const mockProjectionData = (t, { transferRow, baseByProduct, stockByProduct, kardexByProduct, movements = [], products = [] }) => {
  t.mock.method(db.Transfers, 'findByPk', async () => transferRow);
  t.mock.method(db.kardexMovements, 'findAll', async () => movements);
  t.mock.method(db.Stock, 'findAll', async () => Object.entries(stockByProduct).map(([idProduct, stock]) => ({ id_product: Number(idProduct), stock })));
  t.mock.method(db.Product, 'findAll', async () => products.length ? products : transferRow.detailsTransfers.map(({ product: row }) => row));
  t.mock.method(db.sequelize, 'query', async (sql) => {
    if (sql.includes('GROUP BY id_product')) {
      return Object.entries(baseByProduct).map(([idProduct, quantity]) => ({ id_product: Number(idProduct), quantity }));
    }
    return Object.entries(kardexByProduct).map(([idProduct, saldo]) => ({ id_product: Number(idProduct), saldo }));
  });
};

test('clasifica cantidades exactas, excedentes, faltantes y recepción indeterminada', () => {
  assert.deepEqual(service.expectedDifference({ quantity: 10, quantity_received: 10 }), {
    type: 'EXACTO', sent: 10, received: 10, baseExpected: 10, differenceExpected: 0,
  });
  assert.deepEqual(service.expectedDifference({ quantity: 10, quantity_received: 12.25 }), {
    type: 'EXCEDENTE', sent: 10, received: 12.25, baseExpected: 10, differenceExpected: 2.25,
  });
  assert.deepEqual(service.expectedDifference({ quantity: 10, quantity_received: 7.5 }), {
    type: 'FALTANTE', sent: 10, received: 7.5, baseExpected: 7.5, differenceExpected: 2.5,
  });
  assert.equal(service.expectedDifference({ quantity: 10, quantity_received: null }).type, 'INDETERMINADO');
});

test('asigna una cobertura consolidada de faltante sin contarla dos veces', () => {
  assert.deepEqual(service.allocateCoveredQuantity([
    { id: 1, difference_expected: 3 },
    { id: 2, difference_expected: 4 },
  ], 5), [
    { id: 1, covered: 3, pending: 0 },
    { id: 2, covered: 2, pending: 2 },
  ]);
});

test('ofrece registrar sólo el Kardex omitido para un excedente atribuible', async (t) => {
  const transferRow = transfer([detail(1, 10, 100, 110)]);
  mockProjectionData(t, {
    transferRow,
    baseByProduct: { 10: 100 },
    stockByProduct: { 10: 110 },
    kardexByProduct: { 10: 100 },
  });
  const projection = await service.getProjection(44);
  assert.equal(projection.items[0].reconciliation_status, 'EXCEDENTE_PENDIENTE_KARDEX');
  assert.equal(projection.items[0].allowed_action.code, 'REGISTRAR_EXCEDENTE_OMITIDO');
  assert.equal(projection.items[0].allowed_action.quantity, 10);
});

test('marca excedente como completo cuando el movimiento ya está vinculado', async (t) => {
  const movement = { id: 8, type: 'INPUT', quantity: 10, id_product: 10, details: 'EXCEDENTE TRASPASO #TRAS00044', registry_number: 'ING-000044' };
  const reviewNote = {
    id: 5, id_product: 10, type: 'EXCEDENTE_PARA_REVISION', management_status: 'ACTIVA',
    kardexMovement: movement, details: [{ id_detail_transfer: 1 }],
  };
  const transferRow = transfer([detail(1, 10, 100, 110)], [reviewNote]);
  mockProjectionData(t, {
    transferRow,
    baseByProduct: { 10: 100 },
    stockByProduct: { 10: 110 },
    kardexByProduct: { 10: 110 },
    movements: [movement],
  });
  const projection = await service.getProjection(44);
  assert.equal(projection.items[0].reconciliation_status, 'COMPLETO');
  assert.equal(projection.items[0].allowed_action, null);
  assert.equal(projection.items[0].evidence_confidence, 'VINCULADA');
});

test('ofrece un único registro consolidado para varios faltantes', async (t) => {
  const transferRow = transfer([detail(1, 10, 100, 95), detail(2, 11, 50, 48)]);
  mockProjectionData(t, {
    transferRow,
    baseByProduct: { 10: 95, 11: 48 },
    stockByProduct: { 10: 95, 11: 48 },
    kardexByProduct: { 10: 95, 11: 48 },
  });
  const projection = await service.getProjection(44);
  assert.equal(projection.items[0].allowed_action.code, 'REGISTRAR_FALTANTE_OMITIDO');
  assert.equal(projection.items[0].allowed_action.quantity, 7);
  assert.equal(projection.items[0].allowed_action.requires_merma_product, true);
  assert.equal(projection.items[1].allowed_action, null);
  assert.match(projection.items[1].message, /consolidada/);
});

test('bloquea boletas sin recibido y excedentes que no explican el desfase actual', async (t) => {
  const transferRow = transfer([detail(1, 10, 100, null), detail(2, 11, 100, 110)]);
  mockProjectionData(t, {
    transferRow,
    baseByProduct: { 10: 100, 11: 100 },
    stockByProduct: { 10: 100, 11: 105 },
    kardexByProduct: { 10: 100, 11: 100 },
  });
  const projection = await service.getProjection(44);
  assert.equal(projection.items[0].reconciliation_status, 'INDETERMINADO');
  assert.equal(projection.items[0].allowed_action, null);
  assert.equal(projection.items[1].reconciliation_status, 'DIFERENCIA_NO_ATRIBUIBLE');
  assert.equal(projection.items[1].allowed_action, null);
});

test('bloquea movimientos excedentes ambiguos', async (t) => {
  const transferRow = transfer([detail(1, 10, 100, 110)]);
  mockProjectionData(t, {
    transferRow,
    baseByProduct: { 10: 100 },
    stockByProduct: { 10: 110 },
    kardexByProduct: { 10: 100 },
    movements: [
      { id: 8, quantity: 4, id_product: 10, details: 'EXCEDENTE TRASPASO #TRAS00044', registry_number: 'ING-000044' },
      { id: 9, quantity: 6, id_product: 10, details: 'EXCEDENTE TRASPASO #TRAS00044', registry_number: 'ING-000044' },
    ],
  });
  const projection = await service.getProjection(44);
  assert.equal(projection.items[0].evidence_confidence, 'AMBIGUA');
  assert.equal(projection.items[0].allowed_action, null);
});

test('completa un excedente con Kardex solamente y el reintento es idempotente', async (t) => {
  const movements = [];
  const notes = [];
  const completions = [];
  let kardexBalance = 100;
  const transferRow = transfer([detail(1, 10, 100, 110)], notes, completions);
  t.mock.method(db.Transfers, 'findByPk', async () => transferRow);
  t.mock.method(db.Stock, 'findAll', async () => [{ id_product: 10, stock: 110 }]);
  t.mock.method(db.Product, 'findAll', async () => [product(10)]);
  t.mock.method(db.kardexMovements, 'findAll', async () => movements);
  t.mock.method(db.kardexMovements, 'create', async (values) => {
    const movement = { ...values, id: 80 + movements.length };
    movements.push(movement);
    kardexBalance += Number(values.quantity);
    return movement;
  });
  t.mock.method(db.sequelize, 'query', async (sql) => (
    sql.includes('GROUP BY id_product') ? [{ id_product: 10, quantity: 100 }] : [{ id_product: 10, saldo: kardexBalance }]
  ));
  let transactionQueue = Promise.resolve();
  t.mock.method(db.sequelize, 'transaction', async (callback) => {
    const previous = transactionQueue;
    let release;
    transactionQueue = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); } finally { release(); }
  });
  t.mock.method(db.TransferHistoricalDifferenceCompletion, 'findOne', async ({ where }) => completions.find(({ idempotency_key: key }) => key === where.idempotency_key) || null);
  t.mock.method(db.TransferHistoricalDifferenceCompletion, 'create', async (values) => {
    const completion = { ...values, id: 1 };
    completions.push(completion);
    return completion;
  });
  t.mock.method(db.TransferReviewNote, 'create', async (values) => {
    const note = {
      ...values,
      id: 30,
      management_status: 'ACTIVA',
      details: [],
      kardexMovement: movements.find(({ id }) => id === values.id_kardex_movement),
      async save() {},
    };
    notes.push(note);
    return note;
  });
  t.mock.method(db.TransferReviewNoteDetail, 'bulkCreate', async (values) => values.map((value, index) => {
    const created = { ...value, id: index + 1 };
    notes[0].details.push(created);
    return created;
  }));
  t.mock.method(db.TransferReviewNoteDetail, 'findAll', async () => notes[0]?.details || []);
  t.mock.method(db.TransferReviewInventoryHold, 'bulkCreate', async (values) => values);
  t.mock.method(db.TransferReviewEvent, 'create', async (values) => ({ ...values, id: 1 }));
  t.mock.method(db.User, 'findAll', async () => []);
  t.mock.method(db.History, 'create', async (values) => values);

  const preview = await service.previewCompletion({ transferId: 44, detailId: 1 });
  await assert.rejects(service.completeDifference({
    transferId: 44, detailId: 1, previewFingerprint: 'obsolete', reason: 'Registro histórico verificado',
    idempotencyKey: 'historical-surplus-obsolete', actorUserId: 9,
  }), /cambiaron desde la previsualización/);
  assert.equal(movements.length, 0);

  const concurrent = await Promise.allSettled([
    service.completeDifference({
      transferId: 44, detailId: 1, previewFingerprint: preview.fingerprint, reason: 'Registro histórico verificado',
      idempotencyKey: 'historical-surplus-44-1', actorUserId: 9,
    }),
    service.completeDifference({
      transferId: 44, detailId: 1, previewFingerprint: preview.fingerprint, reason: 'Registro histórico verificado',
      idempotencyKey: 'historical-surplus-44-2', actorUserId: 9,
    }),
  ]);
  assert.equal(concurrent.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter(({ status }) => status === 'rejected').length, 1);
  const result = concurrent.find(({ status }) => status === 'fulfilled').value;
  assert.equal(result.idempotent, false);
  assert.equal(movements.length, 1);
  assert.equal(movements[0].quantity, 10);
  assert.equal(completions.length, 1);
  assert.equal(result.projection.items[0].reconciliation_status, 'COMPLETO');

  const retried = await service.completeDifference({
    transferId: 44,
    detailId: 1,
    previewFingerprint: preview.fingerprint,
    reason: 'Registro histórico verificado',
    idempotencyKey: 'historical-surplus-44-1',
    actorUserId: 9,
  });
  assert.equal(retried.idempotent, true);
  assert.equal(movements.length, 1);
});

test('completa varios faltantes en Stock y Kardex del producto MERMAS en una transacción', async (t) => {
  const movements = [];
  const notes = [];
  const completions = [];
  const stocks = new Map([[10, 95], [11, 48], [22, 0]]);
  const kardex = new Map([[10, 95], [11, 48], [22, 0]]);
  const merma = product(22, 'MP-MER-001', 'Merma traslado', { id: 5, name: 'MERMAS', type: 'RAW_MATERIAL', status: true });
  const transferRow = transfer([detail(1, 10, 100, 95), detail(2, 11, 50, 48)], notes, completions);
  t.mock.method(db.Transfers, 'findByPk', async () => transferRow);
  t.mock.method(db.Stock, 'findAll', async () => [...stocks].map(([idProduct, stock]) => ({ id_product: idProduct, stock })));
  t.mock.method(db.Stock, 'findOne', async ({ where }) => ({
    id_product: Number(where.id_product),
    stock: stocks.get(Number(where.id_product)) || 0,
    async save() { stocks.set(Number(this.id_product), Number(this.stock)); },
  }));
  t.mock.method(db.Product, 'findAll', async () => [product(10), product(11), merma]);
  t.mock.method(db.Product, 'findOne', async ({ where }) => Number(where.id) === 22 ? merma : null);
  t.mock.method(db.kardexMovements, 'findAll', async () => movements);
  t.mock.method(db.kardexMovements, 'create', async (values) => {
    const movement = { ...values, id: 90 + movements.length };
    movements.push(movement);
    kardex.set(Number(values.id_product), Number(kardex.get(Number(values.id_product)) || 0) + Number(values.quantity));
    return movement;
  });
  t.mock.method(db.sequelize, 'query', async (sql) => {
    if (sql.includes('GROUP BY id_product')) return [{ id_product: 10, quantity: 95 }, { id_product: 11, quantity: 48 }];
    return [...kardex].map(([idProduct, saldo]) => ({ id_product: idProduct, saldo }));
  });
  t.mock.method(db.sequelize, 'transaction', async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
  t.mock.method(db.TransferHistoricalDifferenceCompletion, 'findOne', async ({ where }) => completions.find(({ idempotency_key: key }) => key === where.idempotency_key) || null);
  t.mock.method(db.TransferHistoricalDifferenceCompletion, 'create', async (values) => {
    const completion = { ...values, id: 2 };
    completions.push(completion);
    return completion;
  });
  t.mock.method(db.TransferReviewNote, 'create', async (values) => {
    const note = {
      ...values,
      id: 31,
      management_status: 'ACTIVA',
      details: [],
      kardexMovement: movements.find(({ id }) => id === values.id_kardex_movement),
      async save() {},
    };
    notes.push(note);
    return note;
  });
  t.mock.method(db.TransferReviewNoteDetail, 'bulkCreate', async (values) => values.map((value, index) => {
    const created = { ...value, id: index + 1 };
    notes[0].details.push(created);
    return created;
  }));
  t.mock.method(db.TransferReviewNoteDetail, 'findAll', async () => notes[0]?.details || []);
  t.mock.method(db.TransferReviewInventoryHold, 'bulkCreate', async (values) => values);
  t.mock.method(db.TransferReviewEvent, 'create', async (values) => ({ ...values, id: 1 }));
  t.mock.method(db.User, 'findAll', async () => []);
  t.mock.method(db.History, 'create', async (values) => values);

  const preview = await service.previewCompletion({ transferId: 44, detailId: 1, mermaProductId: 22 });
  assert.equal(preview.action.quantity, 7);
  assert.equal(preview.allocations.length, 2);
  const result = await service.completeDifference({
    transferId: 44,
    detailId: 1,
    mermaProductId: 22,
    previewFingerprint: preview.fingerprint,
    reason: 'Faltante histórico verificado',
    idempotencyKey: 'historical-shortage-44',
    actorUserId: 9,
  });
  assert.equal(stocks.get(22), 7);
  assert.equal(kardex.get(22), 7);
  assert.equal(movements.length, 1);
  assert.equal(completions[0].allocations.length, 2);
  assert.ok(result.projection.items.every(({ reconciliation_status: status }) => status === 'COMPLETO'));
});

test('un fallo tardío revierte movimiento, nota y completado histórico', async (t) => {
  const movements = [];
  const notes = [];
  const completions = [];
  let kardexBalance = 100;
  let rolledBack = false;
  const transferRow = transfer([detail(1, 10, 100, 110)], notes, completions);
  t.mock.method(db.Transfers, 'findByPk', async () => transferRow);
  t.mock.method(db.Stock, 'findAll', async () => [{ id_product: 10, stock: 110 }]);
  t.mock.method(db.Product, 'findAll', async () => [product(10)]);
  t.mock.method(db.kardexMovements, 'findAll', async () => movements);
  t.mock.method(db.kardexMovements, 'create', async (values) => {
    const movement = { ...values, id: 99 };
    movements.push(movement);
    kardexBalance += Number(values.quantity);
    return movement;
  });
  t.mock.method(db.sequelize, 'query', async (sql) => (
    sql.includes('GROUP BY id_product') ? [{ id_product: 10, quantity: 100 }] : [{ id_product: 10, saldo: kardexBalance }]
  ));
  t.mock.method(db.sequelize, 'transaction', async (callback) => {
    try {
      return await callback({ LOCK: { UPDATE: 'UPDATE' } });
    } catch (error) {
      rolledBack = true;
      movements.length = 0;
      notes.length = 0;
      completions.length = 0;
      kardexBalance = 100;
      throw error;
    }
  });
  t.mock.method(db.TransferHistoricalDifferenceCompletion, 'findOne', async () => null);
  t.mock.method(db.TransferHistoricalDifferenceCompletion, 'create', async (values) => {
    const completion = { ...values, id: 1 };
    completions.push(completion);
    return completion;
  });
  t.mock.method(db.TransferReviewNote, 'create', async (values) => {
    const note = { ...values, id: 30, management_status: 'ACTIVA', details: [], kardexMovement: movements[0], async save() {} };
    notes.push(note);
    return note;
  });
  t.mock.method(db.TransferReviewNoteDetail, 'bulkCreate', async (values) => values.map((value, index) => {
    const created = { ...value, id: index + 1 };
    notes[0].details.push(created);
    return created;
  }));
  t.mock.method(db.TransferReviewNoteDetail, 'findAll', async () => notes[0]?.details || []);
  t.mock.method(db.TransferReviewInventoryHold, 'bulkCreate', async (values) => values);
  t.mock.method(db.TransferReviewEvent, 'create', async (values) => ({ ...values, id: 1 }));
  t.mock.method(db.User, 'findAll', async () => []);
  t.mock.method(db.History, 'create', async () => { throw new Error('Fallo de auditoría'); });

  const preview = await service.previewCompletion({ transferId: 44, detailId: 1 });
  await assert.rejects(service.completeDifference({
    transferId: 44, detailId: 1, previewFingerprint: preview.fingerprint, reason: 'Registro histórico verificado',
    idempotencyKey: 'historical-rollback-44', actorUserId: 9,
  }), /Fallo de auditoría/);
  assert.equal(rolledBack, true);
  assert.equal(movements.length, 0);
  assert.equal(notes.length, 0);
  assert.equal(completions.length, 0);
});
