const moment = require('moment');
const NumeroALetras = require('../numeros-aletras');
const { decimalToNumber, formatDecimalEsBo } = require('../number-formatter');
const companyData = branch => ({ branchName: branch?.name || 'CASA MATRIZ', city: branch?.city, nit: branch?.company?.nit, phone: branch?.cellphone || branch?.phone, email: branch?.email || branch?.company?.email });
const money = (value, decimal = 2) => formatDecimalEsBo(value || 0, decimal);
const field = (label, value) => ({ label, value: value ?? '' });
const detailColumns = [
    { label: 'CÓDIGO', width: 55 }, { label: 'DETALLE', width: 160 },
    { label: 'CANT.', width: 45, align: 'center' }, { label: 'UND', width: 35, align: 'center' },
    { label: 'P.U.', width: 55, align: 'right' }, { label: 'IMPORTE', width: 60, align: 'right' },
];
const buildOperationVoucher = (operation, { kind, decimal = 2, format } = {}) => {
    const purchase = kind === 'purchase';
    const classified = kind === 'classified';
    const thermal = purchase && format === 'rollo';
    const details = operation[purchase ? 'detailsInput' : classified ? 'detailsClassified' : 'detailsOutput'] || [];
    const entity = operation[purchase ? 'provider' : 'client'] || {};
    const quantity = details.reduce((sum, detail) => sum + Number(detail.quantity || 0), 0);
    const units = [...new Set(details.map(detail => detail.product?.unit?.siglas).filter(Boolean))].join(' / ');
    const panels = classified ? [{ title: 'DATOS PRODUCTO ORIGEN', fields: [
        field('Producto', operation.product?.name),
        field('Cantidad clasificada', money(operation.quantity_product, decimal)),
        field('Stock antes', operation.stock_before == null ? 'No registrado' : money(operation.stock_before, decimal)),
        field('Stock actual', operation.stock_after == null ? 'No registrado' : money(operation.stock_after, decimal)),
    ] }] : [
        { title: purchase ? 'DATOS PROVEEDOR' : 'DATOS CLIENTE', fields: [field('Nombre', entity.full_names), field('NIT/CI', entity.number_document), field('Teléfono', entity.cellphone), field('Dirección', entity.direction)] },
    ];
    const operationFields = [field('Registro', `${operation.type_registry || ''} NRO: ${operation.registry_number || operation.number_registry || ''}`), field('Balanza', operation.scale?.name), ...(!purchase ? [field('Almacén', operation.storage?.name)] : []), ...(classified ? [field('Clasificado por', operation.user?.full_names || 'No registrado')] : []), ...(!classified ? [field('Tipo', purchase ? operation.type : operation.type_output)] : [])];
    panels.push({ title: 'DATOS OPERACIÓN', fields: operationFields });
    if (!purchase && !classified) {
        const paymentFields = [field('Pago', operation.type_payment), ...(operation.type_payment !== 'EFECTIVO' ? [field('Cuenta', operation.account_output), field('Banco', operation.bank?.name)] : [])];
        operationFields.push(...paymentFields);
        if (operation.voucher !== 'MENOR' && operation.outputBig) {
            const transport = operation.outputBig;
            panels.push({ title: 'DATOS DE DESPACHO', fields: [field('Origen', transport.origin), field('Destino', transport.destination), field('Empresa', transport.chauffeur?.trasport_company?.name), field('Chofer', transport.chauffeur?.full_names), field('Placa', transport.cargo_truck?.placa), ...(operation.voucher === 'MAYOR. EXTERIOR' ? [field('Agencia portuaria', transport.agencia), field('Transporte marítimo', transport.trans_mariti), field('Factura', transport.number_factura), field('Precinto', transport.number_precinto), field('Contenedor', transport.number_contenedor), field('Tipo de contenedor', transport.type_container)] : []), ...(transport.poliza_seguro ? [field('Póliza de seguro', transport.number_factura)] : [])] });
        }
    }
    const classifiedColumns = [
        { label: 'CÓDIGO', width: 48 }, { label: 'PRODUCTO DESTINO', width: 138 },
        { label: 'CANT.', width: 36, align: 'right' }, { label: 'UND', width: 28, align: 'center' },
        { label: 'STOCK ANTES', width: 48, align: 'right' }, { label: 'STOCK ACTUAL', width: 52, align: 'right' },
    ];
    const columns = thermal ? [{ label: 'CÓDIGO / PRODUCTO', width: 150 }, { label: 'CANT.', width: 70, align: 'right' }] : classified ? classifiedColumns : detailColumns;
    const rows = details.map(detail => thermal ? [`${detail.product?.cod || ''} - ${detail.product?.name || ''}`, `${money(detail.quantity, decimal)} ${detail.product?.unit?.siglas || ''}`] : [detail.product?.cod || '', detail.product?.name || '', money(detail.quantity, decimal), detail.product?.unit?.siglas || '', ...(classified ? [detail.stock_before == null ? '—' : money(detail.stock_before, decimal), detail.stock_after == null ? '—' : money(detail.stock_after, decimal)] : [money(detail.cost ?? detail.price, decimal), money(detail.total, decimal)])]);
    rows.push({ kind: 'total', cells: thermal ? ['TOTAL CANTIDAD', money(quantity, decimal)] : purchase ? [{ text: 'CANTIDAD TOTAL', span: 2 }, '', money(quantity, decimal), units, { text: 'TOTAL IMPORTE', align: 'right' }, { text: money(operation.total, decimal), align: 'right' }] : [{ text: 'CANTIDAD TOTAL', span: 2 }, '', money(quantity, decimal), units, ...(!classified ? ['', ''] : ['', ''])] });
    const sections = [{ ...(!purchase ? { title: 'DETALLE DE PRODUCTOS' } : {}), columns, rows }];
    const accounts = operation[purchase ? 'accounts_payable' : 'accounts_receivable'];
    if (!classified && !thermal && !(purchase && operation.type === 'CREDITO')) sections.push({
        title: 'TOTALES', variant: 'summary',
        amountInWords: `SON: ${NumeroALetras(decimalToNumber(operation.total || 0, decimal))}`,
        note: 'Documento emitido conforme a las políticas de pesaje y control ambiental de residuos valorizables.',
        columns: [{ label: 'CONCEPTO', width: 3 }, { label: 'MONTO BS', width: 2, align: 'right' }],
        rows: [
            ['SUBTOTAL', money(purchase ? operation.sumas : operation.sub_total, decimal)],
            ['DESCUENTO', money(operation.discount, decimal)],
            { kind: 'total', cells: ['TOTAL NETO', money(operation.total, decimal)] },
        ],
    });
    if (purchase && !thermal && operation.type === 'CREDITO') sections.push({
        title: 'RESUMEN DE CRÉDITO', variant: 'summary',
        amountInWords: `SON: ${NumeroALetras(decimalToNumber(operation.total || 0, decimal))}`,
        note: 'Importe total de la compra expresado en bolivianos.',
        columns: [{ label: 'CONCEPTO' }, { label: 'MONTO BS', align: 'right' }],
        rows: [['A CUENTA', money(accounts?.monto_abonado, decimal)], ['SALDO', money(accounts?.monto_restante, decimal)]],
    });
    if (!classified && Array.isArray(accounts) && accounts.length && (purchase ? operation.payment_type !== 'EFECTIVO' : operation.type_output !== 'VENTA' && operation.type_output !== 'OTRO')) sections.push({ title: purchase ? 'CUENTAS POR PAGAR' : 'CUENTAS POR COBRAR', columns: ['CÓDIGO', 'FECHA', 'DESCRIPCIÓN', 'TOTAL', 'SALDO'].map(label => ({ label })), rows: accounts.map(account => [account.cod, moment(account.date_credit).format('DD/MM/YYYY HH:mm:ss'), account.description, money(account.total, decimal), money(account.monto_restante, decimal)]) });
    return {
        variant: thermal ? 'thermal' : 'voucher',
        title: operation.status === 'ANULADO' ? 'ANULADO · ' + (purchase ? 'NOTA DE COMPRA' : 'NOTA DE VENTA') : thermal ? 'COMPROBANTE DE PESAJE' : purchase ? 'NOTA DE COMPRA' : classified ? 'NOTA DE CLASIFICACIÓN' : operation.voucher === 'MENOR' ? 'NOTA DE VENTA' : 'NOTA DE DESPACHO',
        reference: operation.cod, date: moment(operation[purchase ? 'date_voucher' : classified ? 'date_classified' : 'date_output']).format('DD/MM/YYYY HH:mm:ss'),
        company: companyData(operation.sucursal), paper: thermal ? { width: 226.77, height: 'auto' } : details.length <= (purchase ? 5 : 6) ? 'HALF_LETTER' : 'LETTER',
        panels, sections, observations: operation.comments,
        signatures: thermal ? [] : [{ role: 'Recibí conforme', name: purchase ? `PROVEEDOR: ${entity.full_names || ''}` : classified ? '' : 'Responsable de almacén' }, { role: 'Entregue conforme', name: purchase ? 'RESPONSABLE CAJA' : classified ? 'Responsable de almacén' : 'Cliente' }],
    };
};
module.exports = { buildOperationVoucher, companyData, money, field };
