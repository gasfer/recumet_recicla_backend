'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../services/provider-company.service');
const providerService = require('../services/provider.service');
const { TypesProvider } = require('../database/config');

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
