'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sequelize } = require('../database/config');
const { getStockAvailability } = require('../services/stock-availability.service');

test('descuenta retenciones activas del disponible sin alterar el saldo físico', async (t) => {
  let sql = '';
  t.mock.method(sequelize, 'query', async (statement) => {
    sql = statement;
    return [{ quantity_in_review: '3.2500' }];
  });
  const result = await getStockAvailability({ id_product: 7, id_sucursal: 1, id_storage: 2, stock: '10.0000' });
  assert.match(sql, /disposition <> 'LIBERADO_POR_AJUSTE'/);
  assert.equal(result.physical_stock, '10.0000');
  assert.equal(result.stock_in_review, '3.2500');
  assert.equal(result.available_stock, '6.7500');
});
