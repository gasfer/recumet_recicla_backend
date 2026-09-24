'use strict';

/**
 * §5.1 — Pruebas del diagnóstico extendido.
 *
 * Verifica que el diagnóstico indique:
 *  - Dirección: STOCK_MAYOR_QUE_KARDEX / KARDEX_MAYOR_QUE_STOCK
 *  - Magnitud: valor absoluto de la diferencia
 *  - Antigüedad: días desde la última actualización de Stock
 *  - Candidatos: relaciones marcadas como CANDIDATA o CONFIRMADA
 *
 * Confirma que ninguna relación automática autoriza corrección.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const { getStockDiagnostic } = require('../services/stock-availability.service');

const oldDate = new Date('2026-01-01T00:00:00.000Z');
const recentDate = new Date('2026-09-04T10:00:00.000Z');

const baseRow = (overrides = {}) => ({
  cod: 'MP-001', name: 'MATERIAL',
  id_product: '1', id_sucursal: '1', id_storage: '1',
  physical_stock: '120',
  stock_in_review: '0', available_stock: '120',
  kardex_balance: '100',
  physical_kardex_difference: '20',
  stock_updated_at: recentDate.toISOString(),
  kardex_last_id: '90',
  ...overrides,
});

const transferRow = (confidence = 'CANDIDATA') => ({
  id_product: 1,
  transfer_id: 313, transfer_cod: 'TRAS00313',
  detail_id: 100,
  id_sucursal_received: 1, id_storage_received: 1,
  quantity_sent: '100', quantity_received: '80', quantity_difference: '-20',
  review_note_id: confidence === 'CONFIRMADA' ? 9 : null,
  review_note_registry: confidence === 'CONFIRMADA' ? 'REV-009' : null,
  review_note_type: confidence === 'CONFIRMADA' ? 'FALTANTE_PARA_REVISION' : null,
  review_note_status: confidence === 'CONFIRMADA' ? 'EN_REVISION' : null,
  relation_confidence: confidence,
});

// ─── §5.1 Dirección y magnitud ────────────────────────────────────────────────

test('§5.1 Stock mayor que Kardex: dirección y magnitud correctas', async (t) => {
  let call = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    call += 1;
    return call === 1 ? [baseRow()] : [];
  });

  const rows = await getStockDiagnostic({ idSucursal: 1, idStorage: 1 });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].direction, 'STOCK_MAYOR_QUE_KARDEX');
  assert.equal(rows[0].magnitude, 20);
});

test('§5.1 Kardex mayor que Stock: dirección y magnitud correctas', async (t) => {
  let call = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    call += 1;
    return call === 1 ? [baseRow({ physical_stock: '80', physical_kardex_difference: '-20' })] : [];
  });

  const rows = await getStockDiagnostic({ idSucursal: 1, idStorage: 1 });

  assert.equal(rows[0].direction, 'KARDEX_MAYOR_QUE_STOCK');
  assert.equal(rows[0].magnitude, 20, 'magnitud es siempre positiva (valor absoluto)');
});

// ─── §5.1 Antigüedad ─────────────────────────────────────────────────────────

test('§5.1 antigüedad en días calculada desde stock_updated_at', async (t) => {
  let call = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    call += 1;
    return call === 1 ? [baseRow({ stock_updated_at: oldDate.toISOString() })] : [];
  });

  const rows = await getStockDiagnostic({ idSucursal: 1, idStorage: 1 });
  const ageInDays = rows[0].age_in_days;

  // La fecha de referencia en las pruebas es 2026-09-05; oldDate es 2026-01-01 = ~247 días
  assert.ok(typeof ageInDays === 'number', 'age_in_days debe ser un número');
  assert.ok(ageInDays > 200, `debe ser mayor a 200 días (fue ${ageInDays})`);
});

test('§5.1 antigüedad es null cuando stock_updated_at no está disponible', async (t) => {
  let call = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    call += 1;
    return call === 1 ? [baseRow({ stock_updated_at: null })] : [];
  });

  const rows = await getStockDiagnostic({ idSucursal: 1, idStorage: 1 });
  assert.equal(rows[0].age_in_days, null);
});

// ─── §5.1 Candidatos: CANDIDATA vs CONFIRMADA ────────────────────────────────

test('§5.1 relación candidata NO autoriza corrección por sí sola', async (t) => {
  let call = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    call += 1;
    return call === 1 ? [baseRow()] : [transferRow('CANDIDATA')];
  });

  const rows = await getStockDiagnostic({ idSucursal: 1, idStorage: 1 });
  const candidates = rows[0].traceable_transfers;

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].relation_confidence, 'CANDIDATA');
  assert.equal(rows[0].has_confirmed_relation, false, 'CANDIDATA no es CONFIRMADA');
});

test('§5.1 relación confirmada (con nota de revisión) se distingue de candidata', async (t) => {
  let call = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    call += 1;
    return call === 1 ? [baseRow()] : [transferRow('CONFIRMADA')];
  });

  const rows = await getStockDiagnostic({ idSucursal: 1, idStorage: 1 });
  const candidates = rows[0].traceable_transfers;

  assert.equal(candidates[0].relation_confidence, 'CONFIRMADA');
  assert.equal(rows[0].has_confirmed_relation, true);
  // Incluso CONFIRMADA: la interfaz muestra la relación pero no corrige automáticamente
  assert.ok(candidates[0].review_note_registry, 'debe incluir número de boleta vinculada');
});

// ─── §5.1 Sin traslados identificables ───────────────────────────────────────

test('§5.1 sin traslados candidatos: candidate_document_count=0 y desfase se mantiene en investigación', async (t) => {
  let call = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    call += 1;
    return call === 1 ? [baseRow()] : [];
  });

  const rows = await getStockDiagnostic({ idSucursal: 1, idStorage: 1 });

  assert.equal(rows[0].candidate_document_count, 0);
  assert.equal(rows[0].traceable_transfers.length, 0);
  assert.equal(rows[0].has_confirmed_relation, false);
});
