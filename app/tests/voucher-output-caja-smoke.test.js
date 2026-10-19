const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOperationVoucher } = require('../helpers/generator-pdf/operation-voucher.document');
const { buildCashVoucher } = require('../helpers/generator-pdf/cash-voucher.document');
const { renderReportHtml } = require('../helpers/generator-pdf/report-html.template');
test('venta conserva cliente, forma de pago y detalle de despacho exterior', () => {
 const document = buildOperationVoucher({ cod: 'VEN-010', voucher: 'MAYOR. EXTERIOR', date_output: '2026-10-12', type_output: 'CONTADO', type_payment: 'TRANSFERENCIA', account_output: '00123', bank: { name: 'Banco de prueba' }, client: { full_names: 'Cliente Mayorista', number_document: '11223344' }, outputBig: { origin: 'La Paz', destination: 'Arica', agencia: 'Agencia portuaria', trans_mariti: 'Naviera', number_factura: 'F-10', number_precinto: 'P-20', number_contenedor: 'C-30', type_container: '40', chauffeur: { full_names: 'Chofer', trasport_company: { name: 'Transportes' } }, cargo_truck: { placa: 'ABC-123' } }, detailsOutput: [{ quantity: 2, price: 10, total: 20, product: { name: 'Metal' } }], sub_total: 20, discount: 1, total: 19 }, { kind: 'sale', decimal: 2 });
 const html = renderReportHtml(document);
 for (const text of ['Cliente Mayorista','11223344','Banco de prueba','00123','Arica','Naviera','F-10','P-20','C-30','ABC-123','19,00','BOLIVIANOS DIECINUEVE CON 00/100']) assert.ok(html.includes(text), text);
 assert.equal(document.panels.filter(panel => panel.title === 'FORMA DE PAGO').length, 0);
 assert.equal(document.panels.find(panel => panel.title === 'DATOS OPERACIÓN').fields.find(item => item.label === 'Pago').value, 'TRANSFERENCIA');
});
test('arqueo conserva movimientos, saldos y caja abierta', () => {
 const html = renderReportHtml(buildCashVoucher({ id: 12, date_apertura: '2026-10-12', monto_apertura: 100, user: { full_names: 'Cajero Principal' }, sucursal: { name: 'Sucursal El Alto' } }, { ingresos: [{ description: 'Ingreso prueba', monto: 50 }], gastos: [{ description: 'Gasto prueba', monto: 25 }], total_ingresos: 50, total_gastos: 25, saldo: 25, monto_apertura_mas_saldo: 125 }, 2));
 for (const text of ['Cajero Principal','Ingreso prueba','Gasto prueba','125,00','Caja abierta','SUPERVISOR']) assert.ok(html.includes(text), text);
});
