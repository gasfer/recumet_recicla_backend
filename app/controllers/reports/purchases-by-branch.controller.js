const { selectedReportFilters } = require('../../services/report-selected-filters.service');
'use strict';
const { buildPurchasesByBranchReport } = require('../../services/purchases-by-branch-report.service');
const { generatePurchasesByBranchExcel } = require('../../services/purchases-by-branch-excel.service');

async function exportPurchasesByBranch(req, res) {
  try {
    const byProvider = String(req.query.by_provider || '').toLowerCase() === 'true';
    const report = await buildPurchasesByBranchReport(req.query, { byProvider });
    report.selectedFilters = await selectedReportFilters({ ...req.query, id_sucursales: req.query.id_sucursal, id_storages: req.query.id_storage, id_products: req.query.id_products });
    const workbook = await generatePurchasesByBranchExcel(report);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reporte_compras_x_sucursal_${report.period.start}_${report.period.end}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generando reporte de compras por sucursal:', error);
    if (!res.headersSent) res.status(error.statusCode || 500).json({ ok: false, errors: [{ msg: error.statusCode ? error.message : 'No se pudo generar el reporte de compras por sucursal.' }] });
  }
}
module.exports = { exportPurchasesByBranch };
