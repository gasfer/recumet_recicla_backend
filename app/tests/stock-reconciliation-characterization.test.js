'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const { getStockDiagnostic, getStockKardexIrregularities } = require('../services/stock-availability.service');
const { syncStocksHandler } = require('../controllers/kardex.controller');

test('1.2 caracterización de consulta y diagnóstico Stock-Kardex: Stock > Kardex, Kardex > Stock y causa desconocida', async (t) => {
  const rows = [
    {
      id_product: 101, cod: 'MP-01', name: 'Cobre', id_sucursal: 1, id_storage: 1,
      stock: 50, physical_stock: 50, stock_in_review: 0, available_stock: 50,
      kardex_balance: 40, physical_kardex_difference: 10,
      stock_updated_at: '2026-08-15T10:00:00.000Z',
    },
    {
      id_product: 102, cod: 'MP-02', name: 'Aluminio', id_sucursal: 1, id_storage: 1,
      stock: 20, physical_stock: 20, stock_in_review: 0, available_stock: 20,
      kardex_balance: 25, physical_kardex_difference: -5,
      stock_updated_at: '2026-08-20T10:00:00.000Z',
    },
    {
      id_product: 103, cod: 'MP-03', name: 'Plomo', id_sucursal: 1, id_storage: 1,
      stock: 30, physical_stock: 30, stock_in_review: 0, available_stock: 30,
      kardex_balance: 15, physical_kardex_difference: 15,
      stock_updated_at: '2026-09-01T10:00:00.000Z',
    },
  ];

  let queryCall = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    queryCall += 1;
    if (queryCall === 1) return rows;
    // Trazabilidad de traslados para candidatos
    return [
      {
        id_product: 101, transfer_id: 501, transfer_cod: 'TRAS-501',
        id_sucursal_received: 1, id_storage_received: 1,
        quantity_sent: 10, quantity_received: 20, quantity_difference: -10,
        review_note_id: 11, review_note_registry: 'REV-011', relation_confidence: 'CONFIRMADA',
      },
    ];
  });

  const diagnostic = await getStockDiagnostic({ idSucursal: 1, idStorage: 1 });
  assert.equal(diagnostic.length, 3);

  // Caso 1: Stock > Kardex con candidato confirmado
  const item1 = diagnostic.find(d => d.id_product === 101);
  assert.equal(item1.direction, 'STOCK_MAYOR_QUE_KARDEX');
  assert.equal(item1.magnitude, 10);
  assert.equal(item1.has_confirmed_relation, true);
  assert.equal(item1.candidate_document_count, 1);

  // Caso 2: Kardex > Stock (falta stock físico o kardex inflado)
  const item2 = diagnostic.find(d => d.id_product === 102);
  assert.equal(item2.direction, 'KARDEX_MAYOR_QUE_STOCK');
  assert.equal(item2.magnitude, 5);
  assert.equal(item2.has_confirmed_relation, false);

  // Caso 3: Causa desconocida sin candidatos vinculados
  const item3 = diagnostic.find(d => d.id_product === 103);
  assert.equal(item3.direction, 'STOCK_MAYOR_QUE_KARDEX');
  assert.equal(item3.magnitude, 15);
  assert.equal(item3.candidate_document_count, 0);

  // Irregularidades normalizadas
  queryCall = 0;
  const irregularities = await getStockKardexIrregularities({ idSucursal: 1, idStorage: 1 });
  assert.equal(irregularities.length, 3);
  assert.equal(irregularities[0].difference_direction, 'STOCK_GREATER_THAN_KARDEX');
  assert.equal(irregularities[1].difference_direction, 'KARDEX_GREATER_THAN_STOCK');
});

test('1.2 y 7.5 syncStocksHandler no altera saldos directamente y deriva a detección de casos individuales', async (t) => {
  let detectCalled = false;
  const req = {
    userAuth: { id: 1, role: 'ADMINISTRADOR' },
    body: { id_sucursal: 1, id_storage: 1 },
  };
  let responseStatus = 0;
  let responseBody = null;
  const res = {
    status(code) { responseStatus = code; return this; },
    json(payload) { responseBody = payload; return this; },
  };

  // Mock de sequelize.query para la detección
  t.mock.method(db.sequelize, 'query', async () => []);
  t.mock.method(db.sequelize, 'transaction', async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }));

  await syncStocksHandler(req, res);

  assert.equal(responseStatus, 200);
  assert.equal(responseBody.ok, true);
  assert.equal(responseBody.inventory_modified, false);
  assert.equal(responseBody.synced, 0);
  assert.match(responseBody.message, /sincronización masiva fue retirada/i);
});
