const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOperationVoucher } = require('../helpers/generator-pdf/operation-voucher.document');
const { renderReportHtml } = require('../helpers/generator-pdf/report-html.template');
const branch = { name: 'Sucursal Central', company: { nit: '10203040' }, cellphone: '77788899', email: 'central@recumet.com' };
test('clasificado conserva producto, registro, balanza, almacén y firmas', () => {
  const html = renderReportHtml(buildOperationVoucher({ cod: 'CLA-001', date_classified: '2026-10-12', product: { name: 'Cobre Limpio' }, quantity_product: 150, number_registry: 'REG-123', type_registry: 'INGRESO', scale: { name: 'Balanza 1' }, storage: { name: 'Almacén Principal' }, comments: 'Nota de prueba', sucursal: branch, detailsClassified: [{ quantity: 150, product: { cod: 'COB', name: 'Cobre', unit: { siglas: 'KG' } } }] }, { kind: 'classified', decimal: 2 }));
  for (const text of ['Cobre Limpio','REG-123','Balanza 1','Almacén Principal','Nota de prueba','10203040','Recibí conforme','150']) assert.ok(html.includes(text), text);
});
test('compra conserva proveedor, contacto, detalle, descuento y total', () => {
  const html = renderReportHtml(buildOperationVoucher({ cod: 'COM-005', date_voucher: '2026-10-12', type: 'CONTADO', registry_number: 'R-999', type_registry: 'COMPRA', provider: { full_names: 'Proveedor SRL', number_document: '987654321', cellphone: '71234567', direction: 'Av. Industrial 45' }, comments: 'Pago en efectivo', sucursal: branch, sumas: 20, discount: 2, total: 18, detailsInput: [{ quantity: 2, cost: 10, total: 20, product: { cod: 'P1', name: 'Metal', unit: { siglas: 'KG' } } }] }, { kind: 'purchase', decimal: 2 }));
  for (const text of ['Proveedor SRL','987654321','71234567','Av. Industrial 45','R-999','20,00','2,00','18,00']) assert.ok(html.includes(text), text);
});
