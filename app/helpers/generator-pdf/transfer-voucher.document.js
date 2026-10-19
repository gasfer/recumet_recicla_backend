const moment = require('moment');
const { decimalAdd, formatDecimalEsBo } = require('../number-formatter');
const { field } = require('./operation-voucher.document');
const quantity = (value, decimal) => value === '-' ? '-' : formatDecimalEsBo(value || 0, decimal);
const buildTransferDocument = (transfer, summary, reviewNotes = [], decimal = 2) => {
    const reception = Boolean(summary);
    const details = transfer.detailsTransfers || [];
    const columns = reception ? ['PRODUCTO', 'UND', 'ENVIADO', 'RECIBIDO', 'NORMAL', 'BLOQUEADO', 'DIF. %', 'ESTADO', 'OBS.'].map((label, index) => ({ label, width: index === 0 ? 100 : index === 8 ? 90 : 50 })) : [{ label: 'CÓDIGO', width: 55 }, { label: 'DETALLE', width: 160 }, { label: 'UND', width: 35 }, { label: 'CANT.', width: 55, align: 'right' }];
    const rows = reception ? summary.rows.map((row, index) => [`${details[index]?.product?.cod || ''} - ${details[index]?.product?.name || ''}`, details[index]?.product?.unit?.siglas, quantity(row.sent, decimal), quantity(row.received, decimal), quantity(row.normal, decimal), quantity(row.blocked, decimal), row.differencePercentage, row.status, row.observation]) : details.map(detail => [detail.product?.cod, detail.product?.name, detail.product?.unit?.siglas, quantity(detail.quantity, decimal)]);
    rows.push({ kind: 'total', cells: reception ? ['PESOS TOTALES', summary.units.join(','), quantity(summary.totals.sent, decimal), quantity(summary.totals.received, decimal), quantity(summary.totals.normal, decimal), quantity(summary.totals.blocked, decimal), '', '', ''] : [{ text: 'PESOS TOTALES', span: 2 }, '', [...new Set(details.map(detail => detail.product?.unit?.siglas).filter(Boolean))].join(','), quantity(details.reduce((sum, detail) => decimalAdd(sum, detail.quantity || 0, 4), 0), decimal)] });
    const sections = [{ title: 'DETALLE DE PRODUCTOS', columns, rows }];
    const reconciliations = reviewNotes.flatMap(note => note.details.map(detail => [`${detail.product.cod} - ${detail.product.name}`, note.type === 'EXCEDENTE_PARA_REVISION' ? 'EXCEDENTE' : 'FALTANTE', quantity(detail.quantity_difference, decimal), quantity(detail.quantity_resolved, decimal), note.reconciliation_status, note.assignedUser?.full_names || 'SIN ASIGNAR', note.type === 'EXCEDENTE_PARA_REVISION' ? `${detail.product.cod} - ${detail.product.name}` : note.registeredProduct ? `${note.registeredProduct.cod} - ${note.registeredProduct.name}` : '-', detail.resolutionActions.flatMap(action => action.movementLinks.map(link => `#${link.id_kardex_movement}`)).join(', ') || '-']));
    if (reconciliations.length) {
        const total = type => reviewNotes.filter(note => note.type === type).reduce((sum, note) => sum + note.details.reduce((subtotal, detail) => subtotal + Number(detail.quantity_difference), 0), 0);
        reconciliations.push({ kind: 'total', cells: ['TOTALES', `EXC: ${quantity(total('EXCEDENTE_PARA_REVISION'), decimal)}`, `FAL: ${quantity(total('FALTANTE_PARA_REVISION'), decimal)}`, '', '', '', '', ''] });
        sections.push({ title: 'CONCILIACIÓN DE DIFERENCIAS REGISTRADAS', columns: ['PRODUCTO ORIGEN', 'TIPO', 'KG REG.', 'KG CONC.', 'ESTADO', 'RESPONSABLE', 'PRODUCTO DESTINO', 'KARDEX'].map(label => ({ label })), rows: reconciliations });
    }
    return {
        variant: 'voucher', panelLayout: reception ? 'three-columns' : 'two-columns', title: reception ? 'GUÍA DE RECEPCIÓN' : 'GUÍA DE TRASLADO', reference: transfer.cod,
        date: moment(reception ? transfer.date_received : transfer.date_send).format('DD/MM/YYYY HH:mm:ss'), company: companyData(transfer.sucursal_send),
        paper: details.length <= 6 ? 'HALF_LETTER' : 'LETTER', orientation: reception ? 'landscape' : 'portrait',
        panels: [
            { title: 'ORIGEN', fields: [field('Sucursal', transfer.sucursal_send?.name), field('Almacén', transfer.storage_send?.name), field('Fecha envío', moment(transfer.date_send).format('DD/MM/YYYY HH:mm:ss'))] },
            { title: 'DESTINO', fields: [field('Sucursal', transfer.sucursal_received?.name), field('Almacén', transfer.storage_received?.name)] },
            { title: 'REGISTRO', fields: [field(`P/${transfer.type_registry} NRO`, transfer.registry_number), field('Balanza', transfer.scale?.name)] },
        ], sections,
        observations: `OBSERVACIONES ENVÍO: ${transfer.observations_send || ''}${reception ? '\nOBSERVACIONES RECEPCIÓN: ' + (transfer.observations_received || '') : ''}`,
        signatures: [{ role: 'Entregue conforme', name: transfer.user_send?.full_names || 'Responsable de almacén' }, { role: 'Recibí conforme', name: transfer.user_received?.full_names || 'Chofer' }],
    };
};
module.exports = { buildTransferDocument };
