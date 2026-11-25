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
 for (const text of ['Cajero Principal','Ingreso prueba','Gasto prueba','125,00','Caja abierta','SUPERVISOR','RESUMEN DE CAJA']) assert.ok(html.includes(text), text);
});

test('cierre diario presenta cuadre de efectivo y banco y desglosa cada movimiento', () => {
 const document = buildCashVoucher({
  id: 52, cashbox_type: 'CHICA', date_apertura: '2026-11-19T08:00:00Z', date_cierre: '2026-11-19T17:00:00Z',
  monto_apertura: 100, monto_cierre: 138, user: { full_names: 'Cajera QA' }, sucursal: { name: 'Casa Matriz' },
 }, {
  accountSummary: [
   { id_cuenta: 1, name: 'Efectivo', type: 'CASH', currency: 'BOB', opening_amount: 100, inflows: 50, outflows: 12, expected_amount: 138 },
   { id_cuenta: 2, name: 'Banco Económico', type: 'BANK', currency: 'BOB', opening_amount: 20, inflows: 30, outflows: 10, expected_amount: 40 },
  ],
  closeDetails: [
   { id_cuenta: 1, counted_amount: 138, difference: 0 },
   { id_cuenta: 2, counted_amount: 38, difference: -2 },
  ],
  ingresos: [{ id_cuenta: 1, date: '2026-11-19T10:00:00Z', description: 'Venta mostrador', type_payment: 'EFECTIVO', monto: 50 }],
  gastos: [{ id_cuenta: 2, date: '2026-11-19T11:00:00Z', description: 'Compra insumos', account_payment: 'Banco Económico', type_payment: 'TRANSFERENCIA', monto: 10 }],
  closeObservations: 'Diferencia bancaria verificada',
 }, 2);
 const html = renderReportHtml(document);
 for (const text of ['CIERRE DIARIO DE CAJA CHICA','CUADRE GENERAL POR CUENTA','EFECTIVO (BOB)','Banco Económico (BOB)','SALDO CONTADO','FALTANTE','Venta mostrador','Compra insumos','Diferencia bancaria verificada']) assert.ok(html.includes(text), text);
 assert.equal(document.orientation, 'landscape');
});
