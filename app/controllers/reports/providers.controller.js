const { getNumberDecimal } = require('../../helpers/company');

const { generateProviderDirectoryExcel } = require('../../services/provider-directory-excel.service');
const management = require('../../services/provider-management.service');
const { buildProviderPurchasesReport } = require('../../services/provider-purchases-report.service');
const { generateProviderProductsExcel } = require('../../services/provider-products-excel.service');

const { providerDirectoryFilters } = require('../../services/provider-directory-filters.service');
const { providerReportHeader } = require('../../services/provider-report-header.service');
const generateExcelProviders = async (req, res) => {
  try {
    const isProducts = req.query.report === 'products';
    const query = { ...req.query, status: true, purchase_status: 'ACTIVE' };
    const configuredDecimal = Number(await getNumberDecimal());
    const decimal = Number.isInteger(configuredDecimal) ? Math.min(8, Math.max(0, configuredDecimal)) : 2;
    const catalogs = await management.catalogs(req.userAuth);
    const filters = providerDirectoryFilters(query, catalogs);
    let workbook;
    if (isProducts) {
      const report = await buildProviderPurchasesReport(query, req.userAuth, { providerManagement: true });
      const company = await providerReportHeader(query, catalogs, req.decimalPolicy?.companyId);
      workbook = generateProviderProductsExcel(report, filters, decimal, company);
    } else {
      const providers = await management.exportRows(query, req.userAuth);
      const company = await providerReportHeader(query, catalogs, req.decimalPolicy?.companyId);
      workbook = generateProviderDirectoryExcel(providers, filters, decimal, { company });
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${isProducts ? 'recumet-proveedores-por-producto.xlsx' : 'recumet-reporte-maestro-proveedores.xlsx'}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generar Excel proveedores:', error.message);
    if (!res.headersSent) res.status(error.statusCode || 500).json({ ok: false, errors: [{ msg: error.statusCode ? error.message : 'No se pudo generar el Excel de proveedores' }] });
  }
};
module.exports = {
  generateExcelProviders,
}
