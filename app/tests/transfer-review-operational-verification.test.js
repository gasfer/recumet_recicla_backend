'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const operationalVerificationService = require('../services/transfer-review-operational-verification.service');

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const excessNote = {
  id: 1,
  type: 'EXCEDENTE_PARA_REVISION',
  id_transfer: 10,
  id_sucursal: 2,
  id_storage: 20,
};
const shortageNote = {
  ...excessNote,
  type: 'FALTANTE_PARA_REVISION',
};
const detail = { id: 3, id_product: 30 };

test('bloquea la conciliacion cuando no se registra una operacion real', async () => {
  await assert.rejects(() => operationalVerificationService.verifyOperationalResolution({
    note: excessNote,
    detail,
    references: [{ document_type: 'ACTA_REGULARIZACION', document_number: 'ACT-1' }],
    quantity: 5,
    transaction,
  }), /aún no está regularizada.*primero realice/i);
});

test('acepta una clasificacion activa del mismo producto y con salida a merma suficiente', async (t) => {
  t.mock.method(db.Classified, 'findOne', async () => ({
    id: 70,
    cod: 'CL00070',
    number_registry: 'SFCL-70',
    quantity_product: '8.0000',
  }));
  t.mock.method(db.DetailsClassified, 'findAll', async () => [{ quantity: '8.0000' }]);
  let queryCount = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    queryCount += 1;
    return queryCount === 1 ? [[], {}] : [[{ used_quantity: '0' }], {}];
  });

  const result = await operationalVerificationService.verifyOperationalResolution({
    note: excessNote,
    detail,
    references: [{ document_type: 'NOTA_CLASIFICACION_MERMA', document_number: 'CL00070' }],
    quantity: 8,
    transaction,
  });

  assert.equal(result.documentType, 'NOTA_CLASIFICACION_MERMA');
  assert.equal(result.documentId, 70);
  assert.equal(result.documentQuantity, 8);
});

test('bloquea un traslado complementario que todavía no fue recibido', async (t) => {
  t.mock.method(db.Transfers, 'findByPk', async () => ({
    id: 10,
    id_sucursal_send: 1,
    id_storage_send: 10,
  }));
  t.mock.method(db.Transfers, 'findOne', async () => null);

  await assert.rejects(() => operationalVerificationService.verifyOperationalResolution({
    note: shortageNote,
    detail,
    references: [{ document_type: 'NOTA_TRASLADO_COMPLEMENTARIO', document_number: 'TRAS00999' }],
    quantity: 5,
    transaction,
  }), /no se encontró un traslado recibido.*primero complete/i);
});

test('excluye el traslado original de la búsqueda del traslado correctivo', async (t) => {
  t.mock.method(db.Transfers, 'findByPk', async () => ({
    id: 10,
    id_sucursal_send: 1,
    id_storage_send: 10,
  }));
  t.mock.method(db.Transfers, 'findOne', async ({ where }) => {
    const notEqualSymbol = Object.getOwnPropertySymbols(where.id)
      .find((symbol) => symbol.description === 'ne');
    assert.equal(where.id[notEqualSymbol], 10);
    return null;
  });

  await assert.rejects(() => operationalVerificationService.verifyOperationalResolution({
    note: shortageNote,
    detail,
    references: [{ document_type: 'NOTA_TRASLADO_COMPLEMENTARIO', document_number: 'TRAS00010' }],
    quantity: 5,
    transaction,
  }), /no se encontró un traslado recibido/i);
});
