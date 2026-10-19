'use strict';
const db = require('../database/config');
const { Op } = require('sequelize');
const moment = require('moment');
const { generateProviderDirectoryExcel } = require('./provider-directory-excel.service');
const { normalizePurchaseReportFilters } = require('./purchase-report-filters.service');
const { excelNumberMask } = require('../helpers/number-formatter');
const { REPORT_COLORS: colors, solidFill, reportThinBorder } = require('../constants/report-style.constants');

async function selectedNames(model, ids, field = 'name') {
  if (!ids.length) return '';
  const rows = await model.findAll({ where: { id: { [Op.in]: ids } }, attributes: [field], raw: true });
  return rows.map(row => row[field]).filter(Boolean).join(', ');
}

async function purchaseExcelContext(query) {
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
  const period = f.filterBy === 'MONTH'
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
  return { company, filters };
}

async function buildPurchaseExcel(query, rows, decimal, summary) {
  const { company, filters } = await purchaseExcelContext(query);
  const numberFormat = excelNumberMask(decimal);
  const columns = summary ? [
    ['Código', r => r.CÓDIGO, 20], ['Producto', r => r.PRODUCTO, 65],
    ['Cantidad', r => r.CANTIDAD, 24, numberFormat],
  ] : [
    ['Código', r => r.CÓDIGO, 18],
    ['Fecha de compra', r => {
      const date = moment.utc(r.FECHA_COMPRA, 'DD/MM/YYYY HH:mm:ss', true);
      return date.isValid() ? date.toDate() : null;
    }, 23, 'dd/mm/yyyy hh:mm:ss'],
    ['Tipo de documento', r => r.TIPO_DOCUMENTO, 22],
    ['N.º de documento', r => r.NRO_DOCUMENTO == null ? null : String(r.NRO_DOCUMENTO), 22],
    ['Proveedor', r => r.PROVEEDOR, 44], ['Detalle', r => r.DETALLE, 65],
    ['Forma de pago', r => r.TIPO, 18], ['Referencia', r => r.REFERENCIA, 44],
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
    title: summary ? 'RESUMEN DE COMPRAS POR PRODUCTO' : 'REPORTE DE COMPRAS',
    sheetName: summary ? 'Resumen producto' : 'Reporte compras',
    recordLabel: summary ? 'productos' : 'compras', company: headerCompany, columns,
    note: summary ? 'Cantidades agrupadas por producto según los filtros seleccionados.' : 'Importes expresados en bolivianos. Total kg corresponde a las compras en kilogramos del filtro.',
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
  const activeColumns = columns.filter((column, index) => index === 1 || rows.some(row => {
    const value = column[1](row);
    return value !== null && value !== undefined && String(value).trim() !== '' && value !== '-';
  }));
  if (!summary) {
    const total = sheet.addRow(activeColumns.map((c, i) => i === 0 ? 'TOTAL GENERAL' : c[0] === 'Total kg' ? rows.reduce((s, r) => s + r.CANT_KG, 0) : c[0] === 'Total Bs' ? rows.reduce((s, r) => s + r.TOTAL, 0) : null));
    total.height = 18;
    total.eachCell({ includeEmpty: true }, (cell, index) => {
      cell.fill = solidFill(colors.grandTotal); cell.border = reportThinBorder;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: colors.text } };
      cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'right' : 'left' };
      if (activeColumns[index - 1][3]) cell.numFmt = activeColumns[index - 1][3];
    });
  }
  return workbook;
}

module.exports = { buildPurchaseExcel, purchaseExcelContext };
