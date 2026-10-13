const moment = require('moment');
const { companyData, money, field } = require('./operation-voucher.document');
const buildCashVoucher = (caja_small, total_movements, decimal) => ({
            title: 'ARQUEO DE CAJA', reference: caja_small.id, paper: 'A4', company: companyData(caja_small.sucursal),
            date: moment().format('DD/MM/YYYY HH:mm:ss'),
            panels: [{ title: 'DATOS DE APERTURA Y CIERRE', fields: [
                field('Fecha apertura', moment(caja_small.date_apertura).format('DD/MM/YYYY HH:mm:ss')),
                field('Fecha cierre', caja_small.date_cierre ? moment(caja_small.date_cierre).format('DD/MM/YYYY HH:mm:ss') : '- (Caja abierta)'),
                field('Cajero', caja_small.user?.full_names), field('Monto apertura', money(caja_small.monto_apertura, decimal)),
            ] }],
            sections: [
                { title: 'INGRESOS', columns: [{ label: 'DESCRIPCIÓN' }, { label: 'MONTO', align: 'right' }], rows: [...total_movements.ingresos.map(item => [item.description, money(item.monto, decimal)]), { kind: 'total', cells: ['TOTAL INGRESOS', money(total_movements.total_ingresos, decimal)] }] },
                { title: 'EGRESOS', columns: [{ label: 'DESCRIPCIÓN' }, { label: 'MONTO', align: 'right' }], rows: [...total_movements.gastos.map(item => [item.description, money(item.monto, decimal)]), { kind: 'total', cells: ['TOTAL GASTOS', money(total_movements.total_gastos, decimal)] }] },
                { title: 'RESUMEN DE SALDOS', columns: [{ label: 'SALDO' }, { label: 'MONTO', align: 'right' }], rows: [['SALDO', money(total_movements.saldo, decimal)], ['MONTO INICIAL + SALDO', money(total_movements.monto_apertura_mas_saldo, decimal)], ['MONTO DE CIERRE', caja_small.monto_cierre ? money(caja_small.monto_cierre, decimal) : '- (Caja abierta)']] },
            ], signatures: [{ role: 'SUPERVISOR', name: '' }, { role: 'CAJERO', name: caja_small.user?.full_names }],
        });
module.exports = { buildCashVoucher };
