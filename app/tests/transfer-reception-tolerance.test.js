'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ValuedKardexService } = require('../services/valued-kardex.service');
const {
  ACCOUNTING_STATUSES,
  TOLERANCE_DECISIONS,
  evaluateReceiptTolerance,
} = require('../services/transfer-reception-tolerance.service');

test('acepta los límites inclusivos de -1% y +1%', () => {
  for (const received of [99, 101]) {
    const result = evaluateReceiptTolerance(100, received);
    assert.equal(result.decision, TOLERANCE_DECISIONS.ACCEPTED);
    assert.equal(result.accountingStatus, ACCOUNTING_STATUSES.ACCOUNTED);
  }
});

test('requiere conciliación fuera del límite', () => {
  const result = evaluateReceiptTolerance(100, 101.01);
  assert.equal(result.decision, TOLERANCE_DECISIONS.REQUIRES_REVIEW);
  assert.equal(result.accountingStatus, ACCOUNTING_STATUSES.ACCOUNTED);
  assert.equal(result.differencePercentage, 1.01);
});

test('no evalúa automáticamente una cantidad enviada igual a cero', () => {
  const result = evaluateReceiptTolerance(0, 5);
  assert.equal(result.decision, TOLERANCE_DECISIONS.UNDETERMINED);
  assert.equal(result.accountingStatus, ACCOUNTING_STATUSES.ACCOUNTED);
  assert.equal(result.differencePercentage, null);
});

test('applyBlockedShortageReceipt contabiliza recepción normal y bloquea diferencia en producto temporal', async (t) => {
  const { applyBlockedShortageReceipt } = require('../services/transfer-reception-inventory.service');
  const db = require('../database/config');
  const createdStocks = [];
  const createdMovements = [];

  t.mock.method(db.Stock, 'findOne', async ({ where }) => createdStocks.find((stock) => (
    stock.id_product === where.id_product
      && stock.id_sucursal === where.id_sucursal
      && stock.id_storage === where.id_storage
  )) || null);
  t.mock.method(db.Stock, 'create', async (data) => {
    const stock = { ...data, save: async () => {} };
    createdStocks.push(stock);
    return stock;
  });
  t.mock.method(db.kardexMovements, 'create', async (data) => {
    createdMovements.push(data);
    return { id: 99, ...data };
  });
  t.mock.method(db.kardexMovements, 'findOne', async () => null);
  const valued = [];
  t.mock.method(ValuedKardexService.prototype, 'recordMovement', async (command) => {
    valued.push(command);
    return { id: valued.length, output_value: 0, applied_unit_cost: command.unitCost ?? null };
  });

  const transfer = {
    id: 1, cod: 'TRAS00001', registry_number: 'SF-00001',
    date_received: '2026-09-09', id_sucursal_received: 2, id_storage_received: 3,
  };
  const shortageDetails = [
    { detail: { id: 10, id_product: 50, quantity: 100 }, quantityReceived: 90 },
  ];
  const mermaProduct = { id: 200, name: 'MERMA GENERAL' };

  const result = await applyBlockedShortageReceipt({
    transfer,
    shortageDetails,
    mermaProduct,
    userId: 5,
    transaction: {},
  });

  assert.equal(result.totalShortage, 10);
  assert.equal(createdStocks.length, 2);
  assert.deepEqual(createdStocks.map(({ id_product, stock }) => ({ id_product, stock })), [
    { id_product: 50, stock: 90 },
    { id_product: 200, stock: 10 },
  ]);
  assert.equal(createdMovements.length, 1);
  assert.equal(createdMovements[0].id_product, 200);
  assert.equal(createdMovements[0].quantity, 10);
  assert.equal(createdMovements[0].details, 'MERMA TRASPASO #TRAS00001');
  assert.equal(createdMovements[0].cost, null, 'Una merma sin base de costo debe quedar sin valorar, no con costo cero.');
  assert.equal(valued.length, 2);
  assert.equal(valued[1].unitCost, null);
  assert.equal(valued[1].allowUnvalued, true);
});

test('applyBlockedShortageReceipt rechaza operación si producto de diferencias no está disponible', async () => {
  const { applyBlockedShortageReceipt } = require('../services/transfer-reception-inventory.service');
  const transfer = { id: 1, cod: 'TRAS00001', id_sucursal_received: 2, id_storage_received: 3 };
  const shortageDetails = [
    { detail: { id: 10, id_product: 50, quantity: 100 }, quantityReceived: 90 },
  ];

  await assert.rejects(
    () => applyBlockedShortageReceipt({ transfer, shortageDetails, mermaProduct: null, userId: 5, transaction: {} }),
    (err) => err.statusCode === 422 && /categoría de diferencias/.test(err.message)
  );
});

test('applyBlockedExcessReceipt contabiliza stock físico y movimiento de excedente', async (t) => {
  const { applyBlockedExcessReceipt } = require('../services/transfer-reception-inventory.service');
  const db = require('../database/config');
  const createdStocks = [];
  const createdMovements = [];

  t.mock.method(db.Stock, 'findOne', async ({ where }) => createdStocks.find((stock) => (
    stock.id_product === where.id_product
      && stock.id_sucursal === where.id_sucursal
      && stock.id_storage === where.id_storage
  )) || null);
  t.mock.method(db.Stock, 'create', async (data) => {
    const stock = { ...data, save: async () => {} };
    createdStocks.push(stock);
    return stock;
  });
  t.mock.method(db.kardexMovements, 'create', async (data) => {
    createdMovements.push(data);
    return { id: 101, ...data };
  });
  t.mock.method(db.kardexMovements, 'findOne', async () => null);
  const valued = [];
  t.mock.method(ValuedKardexService.prototype, 'recordMovement', async (command) => {
    valued.push(command);
    return { id: valued.length, output_value: 0, applied_unit_cost: command.unitCost ?? null };
  });

  const transfer = {
    id: 1, cod: 'TRAS00001', registry_number: 'SF-00001',
    date_received: '2026-09-09', id_sucursal_received: 2, id_storage_received: 3,
  };
  const detail = { id: 10, id_product: 50, quantity: 100, cost: 12.5 };

  const result = await applyBlockedExcessReceipt({
    transfer,
    detail,
    quantityReceived: 110,
    userId: 5,
    transaction: {},
  });

  assert.equal(result.excess, 10);
  assert.equal(createdStocks.length, 1);
  assert.equal(createdStocks[0].stock, 110);
  assert.equal(createdMovements.length, 1);
  assert.equal(createdMovements[0].details, 'EXCEDENTE TRASPASO #TRAS00001');
  assert.equal(createdMovements[0].quantity, 10);
  assert.equal(createdMovements[0].cost, 12.5);
  assert.equal(valued.length, 2);
});

test('impide que la retención de un excedente se libere dos veces', async (t) => {
  const resolutionService = require('../services/automated-transfer-review-resolution.service');
  const db = require('../database/config');
  const row = (data) => ({ ...data, save: async () => {}, destroy: async () => {} });

  const note = row({
    id: 1, management_status: 'ACTIVA', type: 'EXCEDENTE_PARA_REVISION', id_product: 90,
    id_sucursal: 2, id_storage: 20, registry_number: 'REV-1', transfer: { id_sucursal_send: 3, id_storage_send: 30, id_sucursal_received: 2 },
  });
  // detail con pending 0 (ya resuelto)
  const detail = row({
    id: 5, id_product: 90, quantity_difference: 10, quantity_resolved: 10,
    updatedAt: new Date(), transferDetail: { cost: 5 },
  });

  t.mock.method(db.sequelize, 'transaction', async (cb) => cb({ LOCK: { UPDATE: 'UPDATE' } }));
  t.mock.method(db.TransferReviewNote, 'findByPk', async () => note);
  t.mock.method(db.TransferReviewNoteDetail, 'findOne', async () => detail);
  t.mock.method(db.TransferReviewResolutionAction, 'findAll', async () => []);
  t.mock.method(db.TransferReviewResolutionAction, 'findOne', async () => null);
  t.mock.method(db.User, 'findOne', async () => ({ id: 1, role: 'ADMINISTRADOR' }));

  await assert.rejects(
    () => resolutionService.confirm({
      noteId: 1,
      detailId: 5,
      solutionCode: 'REGISTER_RECEIPT_SURPLUS',
      reasonCode: 'OPERATIONAL_SURPLUS',
      justification: 'Justificación operativa válida de más de diez caracteres.',
      authorizerUserId: 1,
      quantity: 10,
      actorUserId: 2,
    }),
    (err) => err.statusCode === 409 && /Ya se registró esta conciliación/.test(err.message)
  );
});

test('evaluación y manejo de ítem con cero enviado en recepción', () => {
  const result = evaluateReceiptTolerance(0, 15);
  assert.equal(result.decision, TOLERANCE_DECISIONS.UNDETERMINED);
  assert.equal(result.accountingStatus, ACCOUNTING_STATUSES.ACCOUNTED);
  assert.equal(result.differencePercentage, null);
});

test('boleta mixta: todos los pesos físicos se contabilizan y sólo la decisión queda pendiente de revisión', () => {
  const itemExact = evaluateReceiptTolerance(100, 100);
  const itemAcceptedShortage = evaluateReceiptTolerance(100, 99.5);
  const itemAcceptedExcess = evaluateReceiptTolerance(100, 100.8);
  const itemBlockedExcess = evaluateReceiptTolerance(100, 105);
  const itemBlockedShortage = evaluateReceiptTolerance(100, 85);
  const itemUndetermined = evaluateReceiptTolerance(0, 10);

  assert.equal(itemExact.decision, TOLERANCE_DECISIONS.ACCEPTED);
  assert.equal(itemExact.accountingStatus, ACCOUNTING_STATUSES.ACCOUNTED);

  assert.equal(itemAcceptedShortage.decision, TOLERANCE_DECISIONS.ACCEPTED);
  assert.equal(itemAcceptedShortage.accountingStatus, ACCOUNTING_STATUSES.ACCOUNTED);

  assert.equal(itemAcceptedExcess.decision, TOLERANCE_DECISIONS.ACCEPTED);
  assert.equal(itemAcceptedExcess.accountingStatus, ACCOUNTING_STATUSES.ACCOUNTED);

  assert.equal(itemBlockedExcess.decision, TOLERANCE_DECISIONS.REQUIRES_REVIEW);
  assert.equal(itemBlockedExcess.accountingStatus, ACCOUNTING_STATUSES.ACCOUNTED);

  assert.equal(itemBlockedShortage.decision, TOLERANCE_DECISIONS.REQUIRES_REVIEW);
  assert.equal(itemBlockedShortage.accountingStatus, ACCOUNTING_STATUSES.ACCOUNTED);

  assert.equal(itemUndetermined.decision, TOLERANCE_DECISIONS.UNDETERMINED);
  assert.equal(itemUndetermined.accountingStatus, ACCOUNTING_STATUSES.ACCOUNTED);
});
