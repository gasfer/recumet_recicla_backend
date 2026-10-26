'use strict';

const ExcelJS = require('exceljs');
const fs = require('fs');
const { getReportLogoPath } = require('../helpers/report-logo');
const { REPORT_COLORS, solidFill, reportThinBorder } = require('../constants/report-style.constants');

function buildOutputReportExcel({ title, sheetName, filters, company, columns, rows, decimal = 2, totals = {} }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RECUMET S.R.L.';
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4' },
  });
  const width = columns.length;
  sheet.columns = columns.map(column => ({ width: column.width }));
  const merge = (row, firstColumn = 1) => { if (width > firstColumn) sheet.mergeCells(row.number, firstColumn, row.number, width); };
  const styleBanner = (row, fill, dark = false) => {
    merge(row);
    row.eachCell({ includeEmpty: true }, cell => {
      cell.fill = solidFill(fill);
      cell.border = reportThinBorder;
      cell.font = { name: 'Arial', size: dark ? 12 : 9, bold: dark, color: { argb: dark ? REPORT_COLORS.textOnDark : REPORT_COLORS.text } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  };

  const titleRow = sheet.addRow([title]);
  titleRow.height = 28;

  const companyDetails = [company?.city, company?.nit && `NIT: ${company.nit}`, company?.phone && `Tel.: ${company.phone}`, company?.email].filter(Boolean).join(' · ');
  const issueDetails = [company?.branchName && `Sucursal: ${company.branchName}`, companyDetails, `Emitido el ${new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`].filter(Boolean).join(' · ');
  const contextRow = sheet.addRow([issueDetails]);
  contextRow.height = 26;

  const logoPath = getReportLogoPath();
  const hasLogo = width >= 3 && fs.existsSync(logoPath);
  if (hasLogo) {
    sheet.mergeCells('A1:A2');
    sheet.mergeCells('B1:B2');
    sheet.mergeCells(1, 3, 1, width);
    sheet.mergeCells(2, 3, 2, width);
    sheet.getCell('A1').fill = solidFill(REPORT_COLORS.row);
    sheet.getCell('B1').value = ['RECUMET S.R.L.', companyDetails].filter(Boolean).join('\n');
    sheet.getCell('B1').font = { name: 'Arial', size: 9, bold: true, color: { argb: REPORT_COLORS.text } };
    sheet.getCell('B1').alignment = { vertical: 'middle', wrapText: true };
    sheet.getCell('B1').fill = solidFill(REPORT_COLORS.row);
    const titleCell = sheet.getCell('C1');
    titleCell.value = title;
    titleCell.fill = solidFill(REPORT_COLORS.header);
    titleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: REPORT_COLORS.textOnDark } };
    titleCell.alignment = { vertical: 'middle', wrapText: true };
    titleCell.border = reportThinBorder;
    const contextCell = sheet.getCell('C2');
    contextCell.value = issueDetails;
    contextCell.fill = solidFill(REPORT_COLORS.row);
    contextCell.font = { name: 'Arial', size: 9, color: { argb: REPORT_COLORS.text } };
    contextCell.alignment = { vertical: 'middle', wrapText: true };
    contextCell.border = reportThinBorder;

    const buffer = fs.readFileSync(logoPath);
    const ratio = buffer.readUInt32BE(20) / buffer.readUInt32BE(16);
    const logoWidth = Math.min(88, 54 / ratio, Math.max(40, sheet.getColumn(1).width * 7 - 12));
    const logo = workbook.addImage({ buffer, extension: 'png' });
    sheet.addImage(logo, { tl: { col: .08, row: .12 }, ext: { width: logoWidth, height: logoWidth * ratio }, editAs: 'absolute' });
  } else {
    styleBanner(titleRow, REPORT_COLORS.header, true);
    styleBanner(contextRow, REPORT_COLORS.row);
    titleRow.getCell(1).value = `RECUMET S.R.L. · ${title}`;
  }

  const filterText = filters.filter(Boolean).join(' · ') || 'Filtros: ninguno';
  const filterRow = sheet.addRow([filterText]);
  filterRow.height = Math.max(24, Math.min(56, 14 * Math.ceil(filterText.length / Math.max(48, columns.reduce((sum, column) => sum + column.width, 0) * .9)) + 8));
  styleBanner(filterRow, REPORT_COLORS.subheader);

  const header = sheet.addRow(columns.map(column => column.header));
  header.height = 28;
  header.eachCell(cell => {
    cell.fill = solidFill(REPORT_COLORS.header);
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: REPORT_COLORS.textOnDark } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = reportThinBorder;
  });

  rows.forEach((values, index) => {
    const row = sheet.addRow(values);
    let wrappedLines = 1;
    row.eachCell({ includeEmpty: true }, (cell, columnIndex) => {
      const definition = columns[columnIndex - 1];
      cell.font = { name: 'Arial', size: 9, color: { argb: REPORT_COLORS.text } };
      cell.fill = solidFill(index % 2 ? REPORT_COLORS.alternateRow : REPORT_COLORS.row);
      cell.border = reportThinBorder;
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: typeof cell.value === 'number' ? 'right' : 'left' };
      if (definition.numberFormat) cell.numFmt = definition.numberFormat;
      if (typeof cell.value === 'string') wrappedLines = Math.max(wrappedLines, ...cell.value.split(/\r?\n/).map(line => Math.ceil(line.length / Math.max(8, definition.width - 3))));
    });
    row.height = Math.min(90, wrappedLines * 14 + 4);
  });

  if (!rows.length) {
    const emptyRow = sheet.addRow(['No hay ventas para los filtros seleccionados.']);
    emptyRow.height = 28;
    styleBanner(emptyRow, REPORT_COLORS.alternateRow);
  } else if (Object.keys(totals).length) {
    const values = columns.map(column => Object.prototype.hasOwnProperty.call(totals, column.key) ? totals[column.key] : null);
    values[0] = 'TOTAL GENERAL';
    const totalRow = sheet.addRow(values);
    totalRow.eachCell({ includeEmpty: true }, (cell, columnIndex) => {
      cell.fill = solidFill(REPORT_COLORS.grandTotal);
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: REPORT_COLORS.text } };
      cell.border = reportThinBorder;
      cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'right' : 'left' };
      const definition = columns[columnIndex - 1];
      if (definition.numberFormat) cell.numFmt = definition.numberFormat;
    });
  }

  if (rows.length) sheet.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number + rows.length, column: width } };
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(width).letter}${sheet.lastRow.number}`;
  sheet.headerFooter.oddFooter = 'RECUMET S.R.L. | Página &P de &N';
  return workbook;
}

module.exports = { buildOutputReportExcel };
