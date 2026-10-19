'use strict';
const { purchaseExcelContext } = require('./purchase-management-excel.service');
const { generateProviderDirectoryExcel } = require('./provider-directory-excel.service');
const { excelNumberMask } = require('../helpers/number-formatter');
const { REPORT_COLORS, solidFill } = require('../constants/report-style.constants');

const titleFor = detail => detail ? 'DETALLE DE CLASIFICADOS POR PRODUCTO' : 'REPORTE DE CLASIFICADOS';

async function classifiedReportContext(query, auth = {}) {
  const context = await purchaseExcelContext({ ...query, id_products: query.product_ids || query.id_product });
  if (auth.full_names) context.filters.push(`Emitido por: ${auth.full_names}`);
  return { ...context, date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()) };
}

function classifiedExcel(rows, decimal, context, detail = false) {
  const numberFormat = excelNumberMask(decimal);
  const columns = detail ? [
    ['Código', r => r.product?.cod, 20], ['Producto', r => r.product?.name, 62],
    ['Costo unitario Bs', r => Number(r.cost), 24, numberFormat],
    ['Cantidad', r => Number(r.dataValues.suma_quantity), 22, numberFormat],
  ] : [
    ['Código', r => r.cod, 18],
    ['Fecha de clasificación', r => {
      if (!r.date_classified) return null;
      const value = new Date(r.date_classified);
      if (!Number.isFinite(value.getTime())) return null;
      const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(value);
      return new Date(parts.replace(' ', 'T') + 'Z');
    }, 26, 'dd/mm/yyyy hh:mm:ss'],
    ['Tipo de documento', r => r.type_registry, 22],
    ['N.º de documento', r => r.number_registry == null ? null : String(r.number_registry), 22],
    ['Balanza', r => r.scale?.name, 25], ['Observaciones', r => r.comments, 55],
    ['Producto de origen', r => r.product?.name, 55],
    ['Costo unitario Bs', r => Number(r.cost_product), 24, numberFormat],
    ['Cantidad', r => Number(r.quantity_product), 22, numberFormat],
  ];
  const filters = [...context.filters];
  const workbook = generateProviderDirectoryExcel(rows, filters, decimal, {
    title: titleFor(detail), sheetName: detail ? 'Detalle por producto' : 'Clasificados',
    recordLabel: detail ? 'productos' : 'clasificados',
    company: context.company,
    columns, essentialColumns: ['Código', 'Producto', 'Producto de origen', 'Fecha de clasificación', 'Costo unitario Bs', 'Cantidad'],
    emptyMessage: 'No hay clasificados para los filtros seleccionados.',
    note: 'Datos correspondientes al período y filtros seleccionados. Cantidades expresadas en la unidad de cada producto.',
  });
  const sheet = workbook.worksheets[0];
  const header = sheet.views[0].ySplit;
  const numericColumns = [];
  sheet.getRow(header).eachCell((cell, col) => {
    if (['Costo unitario Bs', 'Cantidad'].includes(cell.value)) numericColumns.push(col);
  });
  for (let index = 0; index < rows.length; index++) {
    const row = sheet.getRow(header + index + 1);
    let lines = 1;
    row.eachCell((cell, col) => {
      if (typeof cell.value === 'string') lines = Math.max(lines, ...cell.value.split(/\r?\n/).map(line => Math.ceil(line.length / Math.max(8, sheet.getColumn(col).width - 3))));
    });
    row.height = lines * 15 + 2;
    for (const col of numericColumns) row.getCell(col).fill = solidFill(index % 2 ? REPORT_COLORS.total : REPORT_COLORS.subheader);
  }
  return workbook;
}

module.exports = { classifiedReportContext, classifiedExcel, titleFor };
