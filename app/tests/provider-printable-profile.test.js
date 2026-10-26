'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizePurchases } = require('../services/provider-purchase-history.service');
const { getProviderPurchaseHistory } = require('../services/provider-purchase-history.service');
const { maskAccount } = require('../services/provider-printable-profile.service');
const { renderReportHtml } = require('../helpers/generator-pdf/report-html.template');
const { Input, Provider, AccountsPayable, ProviderCompanyDocument } = require('../database/config');
const { ProviderCompany } = require('../database/config');
const providerCompanyService = require('../services/provider-company.service');
const { Op } = require('sequelize');
const activeDocumentsMigration = require('../database/migrations/20261023090000-unique-active-provider-company-documents');
const companyChannelsMigration = require('../database/migrations/20261001090000-add-provider-company-contact-channels');
const companyDocumentsMigration = require('../database/migrations/20261001100000-create-provider-company-documents');
const removeProviderProvinceMigration = require('../database/migrations/20261023100000-remove-provider-branch-province');
const { MAX_PDF_SIZE, validateCompanyPdfUpload, safeOriginalName } = require('../services/provider-company-document.service');

test('resume compras suma contado y crédito activo sin duplicar pagos', () => {
  const summary = summarizePurchases({
    inputs: [
      { id: 1, type: 'CONTADO', total: '100', total_kg: 20 },
      { id: 2, type: 'CREDITO', total: '90', total_kg: 10 },
    ],
    accounts: [{ id_input: 2, monto_abonado: '40', monto_restante: '50' }],
    sites: [{ id: 1 }, { id: 2 }],
  });
  assert.deepEqual(summary, {
    purchased_kg: 30,
    purchased_amount: 190,
    paid_amount: 140,
    pending_amount: 50,
    purchase_count: 2,
    active_sites: 2,
  });
});

test('la ficha protege cuentas bancarias y usa el diseño PDF de perfil', () => {
  assert.equal(maskAccount('1234 5678 90'), '••••••7890');
  assert.equal(maskAccount('123'), '•••');
  const html = renderReportHtml({ variant: 'profile', title: 'Ficha', reference: 'P-1', date: '23/10/2026', panels: [], sections: [] });
  assert.match(html, /<body class="profile/);
});

test('el historial limita compras y pagos a sedes activas de la empresa y a la sede elegida', async t => {
  const providerSites = [{ id: 1, full_names: 'Matriz', site_role: 'HEADQUARTERS' }, { id: 2, full_names: 'Sucursal', site_role: 'BRANCH' }];
  t.mock.method(Provider, 'findByPk', async () => ({ id: 1, id_provider_company: 10 }));
  t.mock.method(Provider, 'findAll', async options => {
    assert.deepEqual(options.where, { id_provider_company: 10, status: true });
    return providerSites;
  });
  t.mock.method(Input, 'count', async () => 1);
  t.mock.method(Input, 'sum', async () => 40);
  t.mock.method(Input, 'max', async () => '2026-10-01');
  t.mock.method(Input, 'findAndCountAll', async options => {
    assert.equal(options.where.status, 'ACTIVE');
    assert.deepEqual(options.where.id_provider[Op.in], [2]);
    return { count: 1, rows: [] };
  });
  t.mock.method(Input, 'findAll', async options => {
    assert.equal(options.where.status, 'ACTIVE');
    assert.deepEqual(options.where.id_provider[Op.in], [2]);
    return [];
  });
  t.mock.method(AccountsPayable, 'findAll', async options => {
    assert.equal(options.where.status, true);
    assert.equal(options.where.status_account[Op.ne], 'ANULADO');
    assert.deepEqual(options.where.id_provider[Op.in], [2]);
    return [];
  });

  const result = await getProviderPurchaseHistory({ providerId: 1, siteId: 2 });
  assert.equal(result.selected_site_id, 2);
  assert.equal(result.summary.active_sites, 1);
  assert.deepEqual(result.sites.map(site => site.id), [1, 2]);
  await assert.rejects(() => getProviderPurchaseHistory({ providerId: 1, siteId: 3 }), /no pertenece/);
});

test('la migración de documentos limita un documento activo por tipo y permite revertir', async () => {
  const calls = [];
  const queryInterface = {
    async addIndex(...args) { calls.push(['addIndex', ...args]); },
    async removeIndex(...args) { calls.push(['removeIndex', ...args]); },
  };
  await activeDocumentsMigration.up(queryInterface);
  await activeDocumentsMigration.down(queryInterface);
  assert.deepEqual(calls[0], ['addIndex', 'provider_company_documents', ['id_provider_company', 'document_type'], {
    name: 'provider_company_documents_one_active_type_idx', unique: true, where: { status: true },
  }]);
  assert.deepEqual(calls[1], ['removeIndex', 'provider_company_documents', 'provider_company_documents_one_active_type_idx']);
});

test('las migraciones incrementales agregan y revierten canales y documentos corporativos', async () => {
  const calls = [];
  const types = { INTEGER: 'INTEGER', STRING: length => `STRING(${length})`, BOOLEAN: 'BOOLEAN', DATE: 'DATE', literal: value => value };
  const queryInterface = {
    async addColumn(...args) { calls.push(['addColumn', ...args]); },
    async removeColumn(...args) { calls.push(['removeColumn', ...args]); },
    async createTable(...args) { calls.push(['createTable', ...args]); },
    async addIndex(...args) { calls.push(['addIndex', ...args]); },
    async dropTable(...args) { calls.push(['dropTable', ...args]); },
  };
  await companyChannelsMigration.up(queryInterface, types);
  await companyChannelsMigration.down(queryInterface);
  await companyDocumentsMigration.up(queryInterface, types);
  await companyDocumentsMigration.down(queryInterface);
  assert.equal(calls.filter(call => call[0] === 'addColumn' && call[1] === 'provider_companies').length, 4);
  assert.equal(calls.filter(call => call[0] === 'removeColumn' && call[1] === 'provider_companies').length, 4);
  assert.equal(calls.some(call => call[0] === 'createTable' && call[1] === 'provider_company_documents'), true);
  assert.equal(calls.some(call => call[0] === 'dropTable' && call[1] === 'provider_company_documents'), true);
});

test('la migración elimina provincia de las sedes y down la restaura como columna opcional', async () => {
  const calls = [];
  const queryInterface = {
    async removeColumn(...args) { calls.push(['removeColumn', ...args]); },
    async addColumn(...args) { calls.push(['addColumn', ...args]); },
  };
  await removeProviderProvinceMigration.up(queryInterface);
  await removeProviderProvinceMigration.down(queryInterface, { STRING: 'STRING' });
  assert.deepEqual(calls[0], ['removeColumn', 'provider_branches', 'province']);
  assert.deepEqual(calls[1], ['addColumn', 'provider_branches', 'province', { type: 'STRING', allowNull: true }]);
});

test('la carga de documentos acepta solo PDF con firma válida hasta 8 MB y limpia el nombre', () => {
  const valid = { mimetype: 'application/pdf', size: 8, data: Buffer.from('%PDF-1.7'), name: '..\\otro\\certificado.pdf' };
  assert.equal(validateCompanyPdfUpload(valid), true);
  assert.equal(validateCompanyPdfUpload({ ...valid, mimetype: 'image/png' }), false);
  assert.equal(validateCompanyPdfUpload({ ...valid, data: Buffer.from('<html>') }), false);
  assert.equal(validateCompanyPdfUpload({ ...valid, size: MAX_PDF_SIZE + 1 }), false);
  assert.equal(validateCompanyPdfUpload([valid]), false);
  assert.equal(safeOriginalName(valid.name), 'certificado.pdf');
});

test('la actualización de empresa rechaza certificados requeridos sin documento activo', async t => {
  let storedDocuments = [{ document_type: 'CERTIFICATE' }];
  t.mock.method(ProviderCompanyDocument, 'findAll', async () => storedDocuments);
  const company = { id: 88, requires_certificate: true, requires_traceability_report: true };
  await assert.rejects(() => providerCompanyService.validateRequiredDocuments(company), /informe de trazabilidad/);
  storedDocuments = [{ document_type: 'CERTIFICATE' }, { document_type: 'TRACEABILITY_REPORT' }];
  await assert.doesNotReject(() => providerCompanyService.validateRequiredDocuments(company));
});

test('imprimir dos veces construye el mismo resumen, oculta cuentas y solo consulta datos', async t => {
  const companyService = require('../services/provider-company.service');
  const { buildProviderPrintableProfile } = require('../services/provider-printable-profile.service');
  const company = {
    id: 55, full_names: 'EMPRESA DE PRUEBA', number_document: 'NIT-55', commercial_name: 'PRUEBA',
    entity_type: 'PRIVATE', corporate_phone: '4000000', corporate_cellphone: '70000000',
    corporate_email: 'info@example.com', website: 'https://example.com', origin_channel: 'DIRECT_CONTACT',
    relationship_status: 'ACTIVE', negotiation_condition: 'DIRECT', requires_certificate: false,
    requires_traceability_report: false, general_observations: '', commercial_observations: '',
    operatingProviders: [{
      id: 5, status: true, site_role: 'HEADQUARTERS', full_names: 'CASA MATRIZ', frequency: 'ANNUAL', service_mode: 'BOTH',
      location: { department: 'COCHABAMBA', city: 'COCHABAMBA', address: 'CALLE 1', zone: 'CENTRO' },
      contacts: [], materials: [], documents: [],
      bankAccounts: [{ account_number: '0012345678901234', account_holder: 'EMPRESA', account_type: 'CAJA_AHORRO', currency: 'BOB', bank: { name: 'BANCO' } }],
    }],
    documents: [],
  };
  t.mock.method(companyService, 'details', async () => company);
  t.mock.method(Provider, 'findByPk', async () => ({ id: 5, id_provider_company: 55 }));
  t.mock.method(Provider, 'findAll', async () => [{ id: 5, full_names: 'CASA MATRIZ', site_role: 'HEADQUARTERS' }]);
  t.mock.method(Input, 'count', async () => 0);
  t.mock.method(Input, 'sum', async () => 0);
  t.mock.method(Input, 'max', async () => null);
  t.mock.method(Input, 'findAndCountAll', async () => ({ count: 0, rows: [] }));
  t.mock.method(Input, 'findAll', async () => []);
  t.mock.method(AccountsPayable, 'findAll', async () => []);
  t.mock.method(ProviderCompany, 'create', () => assert.fail('La impresión no debe crear registros'));
  t.mock.method(ProviderCompany, 'update', () => assert.fail('La impresión no debe editar registros'));

  const first = await buildProviderPrintableProfile(55);
  const second = await buildProviderPrintableProfile(55);
  const firstHtml = renderReportHtml(first);
  const secondHtml = renderReportHtml(second);
  assert.match(firstHtml, /EMPRESA DE PRUEBA/);
  assert.match(firstHtml, /••••••••••••1234/);
  assert.doesNotMatch(firstHtml, /0012345678901234/);
  assert.doesNotMatch(firstHtml, /CERCADO|provincia/i);
  assert.equal(first.sections[0].rows.length, second.sections[0].rows.length);
});
