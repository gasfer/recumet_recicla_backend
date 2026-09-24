'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { generateConsolidatedInventoryExcel } = require('../services/inventory-consolidated-excel.service');

const mockProjection = () => ({
  metadata: {
    cutoffDate: new Date('2026-08-29T23:59:59.999Z'),
    fileDateStr: '2026-08-29',
    headerLabel: 'Al 29 de Agosto de 2026',
    filterBy: 'RANGE',
    filtersSummary: {
      sucursales: ['1', '2'],
      storages: [],
      categories: [],
      products: [],
      showZeroSaldo: false,
      querySearch: '',
    },
    decimalPlaces: 2,
  },
  locations: [
    { key: 'loc_1', id_sucursal: 1, label: 'CASA MATRIZ' },
    { key: 'loc_2', id_sucursal: 2, label: 'ORURO' },
  ],
  sections: {
    rawMaterial: {
      type: 'RAW_MATERIAL',
      title: 'MATERIA PRIMA',
      categories: [
        {
          id_category: 1,
          category_name: 'COBRE',
          products: [
            {
              id_product: 10,
              cod: 'MP-COB-01',
              name: 'Cobre de Primera',
              unit: 'KG',
              observations: 'Lote prioritario',
              locations: {
                loc_1: { registeredStock: 150.5, pendingReceipt: 20, inConciliation: 5 },
                loc_2: { registeredStock: 80, pendingReceipt: 0, inConciliation: 0 },
              },
              totalRegisteredStock: 230.5,
              totalPendingReceipt: 20,
              totalInConciliation: 5,
            },
          ],
          subtotals: {
            locations: {
              loc_1: { registeredStock: 150.5, pendingReceipt: 20, inConciliation: 5 },
              loc_2: { registeredStock: 80, pendingReceipt: 0, inConciliation: 0 },
            },
            totalRegisteredStock: 230.5,
            totalPendingReceipt: 20,
            totalInConciliation: 5,
          },
        },
      ],
      totals: {
        locations: {
          loc_1: { registeredStock: 150.5, pendingReceipt: 20, inConciliation: 5 },
          loc_2: { registeredStock: 80, pendingReceipt: 0, inConciliation: 0 },
        },
        totalRegisteredStock: 230.5,
        totalPendingReceipt: 20,
        totalInConciliation: 5,
      },
    },
    finishedProduct: {
      type: 'FINISHED_PRODUCT',
      title: 'PRODUCTOS TERMINADOS',
      categories: [
        {
          id_category: 2,
          category_name: 'LINGOTES',
          products: [
            {
              id_product: 20,
              cod: 'PT-LIN-01',
              name: 'Lingote de Bronce',
              unit: 'UND',
              observations: '',
              locations: {
                loc_1: { registeredStock: 40, pendingReceipt: 0, inConciliation: 0 },
                loc_2: { registeredStock: 60, pendingReceipt: 10, inConciliation: 2 },
              },
              totalRegisteredStock: 100,
              totalPendingReceipt: 10,
              totalInConciliation: 2,
            },
          ],
          subtotals: {
            locations: {
              loc_1: { registeredStock: 40, pendingReceipt: 0, inConciliation: 0 },
              loc_2: { registeredStock: 60, pendingReceipt: 10, inConciliation: 2 },
            },
            totalRegisteredStock: 100,
            totalPendingReceipt: 10,
            totalInConciliation: 2,
          },
        },
      ],
      totals: {
        locations: {
          loc_1: { registeredStock: 40, pendingReceipt: 0, inConciliation: 0 },
          loc_2: { registeredStock: 60, pendingReceipt: 10, inConciliation: 2 },
        },
        totalRegisteredStock: 100,
        totalPendingReceipt: 10,
        totalInConciliation: 2,
      },
    },
  },
  grandTotals: {
    locations: {
      loc_1: { registeredStock: 190.5, pendingReceipt: 20, inConciliation: 5 },
      loc_2: { registeredStock: 140, pendingReceipt: 10, inConciliation: 2 },
    },
    totalRegisteredStock: 330.5,
    totalPendingReceipt: 30,
    totalInConciliation: 7,
  },
  integrity: { valid: true, errors: [] },
});

test('generateConsolidatedInventoryExcel construye una hoja con fecha de corte, estructura de columnas y valores numéricos correctos', async () => {
  const projection = mockProjection();
  const workbook = await generateConsolidatedInventoryExcel(projection);

  assert.ok(workbook instanceof ExcelJS.Workbook);
  const worksheet = workbook.getWorksheet('Consolidado de inventario');
  assert.ok(worksheet, 'La hoja Consolidado de inventario debe existir');

  // Title in row 1
  const title = worksheet.getRow(1).getCell(1).value;
  assert.match(String(title), /CONSOLIDADO DE INVENTARIO/);

  // Subtitle with cutoff date in row 2
  const subtitle = worksheet.getRow(2).getCell(1).value;
  assert.match(String(subtitle), /Al 29 de Agosto de 2026/);

  // Location headers in row 4
  // Col 1-3: Datos producto
  // Col 4-5: CASA MATRIZ
  // Col 6-7: ORURO
  // Col 8-9: TOTALES CONSOLIDADOS
  // Col 10: OBSERVACIONES
  assert.equal(worksheet.getRow(4).getCell(4).value, 'CASA MATRIZ');
  assert.equal(worksheet.getRow(4).getCell(6).value, 'ORURO');
  assert.equal(worksheet.getRow(4).getCell(8).value, 'TOTALES CONSOLIDADOS');
  assert.equal(worksheet.getRow(4).getCell(10).value, 'OBSERVACIONES');
  assert.deepEqual(worksheet.getRow(5).values.slice(1), [
    'CÓDIGO', 'DESCRIPCIÓN', 'UND',
    'Stock reg.', 'Traslado Pendiente', 'Stock reg.', 'Traslado Pendiente',
    'Stock reg.', 'Traslado Pendiente', 'OBS.',
  ]);
  assert.notEqual(worksheet.getCell('D4').fill.fgColor.argb, worksheet.getCell('F4').fill.fgColor.argb);
  assert.equal(worksheet.getCell('D5').fill.fgColor.argb, worksheet.getCell('E5').fill.fgColor.argb);
  assert.notEqual(worksheet.getCell('D8').fill.fgColor.argb, worksheet.getCell('F8').fill.fgColor.argb);
  assert.equal(worksheet.getCell('D8').fill.fgColor.argb, worksheet.getCell('E8').fill.fgColor.argb);
  assert.equal(worksheet.getCell('A1').fill.fgColor.argb, 'FF1E5B3A');
  assert.equal(worksheet.getCell('D4').fill.fgColor.argb, 'FFD4EBDD');
  assert.equal(worksheet.getCell('A5').fill.fgColor.argb, 'FFE3F3EA');
  const productRow = worksheet.findRow(8);
  assert.equal(productRow.getCell(1).value, 'MP-COB-01');
  assert.equal(productRow.getCell(8).value, 230.5);
  assert.equal(productRow.getCell(9).value, 20);
  assert.equal(productRow.getCell(10).value, 'Lote prioritario');

  // Page setup landscape
  assert.equal(worksheet.pageSetup.orientation, 'landscape');

  // Test buffer write
  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.length > 0, 'Debe generar un binario xlsx no vacío');

  // Reload workbook to ensure valid xlsx structure
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  const reloadedSheet = reloaded.getWorksheet('Consolidado de inventario');
  assert.ok(reloadedSheet);
});
