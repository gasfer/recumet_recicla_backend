'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, Provider, ProviderCompany } = require('../database/config');
const service = require('../services/provider.service');

const emptyMatches = () => ({ number_document: null, cellphone: null, full_names: null });

test('rechaza CI/NIT y celular ya asignados, aunque la clasificación sea diferente', async t => {
  for (const field of ['number_document', 'cellphone']) {
    const matches = emptyMatches();
    matches[field] = { id: 4, full_names: 'PROVEEDOR EXISTENTE', kind: 'provider' };
    t.mock.method(service, 'findIdentityDuplicates', async () => matches);
    await assert.rejects(
      () => service.assertIdentityAvailable({ number_document: '123', cellphone: '71234567', full_names: 'NUEVO' }),
      error => error.statusCode === 409 && error.message.includes(field === 'number_document' ? 'CI/NIT' : 'celular'),
    );
    t.mock.restoreAll();
  }
});

test('el nombre exacto sin CI/NIT ni celular exige revisar o reutilizar la ficha existente', async t => {
  const matches = { ...emptyMatches(), full_names: { id: 8, full_names: 'RECICLADORA DEL SUR', kind: 'company' } };
  t.mock.method(service, 'findIdentityDuplicates', async () => matches);

  await assert.rejects(
    () => service.assertIdentityAvailable({ full_names: 'Recicladora del Sur' }),
    error => error.statusCode === 409 && error.field === 'full_names' && error.message.includes('RECICLADORA DEL SUR'),
  );
});

test('un nombre coincidente con identificadores diferentes se informa para revisión sin bloquear homónimos', async t => {
  const matches = { ...emptyMatches(), full_names: { id: 8, full_names: 'JUAN PEREZ', kind: 'provider' } };
  t.mock.method(service, 'findIdentityDuplicates', async () => matches);

  await assert.doesNotReject(() => service.assertIdentityAvailable({
    full_names: 'JUAN PEREZ', number_document: 'CI-999', cellphone: '71234567',
  }));
});

test('bloquea transacciones simultáneas con la misma identidad normalizada', async t => {
  const locks = [];
  t.mock.method(sequelize, 'query', async (_sql, options) => locks.push(options.replacements.key));

  await service.lockProviderIdentity({
    full_names: ' Empresa S.A. ', commercial_name: 'Empresa S.A.',
    number_document: 'ab-123', corporate_cellphone: '+591 71234567',
  }, {});

  assert.deepEqual(locks, ['provider-document:AB123', 'provider-name:EMPRESASA', 'provider-phone:71234567']);
});

test('encuentra variantes aproximadas del nombre en proveedores y empresas', async t => {
  t.mock.method(Provider, 'findOne', async () => null);
  t.mock.method(ProviderCompany, 'findOne', async () => null);
  const approximateCompany = {
    id: 12, full_names: 'RECICLADOR DEL SUR', commercial_name: 'RECISUR',
    number_document: null, cellphone: null, kind: 'company', score: 0.73,
  };
  t.mock.method(sequelize, 'query', async (sql, options) => {
    assert.match(sql, /word_similarity/);
    assert.equal(options.replacements.name, 'RECICLADORADELSUR');
    return [approximateCompany];
  });

  const matches = await service.findIdentityDuplicates({ full_names: 'RECICLADORA DEL SUR' });

  assert.equal(matches.full_names.kind, 'company');
  assert.equal(matches.full_names.match_quality, 'APPROXIMATE');
  assert.equal(matches.duplicate.kind, 'company');
});
