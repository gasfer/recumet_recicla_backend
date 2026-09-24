'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  buildConsolidatedInventoryProjection,
  validateProjectionIntegrity,
} = require('../services/inventory-consolidated-query.service');
const { generateConsolidatedInventoryExcel } = require('../services/inventory-consolidated-excel.service');
const db = require('../database/config');

test('E2E: Conciliación matemática independiente de muestra y validación de libro Excel', async (t) => {
  // Configuración de datos de prueba
  const sucursales = [
    { id: 1, name: 'CASA MATRIZ' },
    { id: 2, name: 'REPUBLICA' },
    { id: 3, name: 'SANTA CRUZ' },
  ];

  const products = [
    {
      id: 10,
      cod: 'MP-COB-01',
      name: 'Cobre Limpio de Primera',
      category: { id: 1, name: 'COBRE', type: 'RAW_MATERIAL' },
      unit: { id: 1, name: 'KG', siglas: 'KG' },
    },
    {
      id: 11,
      cod: 'MP-ALU-01',
      name: 'Aluminio Perfil Blanco',
      category: { id: 2, name: 'ALUMINIO', type: 'RAW_MATERIAL' },
      unit: { id: 1, name: 'KG', siglas: 'KG' },
    },
    {
      id: 20,
      cod: 'PT-LIN-01',
      name: 'Lingotes de Bronce SAE 64',
      category: { id: 3, name: 'LINGOTES', type: 'FINISHED_PRODUCT' },
      unit: { id: 2, name: 'UNIDADES', siglas: 'UND' },
    },
    {
      id: 21,
      cod: 'PT-REC-01',
      name: 'Billetes de Aluminio Reciclado',
      category: { id: 4, name: 'BILLETES', type: 'FINISHED_PRODUCT' },
      unit: { id: 1, name: 'KG', siglas: 'KG' },
    },
  ];

  // Saldos kardex simulados
  const kardexBalances = [
    { id_product: 10, id_sucursal: 1, quantity_saldo: 1250.50 },
    { id_product: 10, id_sucursal: 2, quantity_saldo: 450.00 },
    { id_product: 10, id_sucursal: 3, quantity_saldo: 800.25 },
    { id_product: 11, id_sucursal: 1, quantity_saldo: 3100.00 },
    { id_product: 11, id_sucursal: 2, quantity_saldo: 1500.00 },
    { id_product: 20, id_sucursal: 1, quantity_saldo: 300.00 },
    { id_product: 20, id_sucursal: 3, quantity_saldo: 120.00 },
    { id_product: 21, id_sucursal: 2, quantity_saldo: 550.75 },
  ];

  // Traslados en tránsito simulados (pendientes de recepción al corte)
  const transfers = [
    {
      id: 101,
      id_sucursal_received: 2,
      id_storage_received: null,
      status: 'PENDING',
      date_send: new Date('2026-08-25'),
      date_received: null,
      detailsTransfers: [
        { id_product: 10, quantity: 100.00 },
      ],
    },
    {
      id: 102,
      id_sucursal_received: 3,
      id_storage_received: null,
      status: 'RECEIVED',
      date_send: new Date('2026-08-26'),
      date_received: new Date('2026-09-02'), // Recibido después del corte del 29-08 -> estaba pendiente
      detailsTransfers: [
        { id_product: 20, quantity: 25.00 },
      ],
    },
  ];

  // Retenciones activas de conciliación simuladas
  const holds = [
    {
      id_product: 11,
      id_sucursal: 1,
      id_storage: null,
      quantity: 50.00,
      disposition: 'EN_REVISION',
    },
  ];

  t.mock.method(db.Sucursal, 'findAll', async () => sucursales);
  t.mock.method(db.Product, 'findAll', async () => products);
  t.mock.method(db.ViewKardex, 'findAll', async (options) => {
    if (options.attributes && options.attributes.some(attr => Array.isArray(attr) && attr[1] === 'min_id')) {
      return [];
    }
    return kardexBalances;
  });
  t.mock.method(db.Transfers, 'findAll', async () => transfers);
  if (db.TransferReviewInventoryHold) {
    t.mock.method(db.TransferReviewInventoryHold, 'findAll', async () => holds);
  }

  // 1. Proyección generada
  const projection = await buildConsolidatedInventoryProjection({
    filterBy: 'RANGE',
    date1: '01-08-2026',
    date2: '29-08-2026',
    showZeroSaldo: true,
  });

  // 2. Reconciliación matemática independiente (diferencias = 0)
  const integrity = validateProjectionIntegrity(projection, 2);
  assert.equal(integrity.valid, true);
  assert.equal(integrity.errors.length, 0);

  // Verificación cuantitativa de cada métrica esperada
  // MP-COB-01
  const cobProd = projection.sections.rawMaterial.categories.find(c => c.category_name === 'COBRE').products[0];
  assert.equal(cobProd.totalRegisteredStock, 2500.75); // 1250.50 + 450.00 + 800.25
  assert.equal(cobProd.totalPendingReceipt, 100.00);   // 100.00 en tránsito a República
  assert.equal(cobProd.totalInConciliation, 0.00);

  // MP-ALU-01
  const aluProd = projection.sections.rawMaterial.categories.find(c => c.category_name === 'ALUMINIO').products[0];
  assert.equal(aluProd.totalRegisteredStock, 4600.00); // 3100.00 + 1500.00
  assert.equal(aluProd.totalInConciliation, 50.00);    // 50.00 en revisión en Matriz

  // Totales Materia Prima
  assert.equal(projection.sections.rawMaterial.totals.totalRegisteredStock, 7100.75);
  assert.equal(projection.sections.rawMaterial.totals.totalPendingReceipt, 100.00);
  assert.equal(projection.sections.rawMaterial.totals.totalInConciliation, 50.00);

  // PT-LIN-01
  const linProd = projection.sections.finishedProduct.categories.find(c => c.category_name === 'LINGOTES').products[0];
  assert.equal(linProd.totalRegisteredStock, 420.00);  // 300.00 + 120.00
  assert.equal(linProd.totalPendingReceipt, 25.00);    // 25.00 en tránsito a Santa Cruz

  // PT-REC-01
  const bilProd = projection.sections.finishedProduct.categories.find(c => c.category_name === 'BILLETES').products[0];
  assert.equal(bilProd.totalRegisteredStock, 550.75);

  // Totales Productos Terminados
  assert.equal(projection.sections.finishedProduct.totals.totalRegisteredStock, 970.75);
  assert.equal(projection.sections.finishedProduct.totals.totalPendingReceipt, 25.00);

  // Total General Consolidado
  assert.equal(projection.grandTotals.totalRegisteredStock, 8071.50); // 7100.75 + 970.75
  assert.equal(projection.grandTotals.totalPendingReceipt, 125.00);   // 100.00 + 25.00
  assert.equal(projection.grandTotals.totalInConciliation, 50.00);

  // 3. Generación del libro Excel
  const workbook = await generateConsolidatedInventoryExcel(projection);
  const worksheet = workbook.getWorksheet('Consolidado de inventario');
  assert.ok(worksheet);

  // Verificar que el libro no contiene NaN ni undefined
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      assert.notEqual(cell.value, NaN);
      assert.notEqual(cell.value, 'NaN');
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.length > 5000, 'El archivo generado debe tener un tamaño razonable');
});
