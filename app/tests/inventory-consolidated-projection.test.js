'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/config');
const {
  validateProjectionIntegrity,
  buildConsolidatedInventoryProjection,
} = require('../services/inventory-consolidated-query.service');

test('validateProjectionIntegrity aprueba una proyección matemáticamente coherente', () => {
  const validProjection = {
    locations: [
      { key: 'loc_1', label: 'Sucursal 1' },
      { key: 'loc_2', label: 'Sucursal 2' },
    ],
    sections: {
      rawMaterial: {
        type: 'RAW_MATERIAL',
        title: 'MATERIA PRIMA',
        categories: [
          {
            id_category: 1,
            category_name: 'COBRES',
            products: [
              {
                id_product: 10,
                cod: 'MP-01',
                name: 'Cobre 1',
                locations: {
                  loc_1: { registeredStock: 100, pendingReceipt: 10, inConciliation: 5 },
                  loc_2: { registeredStock: 50, pendingReceipt: 0, inConciliation: 0 },
                },
                totalRegisteredStock: 150,
                totalPendingReceipt: 10,
                totalInConciliation: 5,
              },
            ],
            subtotals: {
              locations: {
                loc_1: { registeredStock: 100, pendingReceipt: 10, inConciliation: 5 },
                loc_2: { registeredStock: 50, pendingReceipt: 0, inConciliation: 0 },
              },
              totalRegisteredStock: 150,
              totalPendingReceipt: 10,
              totalInConciliation: 5,
            },
          },
        ],
        totals: {
          locations: {
            loc_1: { registeredStock: 100, pendingReceipt: 10, inConciliation: 5 },
            loc_2: { registeredStock: 50, pendingReceipt: 0, inConciliation: 0 },
          },
          totalRegisteredStock: 150,
          totalPendingReceipt: 10,
          totalInConciliation: 5,
        },
      },
      finishedProduct: {
        type: 'FINISHED_PRODUCT',
        title: 'PRODUCTOS TERMINADOS',
        categories: [],
        totals: {
          locations: {
            loc_1: { registeredStock: 0, pendingReceipt: 0, inConciliation: 0 },
            loc_2: { registeredStock: 0, pendingReceipt: 0, inConciliation: 0 },
          },
          totalRegisteredStock: 0,
          totalPendingReceipt: 0,
          totalInConciliation: 0,
        },
      },
    },
    grandTotals: {
      locations: {
        loc_1: { registeredStock: 100, pendingReceipt: 10, inConciliation: 5 },
        loc_2: { registeredStock: 50, pendingReceipt: 0, inConciliation: 0 },
      },
      totalRegisteredStock: 150,
      totalPendingReceipt: 10,
      totalInConciliation: 5,
    },
  };

  const check = validateProjectionIntegrity(validProjection, 2);
  assert.equal(check.valid, true);
  assert.equal(check.errors.length, 0);
});

test('validateProjectionIntegrity detecta descuadre en producto o total general', () => {
  const invalidProjection = {
    locations: [{ key: 'loc_1', label: 'Sucursal 1' }],
    sections: {
      rawMaterial: {
        type: 'RAW_MATERIAL',
        title: 'MATERIA PRIMA',
        categories: [
          {
            id_category: 1,
            category_name: 'COBRES',
            products: [
              {
                id_product: 10,
                cod: 'MP-01',
                locations: { loc_1: { registeredStock: 100, pendingReceipt: 0, inConciliation: 0 } },
                totalRegisteredStock: 120, // Descuadre: 100 != 120
                totalPendingReceipt: 0,
                totalInConciliation: 0,
              },
            ],
            subtotals: {
              locations: { loc_1: { registeredStock: 100, pendingReceipt: 0, inConciliation: 0 } },
              totalRegisteredStock: 100,
              totalPendingReceipt: 0,
              totalInConciliation: 0,
            },
          },
        ],
        totals: {
          locations: { loc_1: { registeredStock: 100, pendingReceipt: 0, inConciliation: 0 } },
          totalRegisteredStock: 100,
          totalPendingReceipt: 0,
          totalInConciliation: 0,
        },
      },
      finishedProduct: {
        type: 'FINISHED_PRODUCT',
        title: 'PRODUCTOS TERMINADOS',
        categories: [],
        totals: {
          locations: { loc_1: { registeredStock: 0, pendingReceipt: 0, inConciliation: 0 } },
          totalRegisteredStock: 0,
          totalPendingReceipt: 0,
          totalInConciliation: 0,
        },
      },
    },
    grandTotals: {
      locations: { loc_1: { registeredStock: 100, pendingReceipt: 0, inConciliation: 0 } },
      totalRegisteredStock: 99, // Descuadre con la suma de secciones (100)
      totalPendingReceipt: 0,
      totalInConciliation: 0,
    },
  };

  const check = validateProjectionIntegrity(invalidProjection, 2);
  assert.equal(check.valid, false);
  assert.ok(check.errors.length >= 2);
});

test('buildConsolidatedInventoryProjection no incluye campos de paginación y produce una estructura tipada completa', async (t) => {
  // Mocking DB calls
  t.mock.method(db.Sucursal, 'findAll', async () => [
    { id: 1, name: 'CASA MATRIZ' },
    { id: 2, name: 'ORURO' },
  ]);

  t.mock.method(db.Product, 'findAll', async () => [
    {
      id: 101,
      cod: 'MP-COB-01',
      name: 'Cobre Limpio',
      category: { id: 1, name: 'COBRE', type: 'RAW_MATERIAL' },
      unit: { id: 1, name: 'KILOGRAMOS', siglas: 'KG' },
    },
    {
      id: 201,
      cod: 'PT-PLA-01',
      name: 'Placa Cobre',
      category: { id: 2, name: 'PRODUCTO TERMINADO', type: 'FINISHED_PRODUCT' },
      unit: { id: 1, name: 'KILOGRAMOS', siglas: 'KG' },
    },
  ]);

  t.mock.method(db.ViewKardex, 'findAll', async () => {
    return [
      { id_product: 101, id_sucursal: 1, quantity_saldo: 100 },
      { id_product: 101, id_sucursal: 2, quantity_saldo: 50 },
      { id_product: 201, id_sucursal: 1, quantity_saldo: 200 },
    ];
  });

  t.mock.method(db.Transfers, 'findAll', async () => [
    {
      id: 50,
      id_sucursal_received: 2,
      id_storage_received: null,
      status: 'PENDING',
      date_send: new Date('2026-08-20'),
      date_received: null,
      detailsTransfers: [
        { id_product: 101, quantity: 15 },
      ],
    },
  ]);

  if (db.TransferReviewInventoryHold) {
    t.mock.method(db.TransferReviewInventoryHold, 'findAll', async () => [
      {
        id_product: 101,
        id_sucursal: 1,
        id_storage: null,
        quantity: 5,
        disposition: 'EN_REVISION',
      },
    ]);
  }

  const projection = await buildConsolidatedInventoryProjection({
    filterBy: 'RANGE',
    date1: '01-08-2026',
    date2: '29-08-2026',
    showZeroSaldo: true,
  });

  // Verificación de contrato y ausencia de paginación (Task 1.3)
  assert.equal(projection.page, undefined, 'No debe tener campo page');
  assert.equal(projection.limit, undefined, 'No debe tener campo limit');
  assert.equal(projection.offset, undefined, 'No debe tener campo offset');
  assert.equal(projection.count, undefined, 'No debe tener campo count');

  // Metadatos
  assert.equal(projection.metadata.fileDateStr, '2026-08-29');
  assert.equal(projection.metadata.headerLabel, 'Al 29 de Agosto de 2026');

  // Ubicaciones
  assert.equal(projection.locations.length, 2);
  assert.equal(projection.locations[0].label, 'CASA MATRIZ');
  assert.equal(projection.locations[1].label, 'ORURO');

  // Secciones separadas MP y PT
  assert.ok(projection.sections.rawMaterial);
  assert.ok(projection.sections.finishedProduct);
  assert.equal(projection.sections.rawMaterial.categories.length, 1);
  assert.equal(projection.sections.finishedProduct.categories.length, 1);

  // Producto MP-COB-01
  const mpProd = projection.sections.rawMaterial.categories[0].products[0];
  assert.equal(mpProd.cod, 'MP-COB-01');
  assert.equal(mpProd.locations.loc_1.registeredStock, 100);
  assert.equal(mpProd.locations.loc_1.inConciliation, 5);
  assert.equal(mpProd.locations.loc_2.registeredStock, 50);
  assert.equal(mpProd.locations.loc_2.pendingReceipt, 15);
  assert.equal(mpProd.totalRegisteredStock, 150);
  assert.equal(mpProd.totalPendingReceipt, 15);
  assert.equal(mpProd.totalInConciliation, 5);

  // Totales de sección y generales
  assert.equal(projection.sections.rawMaterial.totals.totalRegisteredStock, 150);
  assert.equal(projection.sections.finishedProduct.totals.totalRegisteredStock, 200);
  assert.equal(projection.grandTotals.totalRegisteredStock, 350);
  assert.equal(projection.grandTotals.totalPendingReceipt, 15);
  assert.equal(projection.grandTotals.totalInConciliation, 5);

  // Integridad validada
  assert.equal(projection.integrity.valid, true);
});
