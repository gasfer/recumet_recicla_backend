'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../services/provider-company.service');
const providerService = require('../services/provider.service');
const { TypesProvider, Provider } = require('../database/config');

const validCompany = {
  full_names: 'RECICLADORA ANDINA S.R.L.',
  number_document: '1020304050',
  entity_type: 'PRIVATE',
  origin_channel: 'DIRECT_CONTACT',
  relationship_status: 'ACTIVE_PROVIDER',
  requires_certificate: false,
  requires_traceability_report: true,
};

const validSite = {
  id_sucursal: 1,
  frequency: 'MONTHLY',
  service_mode: 'BOTH',
  location: { department: 'Cochabamba', city: 'Cochabamba', address: 'Av. Blanco Galindo', latitude: -17.39, longitude: -66.16 },
  contacts: [{ full_name: 'Ana Pérez', position_area: 'Administración', cellphone: '70000000', is_main_contact: true }],
  materials: [{ id_product: 1, frequency: 'MONTHLY', service_mode: 'BOTH' }],
  bankAccounts: [],
};

test('valida el contrato corporativo y rechaza catálogos desconocidos', () => {
  assert.doesNotThrow(() => service.validateCompany(validCompany));
  assert.throws(() => service.validateCompany({ ...validCompany, entity_type: 'INVALID' }), /catálogo permitido/);
  assert.throws(() => service.validateCompany({ ...validCompany, full_names: '' }), /full_names/);
  assert.throws(() => service.validateCompany({ ...validCompany, contact_priority: 'CRITICAL' }), /prioridad de contacto/);
});

test('la sede exige departamento, dirección, contacto principal y materiales sin sector', async () => {
  await assert.doesNotReject(() => service.validateSite(validSite, true));
  await assert.doesNotReject(() => service.validateSite({ ...validSite, id_sector: undefined, location: { ...validSite.location, city: '' } }, true));
  await assert.rejects(() => service.validateSite({ ...validSite, contacts: [] }, true), /contacto/);
  await assert.rejects(() => service.validateSite({ ...validSite, location: { department: 'La Paz' } }, true), /dirección/);
});

test('para Tipo A permite contactos sin cargo/área, que queda oculto en el formulario', async t => {
  t.mock.method(TypesProvider, 'findByPk', async () => ({ code: 'A' }));
  const site = { ...validSite, id_type_provider: 1, contacts: [{ full_name: 'Ana Pérez', position_area: '', cellphone: '70000000', is_main_contact: true }] };
  await assert.doesNotReject(() => service.validateSite(site, true));
});

test('el registro Tipo A no exige municipio ni cargo del contacto ocultos en el formulario', () => {
  assert.doesNotThrow(() => providerService.validateTypeA({
    full_names: 'Empresa Recicladora', number_document: '1234567890', entity_type: 'PRIVATE',
    frequency: 'MONTHLY', service_mode: 'BOTH', origin_channel: 'DIRECT_CONTACT', relationship_status: 'ACTIVE',
    requires_certificate: false, requires_traceability_report: false,
    branches: [{ is_main: true, status: true, department: 'La Paz', address: 'Av. Principal 100' }],
    contacts: [{ is_main_contact: true, status: true, full_name: 'Ana Pérez', cellphone: '70000000' }],
    materials: [{ status: true, id_category: 1 }],
  }));
});

test('rechaza principales y elementos duplicados en colecciones', () => {
  assert.throws(() => service.validateCollection('contacts', [
    { full_name: 'A', position_area: 'A', cellphone: '1', is_main_contact: true },
    { full_name: 'B', position_area: 'B', cellphone: '2', is_main_contact: true },
  ]), /único contacto principal/);
  assert.throws(() => service.validateCollection('materials', [
    { id_product: 1, frequency: 'MONTHLY', service_mode: 'BOTH' },
    { id_product: 1, frequency: 'MONTHLY', service_mode: 'BOTH' },
  ]), /duplicados/);
  assert.throws(() => service.validateCollection('bankAccounts', [
    { id_bank: 1, account_holder: 'A', account_number: '1', account_type: 'OTRA', currency: 'BOB', is_main: true },
    { id_bank: 1, account_holder: 'B', account_number: '2', account_type: 'OTRA', currency: 'BOB', is_main: true },
  ]), /cuenta principal/);
});

test('sincroniza el tipo comercial en todas las sedes vinculadas', async t => {
  const sites = [{ id: 11, id_type_provider: 1 }, { id: 12, id_type_provider: 2 }];
  const findSites = t.mock.method(Provider, 'findAll', async () => sites);
  const updateSites = t.mock.method(Provider, 'update', async () => [2]);
  const verifyPermission = t.mock.method(providerService, 'assertProviderTypeChangeAllowed', async () => {});
  t.mock.method(providerService, 'getCurrentProviderType', async () => ({ code: 'C' }));
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };

  await service.syncCompanyProviderType({ id: 9 }, 3, { role: 'COMERCIAL' }, transaction);

  assert.equal(findSites.mock.calls.length, 1);
  assert.equal(verifyPermission.mock.calls.length, 2);
  assert.deepEqual(updateSites.mock.calls[0].arguments[0], { id_type_provider: 3, estado_registro: 'VALIDADO' });
  assert.deepEqual(updateSites.mock.calls[0].arguments[1].where, { id_provider_company: 9 });
});

test('no sincroniza tipos si el permiso de clasificación es denegado', async t => {
  t.mock.method(Provider, 'findAll', async () => [{ id: 11, id_type_provider: 1 }]);
  const updateSites = t.mock.method(Provider, 'update', async () => [1]);
  t.mock.method(providerService, 'assertProviderTypeChangeAllowed', async () => { throw Object.assign(new Error('Solo Comercial o Administrador'), { statusCode: 403 }); });
  t.mock.method(providerService, 'getCurrentProviderType', async () => ({ code: 'C' }));
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };

  await assert.rejects(
    () => service.syncCompanyProviderType({ id: 9 }, 3, { role: 'OPERADOR_BALANZA' }, transaction),
    { statusCode: 403 },
  );
  assert.equal(updateSites.mock.calls.length, 0);
});

test('al cambiar un grupo a F deja sus sedes pendientes de validación comercial', async t => {
  t.mock.method(Provider, 'findAll', async () => [{ id: 11, id_type_provider: 1 }]);
  const updateSites = t.mock.method(Provider, 'update', async () => [1]);
  t.mock.method(providerService, 'assertProviderTypeChangeAllowed', async () => {});
  t.mock.method(providerService, 'getCurrentProviderType', async () => ({ code: 'F' }));

  await service.syncCompanyProviderType({ id: 9 }, 6, { role: 'ADMINISTRADOR' }, { LOCK: { UPDATE: 'UPDATE' } });

  assert.deepEqual(updateSites.mock.calls[0].arguments[0], { id_type_provider: 6, estado_registro: 'PENDIENTE' });
});
