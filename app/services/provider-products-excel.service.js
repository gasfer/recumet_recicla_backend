'use strict';
const { generateProviderDirectoryExcel } = require('./provider-directory-excel.service');

function generateProviderProductsExcel(report, filters, decimal, company) {
  const numberFormat = decimal > 0 ? '#,##0.' + '0'.repeat(decimal) : '#,##0';
  return generateProviderDirectoryExcel(report.rows, filters, decimal, {
    company,
    title: 'PROVEEDORES POR PRODUCTO',
    sheetName: 'Proveedores por producto', recordLabel: 'registros de producto y proveedor',
    emptyMessage: 'No hay compras de proveedores por producto para los filtros seleccionados.',
    columns: [
      ['Código producto', p => p.code == null ? null : String(p.code), 20],
      ['Producto', p => p.product, 38],
      ['Categoría', p => p.category, 25],
      ['Unidad', p => p.unit, 12],
      ['Proveedor', p => p.provider, 44],
      ['Tipo proveedor', p => p.providerType, 26],
      ['Sucursal', p => p.branch, 28],
      ['Almacén', p => p.storage, 30],
      ['Boletas', p => p.purchase_count == null ? null : Number(p.purchase_count), 14, '#,##0'],
      ['Cantidad comprada', p => p.quantity, 22, numberFormat],
      ['Promedio Bs/unidad', p => p.average, 23, numberFormat],
      ['Total Bs', p => p.amount, 22, numberFormat],
    ],
    note: 'Cada fila corresponde a un producto, proveedor, sucursal y almacén. El promedio es el importe dividido entre la cantidad comprada, en la unidad indicada. No se suman cantidades de unidades diferentes.',
  });
}

module.exports = { generateProviderProductsExcel };
