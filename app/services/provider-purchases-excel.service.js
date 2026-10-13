'use strict';
const ExcelJS = require('exceljs');
const fs = require('fs');
const { getReportLogoPath } = require('../helpers/report-logo');
const { REPORT_COLORS, solidFill, reportThinBorder } = require('../constants/report-style.constants');
const PROVIDER_PURCHASE_HEADERS = Object.freeze([
  'Código producto', 'Producto', 'Categoría', 'UND', 'Tipo proveedor', 'Proveedor',
  'Cantidad comprada', 'Costo promedio (Bs)', 'Total compra (Bs)',
]);
const FILTER_LABELS = Object.freeze({
  'Sucursales': 'Sucursal', 'Área / Almacén': 'Almacén', 'Categorías': 'Categorías',
  'Productos': 'Productos', 'Tipo de proveedor': 'Tipo proveedor', 'Proveedor': 'Proveedor',
  'Tipo filtrado': 'Período', 'Fecha': 'Fechas', 'Referencia': 'Referencia',
  'Estado de compras': 'Estado compras', 'Pago': 'Pago', 'Búsqueda': 'Búsqueda',
});
function filterRowsFromSummary(summary, availableWidth) {
  const entries = String(summary || '').split('\n').map(line => {
    const separator = line.indexOf(':');
    if (separator < 0) return { label: 'Filtro', value: line.trim() };
    const sourceLabel = line.slice(0, separator).trim();
    return { label: FILTER_LABELS[sourceLabel] || sourceLabel, value: line.slice(separator + 1).trim() };
  }).filter(item => item.value);
  if (!entries.length) return [];
  const estimatedWidth = item => item.label.length + item.value.length + 5;
  const total = entries.reduce((sum, item) => sum + estimatedWidth(item), 0);
  const rowCount = total <= availableWidth ? 1 : 2;
  const rows = Array.from({ length: rowCount }, () => []);
  entries.forEach((item, index) => {
    const rowIndex = rowCount === 1 ? 0 : index % rowCount;
    rows[rowIndex].push(item);
  });
  return rows;
}
async function generateProviderPurchasesExcel(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RECUMET S.R.L.'; workbook.created = new Date();
  const sheet = workbook.addWorksheet('Compras por categoría', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 5 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:6' },
  });
  sheet.columns = [21, 32, 24, 8, 32, 30, 18, 18, 20].map(width => ({ width }));
  const totalColumnWidth = sheet.columns.reduce((sum, column) => sum + Number(column.width || 0), 0);
  const styleRow = (row, fill, bold = false, dark = false) => {
    for (let column = 1; column <= 9; column++) {
      const cell = row.getCell(column);
      cell.font = { name: 'Arial', size: 9, bold, color: { argb: dark ? REPORT_COLORS.textOnDark : REPORT_COLORS.text } };
      cell.fill = solidFill(fill); cell.border = reportThinBorder;
      cell.alignment = { vertical: 'middle', horizontal: column >= 7 ? 'right' : 'left', wrapText: true };
      if (column >= 7) cell.numFmt = column === 8 ? '#,##0.0000' : '#,##0.00##';
    }
  };
  const title = sheet.addRow(['RECUMET · COMPRAS POR CATEGORÍA Y PROVEEDOR']);
  sheet.mergeCells('A1:I1'); title.height = 28; styleRow(title, REPORT_COLORS.header, true, true);
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  const period = sheet.addRow([(report.purchaseStatus === 'INACTIVE' ? 'COMPRAS ANULADAS · ' : 'COMPRAS ACTIVAS · ') + report.period.label]);
  sheet.mergeCells('A2:I2'); period.height = 20; styleRow(period, REPORT_COLORS.subheader, true);
  const filterRows = filterRowsFromSummary(report.selectedFilters, totalColumnWidth * 0.92);
  const filterStartRow = 3;
  filterRows.forEach((items, index) => {
    const rowNumber = filterStartRow + index;
    const row = sheet.getRow(rowNumber);
    const availableColumns = 9;
    let column = 1;
    items.forEach((item, itemIndex) => {
      const remainingItems = items.length - itemIndex;
      const remainingColumns = availableColumns - column + 1;
      const span = Math.max(1, Math.floor(remainingColumns / remainingItems));
      const lastColumn = Math.min(availableColumns, column + span - 1);
      if (lastColumn > column) sheet.mergeCells(rowNumber, column, rowNumber, lastColumn);
      const cell = row.getCell(column);
      cell.value = `${item.label}: ${item.value}`;
      cell.font = { name: 'Arial', size: 8, color: { argb: 'FF334155' } };
      cell.fill = solidFill(index % 2 ? REPORT_COLORS.row : REPORT_COLORS.subheader);
      cell.border = reportThinBorder;
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      column = lastColumn + 1;
    });
    row.height = Math.max(20, ...items.map(item => Math.ceil((item.label.length + item.value.length + 3) / (totalColumnWidth / items.length * 1.15)) * 12 + 4));
  });
  const logoPath = getReportLogoPath();
  if (fs.existsSync(logoPath)) {
    const png = fs.readFileSync(logoPath), ratio = png.readUInt32BE(20) / png.readUInt32BE(16);
    const width = Math.min(110, 44 / ratio);
    const logo = workbook.addImage({ buffer: png, extension: 'png' });
    sheet.addImage(logo, { tl: { col: .2, row: .2 }, ext: { width, height: width * ratio }, editAs: 'absolute' });
  }
  const noteRow = filterStartRow + filterRows.length;
  const note = sheet.getRow(noteRow);
  note.getCell(1).value = 'Costo promedio = importe de compras / cantidad comprada. Cantidades expresadas en la unidad del producto.';
  sheet.mergeCells(noteRow, 1, noteRow, 9); note.height = 18;
  note.getCell(1).font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF64748B' } };
  note.getCell(1).alignment = { wrapText: true, vertical: 'middle' };
  const header = sheet.addRow(PROVIDER_PURCHASE_HEADERS);
  styleRow(header, REPORT_COLORS.header, true, true); header.height = 30;
  sheet.views[0].ySplit = header.number;
  sheet.pageSetup.printTitlesRow = `1:${header.number}`;
  const units = new Map(); let totalAmount = 0;
  const grouped = new Map();
  for (const item of report.rows) {
    const key = item.category || 'SIN CATEGORÍA';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  const groupTotals = [];
  let alternate = false;
  for (const [category, items] of grouped) {
    const categoryRow = sheet.addRow([category]);
    sheet.mergeCells(categoryRow.number, 1, categoryRow.number, 9);
    styleRow(categoryRow, REPORT_COLORS.productData, true); categoryRow.height = 22;
    const categoryStart = categoryRow.number + 1;
    for (const item of items) {
      const row = sheet.addRow([item.code, item.product, category, item.unit, item.providerType, item.provider, item.quantity, null, item.amount]);
      styleRow(row, alternate ? REPORT_COLORS.alternateRow : REPORT_COLORS.row); alternate = !alternate;
      row.height = Math.max(28, ...[item.code, item.product, category, item.unit, item.providerType, item.provider].map((value, i) => Math.ceil(String(value || '').length / [21, 32, 24, 8, 32, 30][i]) * 12 + 6));
      row.getCell(8).value = { formula: 'IFERROR(I' + row.number + '/G' + row.number + ',0)', result: item.average };
      row.getCell(9).font = { name: 'Arial', size: 9, bold: true };
      const unit = units.get(item.unit) || { quantity: 0, amount: 0 };
      unit.quantity += item.quantity; unit.amount += item.amount;
      units.set(item.unit, unit); totalAmount += item.amount;
    }
    const categoryUnits = new Map();
    for (const item of items) {
      const unit = categoryUnits.get(item.unit) || { quantity: 0, amount: 0 };
      unit.quantity += item.quantity; unit.amount += item.amount; categoryUnits.set(item.unit, unit);
    }
    for (const [unitName, subtotal] of categoryUnits) {
      const row = sheet.addRow([`TOTAL ${category} (${unitName})`, '', '', '', '', '', subtotal.quantity, null, subtotal.amount]);
      sheet.mergeCells(row.number, 1, row.number, 6);
      styleRow(row, REPORT_COLORS.total, true); row.height = 22;
      row.getCell(8).value = { formula: 'IFERROR(I' + row.number + '/G' + row.number + ',0)', result: subtotal.quantity ? subtotal.amount / subtotal.quantity : 0 };
    }
    groupTotals.push({ category, firstRow: categoryStart, lastRow: sheet.lastRow.number, items });
  }
  const headerRowNumber = header.number;
  const lastDataRow = Math.max(headerRowNumber, sheet.lastRow.number);
  for (const [unit, total] of units) {
    const row = sheet.addRow(['TOTAL GENERAL (' + unit + ')', '', '', '', '', '', total.quantity, null, total.amount]);
    sheet.mergeCells(row.number, 1, row.number, 6);
    styleRow(row, REPORT_COLORS.total, true); row.height = 24;
    row.getCell(8).value = { formula: 'IFERROR(I' + row.number + '/G' + row.number + ',0)', result: total.quantity ? total.amount / total.quantity : 0 };
  }
  const total = sheet.addRow(['TOTAL GENERAL', '', '', '', '', '', null, null, totalAmount]);
  sheet.mergeCells(total.number, 1, total.number, 6); styleRow(total, REPORT_COLORS.grandTotal, true); total.height = 24;
  if (units.size === 1) {
    const values = [...units.values()][0]; total.getCell(7).value = values.quantity;
    total.getCell(8).value = { formula: 'IFERROR(I' + total.number + '/G' + total.number + ',0)', result: values.quantity ? totalAmount / values.quantity : 0 };
  }
  if (!report.rows.length) {
    const row = sheet.addRow(['No hay compras de proveedores para los filtros seleccionados.']);
    sheet.mergeCells(row.number, 1, row.number, 9);
  }
  sheet.autoFilter = { from: 'A' + headerRowNumber, to: 'I' + Math.max(headerRowNumber, sheet.lastRow.number) };
  sheet.pageSetup.printArea = 'A1:I' + sheet.lastRow.number; sheet.pageSetup.horizontalCentered = true;
  sheet.pageSetup.margins = { left: .2, right: .2, top: .3, bottom: .3, header: .15, footer: .15 };
  sheet.headerFooter.oddFooter = 'RECUMET S.R.L. | Página &P de &N';
  workbook.calcProperties.fullCalcOnLoad = true;
  return workbook;
}
module.exports = { PROVIDER_PURCHASE_HEADERS, generateProviderPurchasesExcel };
