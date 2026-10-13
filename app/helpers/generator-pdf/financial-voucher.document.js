const moment = require('moment');
const NumeroALetras = require('../numeros-aletras');
const { buildOperationVoucher, companyData, money, field } = require('./operation-voucher.document');
const paymentPanel = payment => ({ title: 'DATOS DE PAGO', fields: [field('Pago con', payment.type_payment), ...(payment.type_payment !== 'EFECTIVO' ? [field('Origen', `${payment.bankOrigin?.name || payment.abonosMultipleOrigin?.name || '-'} | Cuenta: ${payment.account_origin || ''}`), field('Destino', `${payment.bankDestination?.name || payment.abonosMultipleDestination?.name || '-'} | Cuenta: ${payment.account_output || ''}`)] : []), ...(['TRANSFERENCIA', 'QR'].includes(payment.type_payment) && payment.number_transaction ? [field('Transacción NRO', payment.number_transaction)] : [])] });
const buildFinancialVoucher = (account, { payable, payment, decimal }) => {
    const operation = account[payable ? 'input' : 'output'];
    if (!operation) throw new Error('Operación de cuenta no encontrada');
    const document = buildOperationVoucher({ ...operation.get?.({ plain: true }) || operation, sucursal: account.sucursal || operation.sucursal }, { kind: payable ? 'purchase' : 'sale', decimal });
    const entity = account[payable ? 'provider' : 'client'] || operation[payable ? 'provider' : 'client'] || {};
    document.title = payment ? 'COMPROBANTE ABONO' : payable ? 'CUENTA POR PAGAR' : 'CUENTA POR COBRAR';
    document.reference = account.cod;
    document.date = moment(payment ? payment.date_abono : account.date_credit).format('DD/MM/YYYY HH:mm:ss');
    document.company = companyData(account.sucursal);
    const providerFields = [field('Nombre', entity.full_names), field('NIT/CI', entity.number_document), field('Teléfono', entity.cellphone), field('Dirección', entity.direction)];
    const operationDate = operation[payable ? 'date_voucher' : 'date_output'] || account.date_credit;
    const operationFields = [
        field('Concepto', payment ? `Abono crédito ${account.cod} - ${payable ? 'Compra' : 'Venta'} ${operation.cod || ''}` : account.description),
        field(payable ? 'Fecha de compra' : 'Fecha de venta', moment(operationDate).format('DD/MM/YYYY HH:mm:ss')),
        field('Tipo de boleta', operation.type_registry || 'BOLETA'),
        field('N.º de registro', operation.registry_number || operation.number_registry || operation.cod || ''),
        ...(payment ? [field('Monto abono', `Bs. ${money(payment.monto_abono, decimal)} (${NumeroALetras(money(payment.monto_abono, payable ? 2 : decimal))})`)] : []),
    ];
    document.panels = [
        { title: payable ? 'DATOS PROVEEDOR' : 'DATOS CLIENTE', fields: providerFields },
        { title: 'CONCEPTO Y REGISTRO', fields: operationFields },
    ];
    document.sections = document.sections.filter(section => ['DETALLE DE PRODUCTOS', 'TOTALES'].includes(section.title));
    if (!payment) {
        const payments = account[payable ? 'abonosAccountsPayable' : 'abonosAccountsReceivable'] || [];
        document.sections.push({
            title: 'ABONOS Y SALDO',
            columns: ['FECHA', 'MONTO ABONO', 'REGISTRADO POR', 'SALDO RESTANTE'].map((label, index) => ({ label, align: index === 1 || index === 3 ? 'right' : 'left' })),
            rows: [
                ...payments.map(abono => [moment(abono.date_abono).format('DD/MM/YYYY HH:mm'), money(abono.monto_abono, decimal), abono.user?.full_names || '-', money(abono.restante_credito, decimal)]),
                { kind: 'subtotal', cells: ['TOTAL ABONADO', '', '', money(account.monto_abonado, decimal)] },
                { kind: 'total', cells: ['SALDO RESTANTE', '', '', money(account.monto_restante, decimal)] },
            ],
        });
    } else document.sections.push({ title: 'ESTADO DE CUENTA', columns: [{ label: 'CONCEPTO' }, { label: 'BS', align: 'right' }], rows: [['MONTO DE ESTE ABONO', money(payment.monto_abono, decimal)], ['SALDO RESTANTE', money(account.monto_restante, decimal)]] });
    if (payment) document.panels.push(paymentPanel(payment));
    document.observations = payment?.comments;
    document.signatures = payable ? [{ role: 'Recibí conforme', name: entity.full_names || '' }, { role: 'Entregue conforme', name: account.sucursal?.name || '' }] : [{ role: 'Recibí conforme', name: account.sucursal?.name || '' }, { role: 'Entregue conforme', name: entity.full_names || '' }];
    return document;
};
const buildMultiplePaymentVoucher = (payment, accounts, { payable, decimal }) => {
    const entity = payment[payable ? 'provider' : 'client'] || {};
    const ids = payment[payable ? 'ids_abonos_payables' : 'ids_abonos_receivables'] || payment.dataValues?.[payable ? 'ids_abonos_payables' : 'ids_abonos_receivables'] || [];
    let totalPaid = 0;
    let totalBalance = 0;
    const sections = [];
    accounts.forEach(account => {
        const abono = (account[payable ? 'abonosAccountsPayable' : 'abonosAccountsReceivable'] || []).find(item => ids.includes(item.id));
        if (!abono) throw new Error('No se encontró el abono aplicado a la cuenta');
        totalPaid += Number(abono.monto_abono);
        totalBalance += Number(abono.restante_credito);
        const document = buildFinancialVoucher(account, { payable, payment: abono, decimal });
        const operation = account[payable ? 'input' : 'output'];
        sections.push({ ...document.sections[0], title: `${payable ? 'Compra' : 'Venta'} Nº ${operation.cod} · A cuenta: ${money(abono.monto_abono, decimal)} · Saldo: ${money(abono.restante_credito, decimal)}` });
    });
    sections.push({ title: 'RESUMEN', columns: [{ label: 'CONCEPTO' }, { label: 'BS', align: 'right' }], rows: [['A CUENTA', money(totalPaid, decimal)], ['SALDO TOTAL', money(totalBalance, decimal)]] });
    return { variant: 'voucher', paper: 'A4', title: 'COMPROBANTE ABONO MÚLTIPLE', reference: accounts[0]?.cod || '', date: moment(payment.date_abono).format('DD/MM/YYYY HH:mm:ss'), company: companyData(accounts[0]?.sucursal || payment.sucursal), panels: [{ title: payable ? 'ENTREGUE A (PROVEEDOR)' : 'RECIBÍ DE (CLIENTE)', fields: [field('Nombre', entity.full_names), field('NIT/CI', entity.number_document), field('Monto abono', `Bs. ${money(payment.monto_abono, decimal)} (${NumeroALetras(money(payment.monto_abono, decimal))})`), field('Concepto', payment.comments)] }, paymentPanel(payment)], sections, signatures: [{ role: 'Recibí conforme', name: entity.full_names || '' }, { role: 'Entregue conforme', name: payment.sucursal?.name || '' }] };
};
module.exports = { buildFinancialVoucher, buildMultiplePaymentVoucher };
