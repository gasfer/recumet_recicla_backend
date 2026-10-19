'use strict';
const ExcelJS = require('exceljs');
const fs = require('fs');
const { getReportLogoPath } = require('../helpers/report-logo');
const { isKilogramUnit } = require('../helpers/kilogram-units');
const { REPORT_COLORS: colors, solidFill, reportThinBorder } = require('../constants/report-style.constants');

const hasValue = value => value !== null && value !== undefined && String(value).trim() !== '' && String(value).trim() !== '-';
const numeric = value => hasValue(value) && Number.isFinite(Number(value)) ? Number(value) : null;
const firstValue = (...values) => values.find(hasValue) ?? null;
const locations = p => p.report_locations || [];
const locationText = (p, field) => [...new Set(locations(p).map(l => l[field]).filter(hasValue))].join(', ');
const totalKg = p => Array.isArray(p.quantities)
  ? p.quantities.filter(q => isKilogramUnit(q.unit)).reduce((sum, q) => sum + (numeric(q.quantity) || 0), 0)
  : null;
const averageKg = p => {
  const kg = totalKg(p), amount = numeric(p.report_kg_amount);
  return kg > 0 && amount !== null ? amount / kg : null;
};

function generateProviderDirectoryExcel(providers, filters = [], decimal = 2, options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RECUMET S.R.L.';
  const numberFormat = decimal > 0 ? '#,##0.' + '0'.repeat(decimal) : '#,##0';
  const sheet = workbook.addWorksheet(options.sheetName || 'Proveedores', { views: [{ showGridLines: false }] });
  const definitions = (options.columns || [
    ['Código', p => p.id == null ? null : `P-${String(p.id).padStart(3, '0')}`, 15],
    ['Nombre / Razón social', p => [p.type?.code, p.full_names].filter(hasValue).join(' - '), 44],
    ['CI/NIT', p => p.number_document == null ? null : String(p.number_document), 20],
    ['Dirección', p => firstValue(locationText(p, 'address'), p.direction), 42],
    ['Celular', p => { const value = firstValue(p.report_contact?.cellphone, p.cellphone_contact, p.cellphone); return value == null ? null : String(value); }, 20],
    ['Compras', p => numeric(p.total_inputs), 14, '#,##0'],
    ['Total kg', totalKg, 18, numberFormat],
    ['Total Bs', p => numeric(p.total_amount), 22, numberFormat],
    ['Costo promedio (Bs/kg)', averageKg, 24, numberFormat],
    ['Última compra', p => {
      if (!p.date_last_input) return null;
      const date = new Date(p.date_last_input);
      if (!Number.isFinite(date.getTime())) return null;
      // Excel stores a wall-clock date without timezone; preserve the Bolivia calendar day.
      return new Date(date.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' }) + 'T00:00:00Z');
    }, 19, 'dd/mm/yyyy'],
    ['Saldo Bs', p => numeric(p.saldo_cuentas_por_pagar), 22, numberFormat],
  ]).filter((column, index) => index === 1 || options.essentialColumns?.includes(column[0]) || (!options.columns && ['Total kg', 'Total Bs', 'Costo promedio (Bs/kg)'].includes(column[0])) || providers.some(p => hasValue(column[1](p))));
  sheet.columns = definitions.map(c => ({ width: c[2] }));
  const width = definitions.length;
  function banner(text, fill, white = false) {
    const row = sheet.addRow([text]);
    if (width > 1) sheet.mergeCells(row.number, 1, row.number, width);
    const lineCapacity = Math.max(20, definitions.reduce((sum, c) => sum + c[2], 0) * .9);
    row.height = Math.max(30, text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / lineCapacity)), 0) * 15 + 12);
    const cell = row.getCell(1);
    cell.fill = solidFill(fill);
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: white ? colors.textOnDark : colors.text } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    return row;
  }
  const title = sheet.addRow([]);
  const metadata = sheet.addRow([]);
  title.height = 38;
  metadata.height = 38;
  const logoPath = getReportLogoPath();
  const hasLogo = width > 1 && fs.existsSync(logoPath);
  const company = options.company || {};
  const companyLines = [company.city, company.nit ? `NIT: ${company.nit}` : '', company.phone ? `Tel.: ${company.phone}` : '', company.email].filter(Boolean);
  const hasCompanyDetails = hasLogo && width >= 3 && companyLines.length > 0;
  const titleColumn = hasCompanyDetails ? 3 : hasLogo ? 2 : 1;
  if (hasCompanyDetails) {
    sheet.mergeCells('B1:B2');
    const companyCell = sheet.getCell('B1');
    companyCell.value = companyLines.join('\n');
    companyCell.font = { name: 'Arial', size: 10, color: { argb: colors.text } };
    companyCell.alignment = { vertical: 'middle', wrapText: true };
    companyCell.fill = solidFill(colors.row);
  }
  [title, metadata].forEach(row => {
    if (width > titleColumn) sheet.mergeCells(row.number, titleColumn, row.number, width);
    row.getCell(titleColumn).alignment = { vertical: 'middle', wrapText: true };
    row.getCell(titleColumn).fill = solidFill(colors.row);
  });
  title.getCell(titleColumn).value = options.title || 'REPORTE MAESTRO DE PROVEEDORES';
  title.getCell(titleColumn).font = { name: 'Arial', size: 15, bold: true, color: { argb: colors.header } };
  metadata.getCell(titleColumn).value = [company.branchName ? `Sucursal: ${company.branchName}` : '', `${providers.length} ${options.recordLabel || 'proveedores'} · Emitido el ${new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`].filter(Boolean).join('\n');
  metadata.getCell(titleColumn).font = { name: 'Arial', size: 10, color: { argb: colors.text } };
  if (hasLogo) {
    sheet.mergeCells('A1:A2');
    sheet.getCell('A1').fill = solidFill(colors.row);
    const buffer = fs.readFileSync(logoPath);
    const ratio = buffer.readUInt32BE(20) / buffer.readUInt32BE(16);
    const logoWidth = Math.min(96, 64 / ratio, Math.max(40, definitions[0][2] * 7 - 16));
    const logo = workbook.addImage({ buffer, extension: 'png' });
    sheet.addImage(logo, { tl: { col: .08, row: .12 }, ext: { width: logoWidth, height: logoWidth * ratio }, editAs: 'absolute' });
  }
  const selectedFilters = filters.filter(filter => typeof filter === 'string' && filter.trim());
  if (selectedFilters.length) {
    const filterRow = banner(selectedFilters.join('\n'), colors.subheader);
    filterRow.getCell(1).font = { name: 'Arial', size: 10, color: { argb: colors.text } };
    filterRow.getCell(1).border = reportThinBorder;
  }
  const header = sheet.addRow(definitions.map(c => c[0]));
  header.height = 32;
  header.eachCell(cell => {
    cell.fill = solidFill(colors.header);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: colors.textOnDark } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
    cell.border = reportThinBorder;
  });
  providers.forEach((p, index) => {
    const row = sheet.addRow(definitions.map(c => { const value = c[1](p); return hasValue(value) ? value : null; }));
    row.height = Math.max(32, ...definitions.map((c, col) => {
      const value = row.getCell(col + 1).value;
      return typeof value === 'string' ? Math.ceil(value.length / Math.max(8, c[2] - 3)) * 15 + 8 : 32;
    }));
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: colors.text } };
      cell.fill = solidFill(index % 2 ? colors.alternateRow : colors.row);
      cell.border = reportThinBorder;
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: typeof cell.value === 'number' ? 'right' : 'left' };
      if (definitions[col - 1][3]) cell.numFmt = definitions[col - 1][3];
      if (['Compras', 'Total kg', 'Costo promedio (Bs/kg)', 'Total Bs'].includes(definitions[col - 1][0])) cell.fill = solidFill(index % 2 ? colors.total : colors.subheader);
      if (definitions[col - 1][0] === 'Saldo Bs' && Number(cell.value) > 0) cell.fill = solidFill(colors.highlight);
    });
    if (!options.columns && averageKg(p) !== null && p.quantities?.every(q => isKilogramUnit(q.unit))) {
      const kgCell = row.getCell(definitions.findIndex(column => column[0] === 'Total kg') + 1);
      const averageCell = row.getCell(definitions.findIndex(column => column[0] === 'Costo promedio (Bs/kg)') + 1);
      const totalCell = row.getCell(definitions.findIndex(column => column[0] === 'Total Bs') + 1);
      const total = numeric(p.total_amount);
      if (total !== null && Math.abs(total - Number(p.report_kg_amount)) <= 1e-8 * Math.max(1, Math.abs(total))) {
        totalCell.value = { formula: `${kgCell.address}*${averageCell.address}`, result: total };
      }
    }
  });
  if (!providers.length) banner(options.emptyMessage || 'No hay proveedores para los filtros seleccionados.', colors.alternateRow);
  sheet.autoFilter = { from: { row: header.number, column: 1 }, to: { row: Math.max(header.number, header.number + providers.length), column: width } };
  sheet.views = [{ state: 'frozen', ySplit: header.number, xSplit: definitions[0][0] === 'Código' ? 2 : 1, showGridLines: false }];
  if (providers.length) {
    banner(options.note || 'Costo promedio ponderado = importe comprado en kg / total kg del filtro. Para compras en kg: Total Bs = Total kg × Costo promedio. Las demás unidades requieren conversión para expresarse en kg.', colors.observations);
  }
  sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `1:${header.number}` };
  sheet.headerFooter.oddFooter = 'RECUMET S.R.L. | Página &P de &N';
  return workbook;
}
module.exports = { generateProviderDirectoryExcel };
