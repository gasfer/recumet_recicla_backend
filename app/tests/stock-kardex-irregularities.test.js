'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const { getStockKardexIrregularities } = require('../services/stock-availability.service');

test('detecta únicamente diferencias Stock–Kardex y conserva los traslados trazables', async (t) => {
  let queryNumber = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    queryNumber += 1;
    if (queryNumber === 1) {
      return [
        {
          cod: 'MP-AL-PER-001', name: 'ALUMINIO PERFIL MIXTO', id_product: '304', id_sucursal: '1', id_storage: '1',
          physical_stock: '21422.3500', stock_in_review: '0', available_stock: '21422.3500', kardex_balance: '21411.5500',
          physical_kardex_difference: '10.8000',
        },
        {
          cod: 'MP-SIN-DIF', name: 'PRODUCTO CONCILIADO', id_product: '305', id_sucursal: '1', id_storage: '1',
          physical_stock: '25.0000', stock_in_review: '0', available_stock: '25.0000', kardex_balance: '25.0000',
          physical_kardex_difference: '0.0000',
        },
      ];
    }
    return [{
      id_product: 304, transfer_id: 313, transfer_cod: 'TRAS00313', detail_id: 1553,
      id_sucursal_received: 1, id_storage_received: 1,
      quantity_sent: '686.4000', quantity_received: '697.0000', quantity_difference: '-10.6000',
    }];
  });

  const irregularities = await getStockKardexIrregularities({ idSucursal: 1, idStorage: 1 });

  assert.equal(irregularities.length, 1);
  assert.equal(irregularities[0].physical_kardex_difference, 10.8);
  assert.equal(irregularities[0].difference_direction, 'STOCK_GREATER_THAN_KARDEX');
  assert.equal(irregularities[0].traceable_transfers[0].transfer_cod, 'TRAS00313');
});

test('identifica cuando el Kardex es mayor que el stock físico', async (t) => {
  let queryNumber = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    queryNumber += 1;
    return queryNumber === 1 ? [{
      cod: 'MP-001', name: 'MATERIAL', id_product: '10', id_sucursal: '1', id_storage: '1',
      physical_stock: '90', stock_in_review: '5', available_stock: '85', kardex_balance: '100',
      physical_kardex_difference: '-10',
    }] : [];
  });

  const [irregularity] = await getStockKardexIrregularities({ idSucursal: 1, idStorage: 1 });

  assert.equal(irregularity.difference_direction, 'KARDEX_GREATER_THAN_STOCK');
  assert.equal(irregularity.physical_stock, 90);
  assert.equal(irregularity.kardex_balance, 100);
});
