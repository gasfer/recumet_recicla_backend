'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../services/provider-company.service');

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
  materials: [{ id_category: 1 }],
  bankAccounts: [],
};

test('valida el contrato corporativo y rechaza catálogos desconocidos', () => {
  assert.doesNotThrow(() => service.validateCompany(validCompany));
  assert.throws(() => service.validateCompany({ ...validCompany, entity_type: 'INVALID' }), /catálogo permitido/);
  assert.throws(() => service.validateCompany({ ...validCompany, full_names: '' }), /full_names/);
});

test('la sede exige ubicación, contacto principal y materiales sin sector', () => {
  assert.doesNotThrow(() => service.validateSite(validSite, true));
  assert.doesNotThrow(() => service.validateSite({ ...validSite, id_sector: undefined }, true));
  assert.throws(() => service.validateSite({ ...validSite, contacts: [] }, true), /contacto/);
  assert.throws(() => service.validateSite({ ...validSite, location: { department: 'La Paz' } }, true), /dirección/);
});

test('rechaza principales y elementos duplicados en colecciones', () => {
  assert.throws(() => service.validateCollection('contacts', [
    { full_name: 'A', position_area: 'A', cellphone: '1', is_main_contact: true },
    { full_name: 'B', position_area: 'B', cellphone: '2', is_main_contact: true },
  ]), /único contacto principal/);
  assert.throws(() => service.validateCollection('materials', [{ id_category: 1 }, { id_category: 1 }]), /duplicados/);
  assert.throws(() => service.validateCollection('bankAccounts', [
    { id_bank: 1, account_holder: 'A', account_number: '1', account_type: 'OTRA', currency: 'BOB', is_main: true },
    { id_bank: 1, account_holder: 'B', account_number: '2', account_type: 'OTRA', currency: 'BOB', is_main: true },
  ]), /cuenta principal/);
});
