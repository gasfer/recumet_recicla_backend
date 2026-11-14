'use strict';
const db = require('../database/config');
const { Op } = require('sequelize');
const moment = require('moment');
const { generateProviderDirectoryExcel } = require('./provider-directory-excel.service');
const { normalizePurchaseReportFilters } = require('./purchase-report-filters.service');
const { excelNumberMask, exactAdd, formatDecimalEsBo } = require('../helpers/number-formatter');
const { REPORT_COLORS: colors, solidFill, reportThinBorder } = require('../constants/report-style.constants');

async function selectedNames(model, ids, field = 'name') {
  if (!ids.length) return '';
  const rows = await model.findAll({ where: { id: { [Op.in]: ids } }, attributes: [field], raw: true });
  return rows.map(row => row[field]).filter(Boolean).join(', ');
}

async function purchaseExcelContext(query, auth = {}) {
  const f = normalizePurchaseReportFilters(query);
  const branches = await Promise.all(f.sucursalIds.map(id => db.Sucursal.findByPk(id, {
    include: [{ association: 'company', attributes: ['nit', 'email', 'cellphone'] }],
  })));
  const unique = values => [...new Set(values.filter(Boolean))].join(' · ');
  const company = {
    branchName: unique(branches.map(b => b?.name)) || 'Todas las sucursales',
    city: unique(branches.map(b => b?.city)),
    nit: unique(branches.map(b => b?.company?.nit)),
    phone: unique(branches.flatMap(b => [b?.cellphone, b?.company?.cellphone])),
    email: unique(branches.map(b => b?.email || b?.company?.email)),
  };
  const period = f.filterBy === 'ALL' ? 'Todos'
    : f.filterBy === 'MONTH'
    ? moment(`${f.date2}-${f.date1}-01`, 'YYYY-MM-DD').locale('es').format('MMMM [de] YYYY')
    : f.filterBy === 'YEAR' ? f.date1
      : f.filterBy === 'RANGE' ? `${f.date1} al ${f.date2}` : f.date1;
  const filters = [`Período: ${period}`, `Estado: ${f.status === 'ACTIVE' ? 'Activos' : 'Anulados'}`];
  const selections = [
    ['Almacén', db.Storage, f.storageIds],
    ['Proveedor', db.Provider, f.providerId ? [f.providerId] : [], 'full_names'],
    ['Tipo de proveedor / Calificación', db.TypesProvider, f.providerTypeId ? [f.providerTypeId] : []],
    ['Responsable comercial', db.User, f.providerCommercialUserId ? [f.providerCommercialUserId] : [], 'full_names'],
    ['Categorías', db.Category, f.categoryIds],
    ['Productos', db.Product, f.productIds],
  ];
  const labels = await Promise.all(selections.map(async ([label, model, ids, field]) => {
    const names = await selectedNames(model, ids, field);
    return names ? `${label}: ${names}` : '';
  }));
  filters.push(...labels.filter(Boolean));
  if (f.entityType) filters.push(`Tipo de entidad: ${{ PRIVATE: 'Privada', PUBLIC: 'Pública', NGO_FOUNDATION: 'ONG / Fundación', OTHER: 'Otra' }[f.entityType] || f.entityType}`);
  if (f.registryType) filters.push(`Tipo de registro: ${f.registryType}`);
  if (f.typePay) filters.push(`Forma de pago: ${f.typePay === 'CREDITO' ? 'A crédito' : 'Al contado'}`);
  if (f.referralSources) filters.push(`¿Cómo nos conociste?: ${f.referralSources}`);
  if (f.oldCustomer !== undefined) filters.push(`Cliente antiguo: ${f.oldCustomer ? 'Sí' : 'No'}`);
  if (f.withPickup !== undefined) filters.push(`Con recojo: ${f.withPickup ? 'Sí' : 'No'}`);
  if (f.query) filters.push(`Búsqueda (${f.searchType || 'general'}): ${f.query}`);
  if (auth.full_names) filters.push(`Emitido por: ${auth.full_names}`);
  return { company, filters };
}

async function buildPurchaseExcel(query, rows, decimal, summary, auth = {}) {
  const { company, filters } = await purchaseExcelContext(query, auth);
  const numberFormat = excelNumberMask(decimal);
  const columns = summary ? [
    ['N.º', r => r.NRO_FILA, 8, '#,##0'], ['Código', r => r.CÓDIGO, 20], ['Producto', r => r.PRODUCTO, 52],
    ['Unidad', r => r.UNIDAD, 16], ['Cantidad', r => r.CANTIDAD, 24, numberFormat],
  ] : [
    ['N.º', r => r.NRO_FILA, 8, '#,##0'], ['Código', r => r.CÓDIGO, 18],
    ['Fecha de compra', r => {
      const date = moment.utc(r.FECHA_COMPRA, 'DD/MM/YYYY HH:mm:ss', true);
      return date.isValid() ? date.toDate() : null;
    }, 23, 'dd/mm/yyyy hh:mm:ss'],
    ['Tipo de documento', r => r.TIPO_DOCUMENTO, 22],
    ['N.º de documento', r => r.NRO_DOCUMENTO == null ? null : String(r.NRO_DOCUMENTO), 22],
    ['Proveedor', r => r.PROVEEDOR, 44], ['Detalle', r => r.DETALLE, 65],
    ['Condición de pago', r => r.TIPO, 18], ['Medio de pago', r => r.TIPO_PAGO, 18], ['Referencia comercial', r => r.REFERENCIA, 44],
    ['Tipo de proveedor', r => r.TIPO_PROVEEDOR, 26],
    ['Total kg', r => r.CANT_KG, 20, numberFormat], ['Total Bs', r => r.TOTAL, 22, numberFormat],
  ];
  // A narrow product summary reserves the full right-hand area for its title.
  const headerCompany = summary ? { branchName: company.branchName } : company;
  if (summary) {
    const contact = [company.city, company.nit && `NIT: ${company.nit}`, company.phone && `Tel.: ${company.phone}`, company.email].filter(Boolean).join(' · ');
    if (contact) filters.unshift(contact);
  }
  const workbook = generateProviderDirectoryExcel(rows, filters, decimal, {
    title: summary ? 'REPORTE DE COMPRAS POR PRODUCTO' : 'REPORTE DE COMPRAS',
    sheetName: summary ? 'Resumen producto' : 'Reporte compras',
    recordLabel: summary ? 'productos' : 'compras', company: headerCompany, columns, keepEmptyColumns: true, showNote: false,
    note: summary ? 'Cantidades agrupadas por producto y unidad según los filtros seleccionados.' : 'Importes expresados en bolivianos. La cantidad total corresponde a kilogramos comprados.',
  });
  const sheet = workbook.worksheets[0];
  const tableHeader = sheet.views[0].ySplit;
  sheet.getRow(tableHeader).height = 28;
  for (let index = 0; index < rows.length; index++) {
    const row = sheet.getRow(tableHeader + index + 1);
    let lines = 1;
    row.eachCell((cell, column) => {
      if (typeof cell.value !== 'string') return;
      const capacity = Math.max(8, sheet.getColumn(column).width - 3);
      const wrappedLines = cell.value.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / capacity)), 0);
      lines = Math.max(lines, wrappedLines);
    });
    row.height = lines * 15 + 2;
  }
  const totalKg = rows.reduce((sum, row) => exactAdd(sum, row.CANT_KG || 0), '0');
  const totalAmount = rows.reduce((sum, row) => exactAdd(sum, row.TOTAL || 0), '0');
  const totalQuantity = rows.reduce((sum, row) => exactAdd(sum, row.CANTIDAD || 0), '0');
  const quantitiesByUnit = new Map();
  if (summary) rows.forEach(row => {
    const unit = String(row.UNIDAD || 'SIN UNIDAD').trim().toUpperCase();
    quantitiesByUnit.set(unit, exactAdd(quantitiesByUnit.get(unit) || '0', row.CANTIDAD || 0));
  });
  const unitTotals = [...quantitiesByUnit.entries()].sort(([left], [right]) => left.localeCompare(right, 'es')).map(([unit, quantity]) => `${unit}: ${formatDecimalEsBo(Number(quantity), decimal)}`).join(' · ');
  const total = sheet.addRow(columns.map(column => column[0] === 'N.º' ? (summary ? 'TOTALES POR UNIDAD' : 'TOTAL GENERAL')
    : column[0] === 'Total kg' ? Number(totalKg)
      : column[0] === 'Total Bs' ? Number(totalAmount)
        : column[0] === 'Unidad' ? 'Por unidad'
          : column[0] === 'Cantidad' ? (summary ? unitTotals : Number(totalQuantity)) : null));
  total.height = 20;
  total.eachCell({ includeEmpty: true }, (cell, index) => {
    cell.fill = solidFill(colors.grandTotal); cell.border = reportThinBorder;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: colors.text } };
    cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'right' : 'left' };
    if (columns[index - 1]?.[3]) cell.numFmt = columns[index - 1][3];
  });
  return workbook;
}

module.exports = { buildPurchaseExcel, purchaseExcelContext };
