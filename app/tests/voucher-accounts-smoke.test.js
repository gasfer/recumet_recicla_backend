const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFinancialVoucher, buildMultiplePaymentVoucher } = require('../helpers/generator-pdf/financial-voucher.document');
const { renderReportHtml } = require('../helpers/generator-pdf/report-html.template');
function account(payable, id = 1) { const operation = { cod: 'OP-' + id, date_voucher: '2026-09-12T12:14:44', date_output: '2026-09-12T12:14:44', provider: { full_names: 'Proveedor', number_document: '123' }, client: { full_names: 'Cliente', number_document: '456' }, detailsInput: [], detailsOutput: [], sumas: 100, sub_total: 100, discount: 0, total: 100 }; return { id, cod: 'CTA-' + id, date_credit: '2026-10-12', monto_abonado: 25, monto_restante: 75, sucursal: { name: 'Matriz', company: { nit: '99887766' } }, [payable ? 'input' : 'output']: operation, [payable ? 'abonosAccountsPayable' : 'abonosAccountsReceivable']: [{ id, date_abono: '2026-10-12', monto_abono: 25, restante_credito: 75, total_abonado: 25, user: { full_names: 'Cajero' } }] }; }
for (const payable of [true, false]) {
 test((payable ? 'CxP' : 'CxC') + ' conserva saldo, historia de abonos y entidad', () => {
  const document = buildFinancialVoucher(account(payable), { payable, decimal: 2 });
  const html = renderReportHtml(document);
  for (const text of ['25,00','75,00','Cajero','99887766',payable ? 'Proveedor' : 'Cliente']) assert.ok(html.includes(text), text);
  assert.equal(document.panels.length, 2);
  assert.equal(document.panels[0].title, payable ? 'DATOS PROVEEDOR' : 'DATOS CLIENTE');
  assert.equal(document.panels[1].title, 'CONCEPTO Y REGISTRO');
  for (const label of [payable ? 'Fecha de compra' : 'Fecha de venta', 'Tipo de boleta', 'N.º de registro']) assert.ok(document.panels[1].fields.some(item => item.label === label), label);
  assert.ok(document.panels[1].fields.find(item => item.label === (payable ? 'Fecha de compra' : 'Fecha de venta')).value.includes('12/09/2026'));
  assert.equal(document.sections.filter(section => /ABONOS|ESTADO DE CUENTA/.test(section.title)).length, 1);
  assert.equal(document.sections.find(section => section.title === 'ABONOS Y SALDO').columns.length, 4);
  assert.ok(document.sections.some(section => section.variant === 'summary' && section.amountInWords));
 });
 test((payable ? 'CxP' : 'CxC') + ' abono conserva bancos, cuentas y transacción', () => {
  const html = renderReportHtml(buildFinancialVoucher(account(payable), { payable, decimal: 2, payment: { date_abono: '2026-10-12', monto_abono: 25, type_payment: 'TRANSFERENCIA', bankOrigin: { name: 'Origen' }, bankDestination: { name: 'Destino' }, account_origin: '0001', account_output: '0002', number_transaction: 'TX-123' } }));
  for (const text of ['Origen','Destino','0001','0002','TX-123']) assert.ok(html.includes(text), text);
 });
 test((payable ? 'CxP' : 'CxC') + ' abono múltiple conserva cuentas aplicadas y suma numérica de saldos', () => {
  const document = buildMultiplePaymentVoucher({ date_abono: '2026-10-12', monto_abono: 50, type_payment: 'EFECTIVO', [payable ? 'ids_abonos_payables' : 'ids_abonos_receivables']: [1,2] }, [account(payable,1),account(payable,2)], { payable, decimal: 2 });
  const html = renderReportHtml(document);
  for (const text of ['OP-1','OP-2','50,00','150,00']) assert.ok(html.includes(text), text);
  assert.throws(() => buildMultiplePaymentVoucher({ ids_abonos_payables: [] }, [account(true)], { payable: true, decimal: 2 }), /abono aplicado/);
 });
}
