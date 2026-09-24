'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { presentationStatus, matchesFilters } = require('../services/reception-difference-reconciliation-list.service');
const listService = require('../services/reception-difference-reconciliation-list.service');
const historicalService = require('../services/historical-transfer-difference.service');
const db = require('../database/config');
const { getReceptionDifferences } = require('../controllers/transfer_review_notes.controller');

const responseRecorder = () => {
  const result = {};
  return {
    result,
    response: {
      status(status) {
        result.status = status;
        return { json(body) { result.body = body; return body; } };
      },
    },
  };
};

test('normaliza el estado histórico para la lista central', () => {
  assert.equal(presentationStatus('EXCEDENTE_PENDIENTE_KARDEX'), 'PENDIENTE');
  assert.equal(presentationStatus('FALTANTE_PENDIENTE_MERMA'), 'PENDIENTE');
  assert.equal(presentationStatus('PARCIAL'), 'PARCIAL');
  assert.equal(presentationStatus('COMPLETO'), 'RESUELTA');
  assert.equal(presentationStatus('DIFERENCIA_NO_ATRIBUIBLE'), 'NO_ATRIBUIBLE');
});

test('filtra una diferencia por estado, tipo y texto de boleta o producto', () => {
  const row = {
    status: 'PENDIENTE',
    transfer: { cod: 'TRAS00326', registry_number: '10856' },
    item: { difference_type: 'FALTANTE', product: { cod: 'MP-AL-TEN-002', name: 'Aluminio tense sucio' } },
  };
  assert.equal(matchesFilters(row, { status: 'PENDIENTE', type: 'FALTANTE', query: 'tras00326' }), true);
  assert.equal(matchesFilters(row, { status: 'RESUELTA', type: 'FALTANTE', query: '' }), false);
  assert.equal(matchesFilters(row, { status: '', type: 'EXCEDENTE', query: '' }), false);
  assert.equal(matchesFilters(row, { status: '', type: '', query: 'tense sucio' }), true);
});

test('incluye una boleta sin nota de revisión cuando su proyección contiene una diferencia', async (t) => {
  t.mock.method(db.Transfers, 'findAll', async () => [{
    id: 44,
    toJSON: () => ({
      id: 44, cod: 'TRAS00044', registry_number: 'ING-44', date_received: '2026-09-03T10:00:00.000Z',
      id_sucursal_received: 2, id_storage_received: 4,
      sucursal_received: { id: 2, name: 'Sucursal' }, storage_received: { id: 4, name: 'Almacén' },
    }),
  }]);
  t.mock.method(historicalService, 'getProjection', async () => ({
    items: [{
      id: 8, difference_type: 'EXCEDENTE', sent: 100, received: 110, difference_expected: 10,
      reconciliation_status: 'EXCEDENTE_PENDIENTE_KARDEX', allowed_action: { code: 'REGISTRAR_EXCEDENTE_OMITIDO' },
      difference_movements: [], registered_product: null, message: 'Falta Kardex.', product: { cod: 'P-1', name: 'Producto' },
    }],
  }));
  const result = await listService.list({ idSucursal: 2, idStorage: 4, status: 'PENDIENTE', page: 1, limit: 25 });
  assert.equal(result.total, 1);
  assert.equal(result.data[0].transfer.cod, 'TRAS00044');
  assert.equal(result.data[0].items[0].status, 'PENDIENTE');
  assert.equal(result.data[0].items[0].has_review_note, false);
});

test('la consulta exige el contexto de almacén y no consulta datos sin él', async (t) => {
  let calls = 0;
  t.mock.method(listService, 'list', async () => { calls += 1; return {}; });
  const { result, response } = responseRecorder();
  await getReceptionDifferences({ query: { id_sucursal: '2' }, userAuth: { role: 'ADMINISTRADOR' } }, response);
  assert.equal(result.status, 422);
  assert.equal(calls, 0);
});

test('la consulta limita el contexto autorizado y propaga filtros de sólo lectura', async (t) => {
  let received;
  t.mock.method(listService, 'list', async (filters) => {
    received = filters;
    return { data: [], total: 0, page: 1, limit: 25, summary: { pendiente: 0, parcial: 0, resuelta: 0, no_atribuible: 0, total: 0 } };
  });
  const { result, response } = responseRecorder();
  await getReceptionDifferences({
    query: { id_sucursal: '2', id_storage: '4', status: 'PENDIENTE', type: 'FALTANTE', query: 'TRAS', page: '1', limit: '25' },
    userAuth: { role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 2 }] },
  }, response);
  assert.equal(result.status, 200);
  assert.equal(received.idSucursal, 2);
  assert.equal(received.idStorage, 4);
  assert.equal(received.status, 'PENDIENTE');
  assert.equal(received.type, 'FALTANTE');
  assert.equal(received.query, 'TRAS');
});
