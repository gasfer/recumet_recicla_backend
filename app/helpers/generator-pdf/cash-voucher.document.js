const moment = require('moment');
const { companyData, money, field } = require('./operation-voucher.document');

const accountLabel = account => `${account.type === 'CASH' ? 'EFECTIVO' : account.name} (${account.currency})`;
const movementAccountId = item => Number(item.id_cuenta || item.account?.id || 0);
const movementObservation = item => item.account_payment || item.account?.name || (item.id_bank ? `Banco ${item.id_bank}` : '-');
const movementDate = item => item.date ? moment(item.date).format('DD/MM/YYYY HH:mm') : item.createdAt ? moment(item.createdAt).format('DD/MM/YYYY HH:mm') : '-';

const movementSection = (title, items = [], accounts = [], decimal = 2) => {
    const unmatched = items.some(item => !accounts.some(account => Number(account.id_cuenta) === movementAccountId(item)));
    const columns = [
        { label: 'FECHA', width: 12 },
        { label: 'DETALLE', width: 25 },
        { label: 'OBSERVACIÓN', width: 18 },
        { label: 'TIPO', width: 12 },
        ...accounts.map(account => ({ label: accountLabel(account), width: 12, align: 'right' })),
        ...(unmatched ? [{ label: 'SIN CUENTA', width: 12, align: 'right' }] : []),
    ];
    const sums = new Map(accounts.map(account => [Number(account.id_cuenta), 0]));
    let unmatchedTotal = 0;
    const rows = items.map(item => {
        const id = movementAccountId(item);
        const accountExists = accounts.some(account => Number(account.id_cuenta) === id);
        if (accountExists) sums.set(id, Number(sums.get(id) || 0) + Number(item.monto || 0));
        else unmatchedTotal += Number(item.monto || 0);
        return [
            movementDate(item), item.description || '-', movementObservation(item), item.type_payment || item.type || '-',
            ...accounts.map(account => Number(account.id_cuenta) === id ? money(item.monto, decimal) : '-'),
            ...(unmatched ? [accountExists ? '-' : money(item.monto, decimal)] : []),
        ];
    });
    if (rows.length) rows.push({ kind: 'total', cells: [
        { text: `TOTAL ${title}`, span: 4 }, '', '', '',
        ...accounts.map(account => money(sums.get(Number(account.id_cuenta)) || 0, decimal)),
        ...(unmatched ? [money(unmatchedTotal, decimal)] : []),
    ] });
    else rows.push(['-', 'Sin registros', '-', '-', ...accounts.map(() => '-'), ...(unmatched ? ['-'] : [])]);
    return { title, columns, rows };
};

const buildCashVoucher = (caja_small, total_movements, decimal) => {
    const accounts = total_movements.accountSummary || [];
    const incomeRows = total_movements.ingresos || [];
    const expenseRows = total_movements.gastos || [];
    const closeDetails = total_movements.closeDetails || [];
    const hasClosing = Boolean(caja_small.date_cierre || closeDetails.length);
    const currencyTotals = new Map();
    for (const account of accounts) {
        const total = currencyTotals.get(account.currency) || { currency: account.currency, expected: 0, counted: 0, difference: 0 };
        const close = closeDetails.find(item => Number(item.id_cuenta) === Number(account.id_cuenta));
        total.expected += Number(account.expected_amount || 0);
        total.counted += Number(close?.counted_amount ?? account.expected_amount ?? 0);
        total.difference += Number(close?.difference || 0);
        currencyTotals.set(account.currency, total);
    }
    const summaryRows = accounts.map(account => {
        const close = closeDetails.find(item => Number(item.id_cuenta) === Number(account.id_cuenta));
        const difference = Number(close?.difference || 0);
        return [
            accountLabel(account), money(account.opening_amount, decimal), money(account.inflows, decimal),
            money(account.outflows, decimal), money(account.expected_amount, decimal),
            close ? money(close.counted_amount, decimal) : hasClosing ? 'Sin conteo' : 'Caja abierta',
            close ? `${difference < 0 ? 'FALTANTE' : difference > 0 ? 'SOBRANTE' : 'CUADRADO'} ${money(Math.abs(difference), decimal)}` : '-',
        ];
    });
    for (const total of currencyTotals.values()) {
        summaryRows.push({ kind: 'total', cells: [
            `CONSOLIDADO ${total.currency}`, '', '', '', money(total.expected, decimal), money(total.counted, decimal),
            `${total.difference < 0 ? 'FALTANTE' : total.difference > 0 ? 'SOBRANTE' : 'CUADRADO'} ${money(Math.abs(total.difference), decimal)}`,
        ] });
    }
    const sections = [
        ...(accounts.length ? [{ title: 'CUADRE GENERAL POR CUENTA', columns: [
            { label: 'CUENTA / MONEDA' }, { label: 'SALDO INICIAL', align: 'right' }, { label: 'INGRESOS', align: 'right' },
            { label: 'EGRESOS / GASTOS', align: 'right' }, { label: 'SALDO ESPERADO', align: 'right' },
            { label: 'SALDO CONTADO', align: 'right' }, { label: 'FALTANTE / SOBRANTE', align: 'right' },
        ], rows: summaryRows }] : []),
        ...(!accounts.length ? [{ title: 'RESUMEN DE CAJA', columns: [
            { label: 'CONCEPTO' }, { label: 'MONTO (Bs)', align: 'right' },
        ], rows: [
            ['Saldo inicial', money(total_movements.monto_apertura ?? caja_small.monto_apertura, decimal)],
            ['Ingresos registrados', money(total_movements.total_ingresos, decimal)],
            ['Egresos / gastos', money(total_movements.total_gastos, decimal)],
            ['Saldo neto del turno', money(total_movements.saldo, decimal)],
            { kind: 'total', cells: ['Saldo esperado', money(total_movements.monto_apertura_mas_saldo, decimal)] },
            ['Saldo contado al cierre', caja_small.monto_cierre == null ? 'Caja abierta / sin arqueo' : money(caja_small.monto_cierre, decimal)],
        ] }] : []),
        movementSection('INGRESOS', incomeRows, accounts, decimal),
        movementSection('EGRESOS Y GASTOS', expenseRows, accounts, decimal),
        ...((total_movements.expenseDocuments || []).length ? [{ title: 'DETALLE DOCUMENTAL DE GASTOS', columns: [
            { label: 'FECHA' }, { label: 'CONCEPTO / PROVEEDOR' }, { label: 'COMPROBANTE' },
            { label: 'CATEGORÍA' }, { label: 'CUENTA / MONEDA' }, { label: 'IMPORTE', align: 'right' },
        ], rows: total_movements.expenseDocuments.map(expense => [
            moment(expense.expense_date).format('DD/MM/YYYY'), [expense.concept || expense.description, expense.provider_name].filter(Boolean).join(' / '),
            [expense.receipt_type, expense.receipt_number].filter(Boolean).join(' ') || '-', expense.category?.name || '-',
            `${expense.account?.name || '-'} (${expense.currency || 'BOB'})`, money(expense.amount, decimal),
        ]) }] : []),
        ...(hasClosing ? [{ title: 'RESULTADO DEL ARQUEO', columns: [
            { label: 'MONEDA' }, { label: 'ESPERADO', align: 'right' }, { label: 'CONTADO', align: 'right' },
            { label: 'FALTANTE / SOBRANTE', align: 'right' },
        ], rows: [...currencyTotals.values()].map(total => [
            total.currency, money(total.expected, decimal), money(total.counted, decimal),
            `${total.difference < 0 ? 'FALTANTE' : total.difference > 0 ? 'SOBRANTE' : 'CUADRADO'} ${money(Math.abs(total.difference), decimal)}`,
        ]) }] : []),
    ];
    return {
        title: `CIERRE DIARIO DE CAJA ${caja_small.cashbox_type || 'CHICA'}`,
        reference: `N° ${caja_small.id}`,
        paper: 'LETTER',
        orientation: 'landscape',
        company: companyData(caja_small.sucursal),
        date: moment(caja_small.date_cierre || caja_small.date_apertura).format('DD/MM/YYYY HH:mm:ss'),
        panels: [{ title: 'DATOS DEL TURNO', fields: [
            field('Tipo de caja', caja_small.cashbox_type || 'CHICA'),
            field('Fecha y hora de apertura', moment(caja_small.date_apertura).format('DD/MM/YYYY HH:mm:ss')),
            field('Fecha y hora de cierre', caja_small.date_cierre ? moment(caja_small.date_cierre).format('DD/MM/YYYY HH:mm:ss') : 'Caja abierta'),
            field('Responsable', caja_small.user?.full_names || '-'),
            field('Estado', hasClosing ? 'CERRADA / ARQUEO CONFIRMADO' : 'ABIERTA'),
        ] }],
        sections,
        observations: total_movements.closeObservations || '',
        signatures: [{ role: 'RESPONSABLE DE CAJA', name: caja_small.user?.full_names || '' }, { role: 'ADMINISTRADOR / SUPERVISOR', name: '' }],
    };
};

module.exports = { buildCashVoucher, movementSection };
