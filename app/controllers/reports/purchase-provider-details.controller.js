'use strict';
const { buildProviderPurchasesReport } = require('../../services/provider-purchases-report.service');
const { generateProviderPurchasesExcel } = require('../../services/provider-purchases-excel.service');
const { normalizePurchaseReportFilters } = require('../../services/purchase-report-filters.service');
const { normalizeReportFilters, parseFlexibleDate } = require('../../services/inventory-consolidated-query.service');
const { purchasePeriod } = require('../../services/purchases-by-branch-report.service');
function providerQueryFromPurchaseFilters(raw = {}) {
  const filters = normalizePurchaseReportFilters(raw);
  const period = purchasePeriod(normalizeReportFilters({ ...raw, filterBy: filters.filterBy }));
  const date = parseFlexibleDate(period.start).format('YYYY-MM-DD');
  const dateEnd = parseFlexibleDate(period.end).format('YYYY-MM-DD');
  return {
    date_mode: 'RANGE', date_basis: 'PURCHASES', date, date_end: dateEnd,
    id_sucursales: filters.sucursalIds, id_storages: filters.storageIds,
    id_categories: filters.categoryIds, id_products: filters.productIds,
    id_provider: filters.providerId, id_type_provider: filters.providerTypeId,
    type_registry: filters.registryType, purchase_status: 'ACTIVE', payment_type: filters.typePay,
    purchase_old_customer: filters.oldCustomer, purchase_with_pickup: filters.withPickup,
    purchase_referral_sources: filters.referralSources,
    ...(filters.searchType === 'provider.full_names'
      ? { type: 'full_names', query: filters.query }
      : { purchase_search_type: filters.searchType, purchase_search: filters.query }),
  };
}
async function exportPurchaseProviderDetails(req, res) {
  try {
    const report = await buildProviderPurchasesReport(providerQueryFromPurchaseFilters(req.query), req.userAuth);
    const workbook = await generateProviderPurchasesExcel(report);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sucursal_x_producto_x_proveedor_' + report.fileDate + '.xlsx');
    await workbook.xlsx.write(res); res.end();
  } catch (error) {
    console.error('Error exportando sucursal x producto x proveedor:', error);
    if (!res.headersSent) res.status(error.statusCode || 500).json({ ok: false, errors: [{ msg: error.statusCode ? error.message : 'No se pudo generar el reporte de compras.' }] });
  }
}
module.exports = { exportPurchaseProviderDetails, providerQueryFromPurchaseFilters };
