'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/config');
const { purchaseExcelContext } = require('../services/purchase-management-excel.service');

test('el encabezado resuelve todos los filtros elegidos y conserva No sin mostrar IDs', async t => {
  t.mock.method(db.Sucursal, 'findByPk', async () => ({ name: 'Casa Matriz', city: 'Cochabamba', company: { nit: '123', email: 'empresa@example.com' } }));
  for (const [model, value] of [[db.Storage, 'Principal'], [db.Provider, 'Ana'], [db.TypesProvider, 'Empresa'], [db.User, 'Comercial'], [db.Category, 'Metales'], [db.Product, 'Aluminio']]) {
    t.mock.method(model, 'findAll', async ({ attributes }) => [{ [attributes[0]]: value }]);
  }
  const context = await purchaseExcelContext({
    filterBy: 'MONTH', date1: '10', date2: '2026', id_sucursal: '1', id_storage: '2',
    id_provider: '3', id_type_provider: '4', id_commercial_user: '5', category_ids: '6', id_products: '7',
    entity_type: 'PRIVATE', type_registry: 'BOLETA', type_pay: 'CREDITO', old_customer: 'NO', with_pickup: 'SI', referral_sources: 'Redes', query: 'boleta', type: 'cod',
  });
  assert.equal(context.company.branchName, 'Casa Matriz');
  const text = context.filters.join('\n');
  for (const expected of ['octubre de 2026', 'Principal', 'Proveedor: Ana', 'Empresa', 'Comercial', 'Metales', 'Aluminio', 'Privada', 'BOLETA', 'A crédito', 'Cliente antiguo: No', 'Con recojo: Sí', 'Redes', 'boleta']) assert.ok(text.includes(expected), expected);
  assert.ok(!text.includes('undefined'));
});
