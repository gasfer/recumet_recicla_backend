'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sequelize, TypesProvider, Sucursal, Product, Bank, Provider, User } = require('../database/config');
const service = require('../services/provider.service');
const companyService = require('../services/provider-company.service');

test('crear, editar y recuperar perfiles A a F en PostgreSQL sin conservar datos de prueba', { skip: process.env.RECUMET_PROVIDER_DB_TEST !== '1' }, async t => {
  sequelize.options.logging = false;
  const transaction = await sequelize.transaction();
  const ids = [];
  try {
    const [types, branch, product, bank, user] = await Promise.all([
      TypesProvider.findAll({ transaction }), Sucursal.findOne({ where: { status: true }, transaction }),
      Product.findOne({ where: { status: true }, transaction }), Bank.findOne({ where: { status: true }, transaction }),
      User.findOne({ where: { status: true }, transaction }),
    ]);
    assert.ok(branch && product && bank, 'Se necesitan catálogos activos');
    t.mock.method(sequelize, 'transaction', async callback => callback(transaction));
    const typeA = types.find(item => item.code === 'A');
    const corporate = {
      full_names: `EMPRESA TRANSACCIONAL ${Date.now()}`, number_document: `TEST-${Date.now()}`,
      id_type_provider: typeA.id, entity_type: 'PRIVATE', origin_channel: 'DIRECT_CONTACT',
      relationship_status: 'PROSPECT', requires_certificate: false, requires_traceability_report: false, status: true,
    };
    const headquarters = {
      full_names: corporate.full_names, id_sucursal: branch.id, frequency: 'MONTHLY', frequency_mode: 'manual', service_mode: 'BOTH', status: true,
      location: { department: 'Cochabamba', city: 'Cochabamba', address: 'SEDE DE PRUEBA' },
      contacts: [{ full_name: 'CONTACTO PRUEBA', position_area: 'VENTAS', cellphone: '70000000', is_main_contact: true, status: true }],
      materials: [{ id_product: product.id, frequency: 'MONTHLY', service_mode: 'BOTH', status: true }], bankAccounts: [],
    };
    const company = await companyService.create({ company: corporate, headquarters });
    const site = company.operatingProviders[0];
    ids.push(site.id);
    await companyService.update(company.id, { company: { ...corporate, commercial_name: 'EMPRESA EDITADA' }, headquarters: { ...headquarters, id: site.id, general_observations: 'SEDE EDITADA' } });
    const reloadedA = await service.getProviderDetails(site.id, transaction);
    assert.equal(reloadedA.company.commercial_name, 'EMPRESA EDITADA');
    assert.equal(reloadedA.general_observations, 'SEDE EDITADA');
    assert.equal(reloadedA.frequency_mode, 'manual');
    for (const code of ['B', 'C', 'D', 'E', 'F']) {
      const type = types.find(item => item.code === code);
      assert.ok(type, `Falta tipo ${code}`);
      const payload = {
        full_names: `PRUEBA TRANSACCIONAL ${code} ${Date.now()}`, id_type_provider: type.id,
        id_commercial_user: user.id, origin_channel: 'DIRECT_CONTACT', relationship_status: 'PROSPECT',
        id_sucursal: branch.id, id_category: product.id_category, status: true, mayorista: false,
        commercial_name: 'ACOPIADORA PRUEBA', department: 'Cochabamba', zone: 'CENTRO', direction: 'DIRECCIÓN DE PRUEBA',
        latitude: -17.39, longitude: -66.16, geolocation_text: 'REFERENCIA PRUEBA',
        frequency: 'MONTHLY', frequency_mode: 'manual', service_mode: 'BOTH',
        price_policy: 'LIST_PRICE', logistics_condition: 'TO_COORDINATE', habitual_price_adjustment: '0.20',
        requires_certificate: false, requires_traceability_report: false, general_observations: 'OBSERVACIÓN PRUEBA',
        materials: [{ id_product: product.id, frequency: 'MONTHLY', service_mode: 'BOTH', estimated_volume: 123.456, status: true }],
        bankAccounts: [{ id_bank: bank.id, account_holder: 'TITULAR PRUEBA', account_number: `TEST-${code}`, account_type: 'CAJA_AHORRO', currency: 'BOB', is_main: true, status: true }],
        ...(code !== 'D' ? { contacts: [{ full_name: 'CONTACTO PRUEBA', position_area: 'VENTAS', cellphone: '70000000', is_main_contact: true, status: true }] } : {}),
      };
      const created = await service.createProfile(structuredClone(payload));
      ids.push(created.id);
      const updated = await service.updateProfile(created.id, { ...structuredClone(payload), commercial_name: 'ACOPIADORA EDITADA', zone: '', general_observations: 'EDITADA', status: false });
      assert.equal(updated.status, false);
      const restored = await service.getProviderDetails(created.id, transaction);
      assert.equal(restored.commercial_name, 'ACOPIADORA EDITADA');
      assert.equal(restored.general_observations, 'EDITADA');
      assert.equal(restored.branches[0].zone, null);
      assert.equal(Number(restored.branches[0].latitude), payload.latitude);
      assert.equal(restored.materials.length, 1);
      assert.equal(Number(restored.materials[0].estimated_volume), 123.456);
      assert.equal(restored.bankAccounts[0].account_number, `TEST-${code}`);
      if (code !== 'D') assert.equal(restored.contacts[0].full_name, 'CONTACTO PRUEBA');
      await service.updateProfile(created.id, { ...structuredClone(payload), bankAccounts: [] });
      assert.equal((await service.getProviderDetails(created.id, transaction)).bankAccounts.length, 0);
    }
  } finally {
    t.mock.restoreAll();
    await transaction.rollback();
  }
  assert.equal(await Provider.count({ where: { id: ids } }), 0);
  await sequelize.close();
});
