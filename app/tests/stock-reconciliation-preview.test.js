'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const { STOCK_RECONCILIATION_STRATEGIES: STRATEGIES } = require('../constants/stock-reconciliation');
const { fingerprintFor, previewCase } = require('../services/stock-reconciliation.service');

test('la previsualización usa saldos vigentes y rechaza una huella desactualizada', async (t) => {
  const stockUpdatedAt = new Date('2026-09-05T10:00:00.000Z');
  const currentSnapshot = {
    id_product: 10, id_sucursal: 1, id_storage: 2,
    physical_stock: 12, kardex_balance: 10,
    stock_updated_at: stockUpdatedAt.toISOString(), kardex_last_id: 80,
  };
  const record = {
    id: 5,
    status: 'LISTA_PARA_REGULARIZAR',
    id_product: 10,
    id_sucursal: 1,
    id_storage: 2,
    physical_count: 12,
    selected_strategy: STRATEGIES.REGISTER_MISSING_KARDEX,
    source_reference_code: 'COMP-100',
    fingerprint: fingerprintFor(currentSnapshot),
  };

  t.mock.method(db.StockReconciliationCase, 'findByPk', async () => record);
  t.mock.method(db.Stock, 'findOne', async () => ({ stock: 12, updatedAt: stockUpdatedAt }));
  t.mock.method(db.sequelize, 'query', async () => [{ id: 80, saldo: 10, date: stockUpdatedAt }]);

  const preview = await previewCase(record.id);
  assert.equal(preview.stock_before, 12);
  assert.equal(preview.kardex_before, 10);
  assert.equal(preview.kardex_after, 12);
  assert.equal(preview.difference_after, 0);

  record.fingerprint = fingerprintFor({ ...currentSnapshot, physical_stock: 11 });
  await assert.rejects(() => previewCase(record.id), (error) => (
    error.statusCode === 409 && /cambiaron desde el diagnóstico/.test(error.message)
  ));
});
