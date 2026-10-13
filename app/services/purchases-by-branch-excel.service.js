const { writeFilterHeader } = require('./report-selected-filters.service');
'use strict';
const ExcelJS = require('exceljs');
const fs = require('fs');
const { getReportLogoPath } = require('../helpers/report-logo');
const { REPORT_COLORS, solidFill, reportThinBorder } = require('../constants/report-style.constants');
const PALETTE = ['FFE8F3EA', 'FFE7EFF9', 'FFFFF4D9', 'FFFBE9E2', 'FFF0EAF8', 'FFE2F3F2', 'FFF3E6EF', 'FFEFF2DF', 'FFE7EDF0', 'FFF6ECDE', 'FFE9E9FA', 'FFEDF5E4'];

async function generatePurchasesByBranchExcel(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RECUMET S.R.L.'; workbook.created = new Date();
  const sheet = workbook.addWorksheet(report.byProvider ? 'Sucursal producto proveedor' : 'Compras x sucursal', { views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }], pageSetup: { orientation: 'landscape', paperSize: 5, fitToPage: true, fitToWidth: 1, fitToHeight: 1, printTitlesRow: '1:5' } });
  const columns = (report.byProvider ? 3 : 2) + report.branches.length * 3 + 2;
  const firstBranchColumn = report.byProvider ? 4 : 3;
  sheet.columns = Array.from({ length: columns }, (_, index) => ({ width: report.byProvider ? (index === 0 ? 6 : index === 1 ? 28 : index === 2 ? 34 : 12) : (index === 0 ? 6 : index === 1 ? 34 : 12) }));
  sheet.properties.defaultRowHeight = 16;
  const styleRow = (row, fill, bold = false, white = false) => {
    for (let c = 1; c <= columns; c++) {
      const cell = row.getCell(c); cell.fill = solidFill(fill); cell.border = reportThinBorder;
      cell.font = { name: 'Arial', size: 8, bold, color: { argb: white ? REPORT_COLORS.textOnDark : REPORT_COLORS.text } };
      cell.alignment = { vertical: 'middle', horizontal: c > 2 ? 'right' : 'left', wrapText: true };
    }
  };
  const firstDataColumn = report.byProvider ? 4 : 3;
  const title = sheet.addRow([report.byProvider ? 'RECUMET · COMPRAS POR SUCURSAL CLASIFICADAS POR PROVEEDOR' : 'RECUMET · COMPRAS POR SUCURSAL']);
  styleRow(title, REPORT_COLORS.header, true, true); title.height = 21; sheet.mergeCells(1, firstDataColumn, 1, columns); title.getCell(firstDataColumn).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const subtitle = sheet.addRow([`PERÍODO: ${report.period.label} · COMPRAS ACTIVAS · IMPORTES EN Bs`]);
  styleRow(subtitle, REPORT_COLORS.subheader); subtitle.height = 18; sheet.mergeCells(2, firstDataColumn, 2, columns); subtitle.getCell(firstDataColumn).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const note = sheet.addRow(['Costo prom. = total compra / cantidad · Cantidades en la unidad registrada del producto.']);
  sheet.mergeCells(3, firstDataColumn, 3, columns); note.height = 16; note.font = { name: 'Arial', size: 7, italic: true, color: { argb: 'FF64748B' } }; note.getCell(firstDataColumn).alignment = { wrapText: true, vertical: 'middle' };
  writeFilterHeader(sheet, { row: 3, fromColumn: firstDataColumn, toColumn: columns, text: report.selectedFilters });
  sheet.mergeCells(1, 1, 3, report.byProvider ? 3 : 2); sheet.getCell('A1').fill = solidFill('FFFFFFFF');
  const logoPath = getReportLogoPath();
  if (fs.existsSync(logoPath)) {
    const png = fs.readFileSync(logoPath);
    const ratio = png.readUInt32BE(20) / png.readUInt32BE(16);
    const logoWidth = Math.min(125, 44 / ratio);
    const image = workbook.addImage({ buffer: png, extension: 'png' });
    sheet.addImage(image, { tl: { col: .2, row: .1 }, ext: { width: logoWidth, height: logoWidth * ratio }, editAs: 'absolute' });
  } else sheet.getCell('A1').value = 'RECUMET';
  const groups = sheet.addRow(['DATOS DEL PRODUCTO']); styleRow(groups, REPORT_COLORS.header, true, true); if (!report.byProvider) sheet.mergeCells(4, 1, 4, 2); groups.height = Math.max(22, ...report.branches.map(branch => Math.ceil(String(branch.name).length / 36) * 10 + 6));
  const headers = sheet.addRow(report.byProvider ? ['N.º', 'PROVEEDOR', 'PRODUCTO / MATERIAL'] : ['N.º', 'PRODUCTO / MATERIAL']); styleRow(headers, REPORT_COLORS.subheader, true); headers.height = 24;
  report.branches.forEach((branch, index) => {
    const first = firstBranchColumn + index * 3, fill = PALETTE[index % PALETTE.length];
    sheet.mergeCells(4, first, 4, first + 2); groups.getCell(first).value = branch.name;
    for (let c = first; c <= first + 2; c++) {
      groups.getCell(c).fill = solidFill(fill); groups.getCell(c).font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF334155' } }; groups.getCell(c).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      headers.getCell(c).value = ['CANT.', 'COSTO PROM.', 'COMPRA (Bs)'][c - first]; headers.getCell(c).fill = solidFill(fill);
    }
  });
  const quantityColumn = columns - 1, amountColumn = columns;
  sheet.mergeCells(4, quantityColumn, 4, amountColumn); groups.getCell(quantityColumn).value = 'TOTAL GENERAL';
  headers.getCell(quantityColumn).value = 'CANT. TOTAL'; headers.getCell(amountColumn).value = 'COMPRA (Bs)';
  const letter = column => sheet.getColumn(column).letter;
  const addTotal = (label, products, firstRow, lastRow, grandTotal = false) => {
    const row = sheet.addRow([label]);
    styleRow(row, grandTotal ? REPORT_COLORS.grandTotal : REPORT_COLORS.total, true);
    sheet.mergeCells(row.number, 1, row.number, report.byProvider ? firstBranchColumn - 1 : 2);
    row.height = Math.max(20, Math.ceil(label.length / 32) * 10 + 5);
    const sameUnit = new Set(products.map(product => product.unit)).size <= 1;
    for (let c = firstBranchColumn; c <= columns; c++) {
      const quantity = c < quantityColumn && (c - firstBranchColumn) % 3 === 0;
      const average = c < quantityColumn && (c - firstBranchColumn) % 3 === 1;
      if ((quantity || average) && !sameUnit) continue;
      const branch = c < quantityColumn ? report.branches[Math.floor((c - firstBranchColumn) / 3)] : undefined;
      const sums = products.reduce((acc, product) => {
      const data = branch ? product.branches[branch.id] || { quantity: 0, amount: 0 } : product;
        acc.quantity += data.quantity; acc.amount += data.amount; return acc;
      }, { quantity: 0, amount: 0 });
      row.getCell(c).value = average
        ? { formula: `IFERROR(${letter(c + 1)}${row.number}/${letter(c - 1)}${row.number},0)`, result: sums.quantity ? sums.amount / sums.quantity : 0 }
        : c === quantityColumn
          ? { formula: lastRow >= firstRow ? `SUBTOTAL(9,${letter(c)}${firstRow}:${letter(c)}${lastRow})` : '0', result: sums.quantity }
          : c === amountColumn
            ? { formula: lastRow >= firstRow ? `SUBTOTAL(9,${letter(c)}${firstRow}:${letter(c)}${lastRow})` : '0', result: sums.amount }
            : { formula: lastRow >= firstRow ? `SUBTOTAL(9,${letter(c)}${firstRow}:${letter(c)}${lastRow})` : '0', result: quantity ? sums.quantity : sums.amount };
      row.getCell(c).numFmt = average ? '#,##0.0000' : '#,##0.00';
    }
    return row;
  };
  let category;
  let categoryProducts = [];
  let categoryStart = 0;
  let itemNumber = 0;
  const providerNames = new Map((report.providers || []).map(provider => [String(provider.id), provider.name]));
  const reportRows = report.byProvider
    ? [...report.products].sort((left, right) => String(left.providerName || '').localeCompare(String(right.providerName || ''), 'es') || String(left.category || '').localeCompare(String(right.category || ''), 'es') || String(left.code || '').localeCompare(String(right.code || ''), 'es'))
    : report.products;
  for (const product of reportRows) {
    if (category !== product.category) {
      if (categoryProducts.length) addTotal(`TOTAL ${category}`, categoryProducts, categoryStart, sheet.lastRow.number);
      category = product.category; categoryProducts = [];
      const row = sheet.addRow([category]); styleRow(row, REPORT_COLORS.productData, true);
      if (report.byProvider) row.getCell(1).value = itemNumber ? '' : category;
      sheet.mergeCells(row.number, 1, row.number, columns);
      categoryStart = row.number + 1;
    }
    categoryProducts.push(product);
    const row = sheet.addRow(report.byProvider
      ? [++itemNumber, product.providerName || providerNames.get(String(product.providerId)) || 'SIN PROVEEDOR', product.name]
      : [++itemNumber, product.name]); styleRow(row, REPORT_COLORS.row);
    row.height = Math.max(16, Math.ceil(String(product.name || '').length / 28) * 10 + 5, report.byProvider ? Math.ceil(String(product.providerName || 'SIN PROVEEDOR').length / 24) * 10 + 5 : 16);
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    if (report.byProvider) row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    const quantityRefs = [], amountRefs = [];
    report.branches.forEach((branch, index) => {
      const data = product.branches[branch.id] || { quantity: 0, amount: 0, average: 0 }, first = firstBranchColumn + index * 3;
      row.getCell(first).value = data.quantity;
      row.getCell(first + 2).value = data.amount;
      row.getCell(first + 1).value = { formula: `IFERROR(${letter(first + 2)}${row.number}/${letter(first)}${row.number},0)`, result: data.average };
      for (let c = first; c <= first + 2; c++) { row.getCell(c).fill = solidFill(PALETTE[index % PALETTE.length]); row.getCell(c).numFmt = c === first + 1 ? '#,##0.0000' : '#,##0.00'; }
      quantityRefs.push(`${letter(first)}${row.number}`); amountRefs.push(`${letter(first + 2)}${row.number}`);
    });
    row.getCell(quantityColumn).value = { formula: `SUM(${quantityRefs.join(',') || '0'})`, result: product.quantity };
    row.getCell(amountColumn).value = { formula: `SUM(${amountRefs.join(',') || '0'})`, result: product.amount };
    row.getCell(quantityColumn).numFmt = row.getCell(amountColumn).numFmt = '#,##0.00';
  }
  if (categoryProducts.length) addTotal(`TOTAL ${category}`, categoryProducts, categoryStart, sheet.lastRow.number);
  const last = sheet.lastRow.number;
  addTotal('TOTAL GENERAL', report.products, 6, last, true);
  const sameUnit = new Set(report.products.map(product => product.unit)).size <= 1;
  if (!sameUnit) { const note = sheet.addRow(['Cantidades totales por columna omitidas: los productos utilizan unidades distintas.']); sheet.mergeCells(note.number, 1, note.number, columns); }
  if (!report.products.length) { const note = sheet.addRow(['No hay compras activas para los filtros seleccionados.']); sheet.mergeCells(note.number, 1, note.number, columns); }
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, last), column: columns } };
  sheet.pageSetup.horizontalCentered = true;
  sheet.pageSetup.margins = { left: .2, right: .2, top: .2, bottom: .2, header: .15, footer: .15 };
  sheet.headerFooter.oddFooter = 'RECUMET S.R.L. | Página &P de &N';
  sheet.pageSetup.printArea = `A1:${letter(columns)}${sheet.lastRow.number}`;
  workbook.calcProperties.fullCalcOnLoad = true;
  return workbook;
}
module.exports = { generatePurchasesByBranchExcel };
