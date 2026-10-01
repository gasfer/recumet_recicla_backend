'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ProviderCompany, Provider, ProviderContact, ProviderBankAccount, ProviderMaterial,
  TypesProvider, Sucursal, Category, Bank, sequelize,
} = require('../database/config');
const service = require('../services/provider-company.service');

async function references(transaction) {
  const [type, sucursal, category, bank] = await Promise.all([
    TypesProvider.findOne({ where: { status: true }, transaction }),
    Sucursal.findOne({ where: { status: true }, transaction }),
    Category.findOne({ where: { status: true }, transaction }),
    Bank.findOne({ where: { status: true }, transaction }),
  ]);
  assert.ok(type && sucursal && category && bank, 'La base de prueba necesita catálogos activos');
  return { type, sucursal, category, bank };
}

async function createCompanyAndSite(transaction, suffix, role = 'HEADQUARTERS') {
  const refs = await references(transaction);
  const company = await ProviderCompany.create({
    full_names: `TEST COMPANY ${suffix}`, number_document: `TEST-${suffix}`,
    entity_type: 'PRIVATE', origin_channel: 'DIRECT_CONTACT', relationship_status: 'PROSPECT',
    requires_certificate: false, requires_traceability_report: false, status: true,
  }, { transaction });
  const site = await Provider.create({
    full_names: `TEST SITE ${suffix}`, number_document: `TEST-${suffix}`,
    id_type_provider: refs.type.id, id_sucursal: refs.sucursal.id, id_category: refs.category.id,
    id_provider_company: company.id, site_role: role, frequency: 'MONTHLY', service_mode: 'BOTH',
    estado_registro: 'VALIDADO', status: true,
  }, { transaction });
  return { ...refs, company, site };
}

test('PostgreSQL impide dos casas matrices activas por empresa', async () => {
  const transaction = await sequelize.transaction();
  try {
    const { company, type, sucursal, category } = await createCompanyAndSite(transaction, `${Date.now()}-HQ`);
    await assert.rejects(() => Provider.create({
      full_names: 'SECOND HQ', number_document: `SECOND-${Date.now()}`,
      id_type_provider: type.id, id_sucursal: sucursal.id, id_category: category.id,
      id_provider_company: company.id, site_role: 'HEADQUARTERS', status: true,
    }, { transaction }), /unique|llave duplicada/i);
  } finally { await transaction.rollback(); }
});

test('restricciones por sede rechazan principales y detalles activos duplicados', async () => {
  for (const kind of ['contact', 'account', 'material']) {
    const transaction = await sequelize.transaction();
    try {
      const { site, bank, category } = await createCompanyAndSite(transaction, `${Date.now()}-${kind}`);
      if (kind === 'contact') {
        await ProviderContact.create({ id_provider: site.id, full_name: 'A', cellphone: '1', is_main_contact: true, status: true }, { transaction });
        await assert.rejects(() => ProviderContact.create({ id_provider: site.id, full_name: 'B', cellphone: '2', is_main_contact: true, status: true }, { transaction }), /unique|llave duplicada/i);
      } else if (kind === 'account') {
        const values = { id_provider: site.id, id_bank: bank.id, account_holder: 'A', account_number: '001', account_type: 'OTRA', currency: 'BOB', is_main: true, status: true };
        await ProviderBankAccount.create(values, { transaction });
        await assert.rejects(() => ProviderBankAccount.create({ ...values, account_holder: 'B' }, { transaction }), /unique|llave duplicada/i);
      } else {
        const values = { id_provider: site.id, id_category: category.id, id_product: null, status: true };
        await ProviderMaterial.create(values, { transaction });
        await assert.rejects(() => ProviderMaterial.create(values, { transaction }), /unique|llave duplicada/i);
      }
    } finally { await transaction.rollback(); }
  }
});

test('un identificador de sede no puede cruzarse con otra empresa', async () => {
  const transaction = await sequelize.transaction();
  try {
    const first = await createCompanyAndSite(transaction, `${Date.now()}-A`);
    const second = await createCompanyAndSite(transaction, `${Date.now()}-B`);
    await assert.rejects(() => service.requireCompanySite(first.company.id, second.site.id, transaction), /no pertenece/);
  } finally { await transaction.rollback(); }
});

test('la creación corporativa revierte la empresa si la sede es inválida', async () => {
  const suffix = `${Date.now()}-ROLLBACK`;
  const payload = {
    company: {
      full_names: `TEST ROLLBACK ${suffix}`, number_document: suffix, entity_type: 'PRIVATE',
      origin_channel: 'DIRECT_CONTACT', relationship_status: 'PROSPECT',
      requires_certificate: false, requires_traceability_report: false, status: true,
    },
    headquarters: { frequency: 'MONTHLY', service_mode: 'BOTH' },
  };
  await assert.rejects(() => service.create(payload), /sucursal operativa/);
  assert.equal(await ProviderCompany.count({ where: { number_document: suffix } }), 0);
});
