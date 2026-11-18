const { exactAdd, exactSubtract, exactCompare, exactCeil, formatDecimalEsBo } = require('./number-formatter');
const { getDecimalPlaces } = require('./decimals-value');
const { evaluateReceiptTolerance } = require('../services/transfer-reception-tolerance.service');
const { isAcceptedToleranceDecision } = require('../constants/transfer-reception-accounting');

const isValidReceivedQuantity = (value) => {
    if (value === null || value === undefined || value === '') return false;
    const str = String(value).trim();
    if (!/^\d+(?:\.\d+)?$/.test(str)) return false;
    if ((str.split('.')[1] || '').length > getDecimalPlaces()) return false;
    try {
        return exactCompare(str, 0) >= 0;
    } catch (_) {
        return false;
    }
};

const buildReceivedDetails = (incomingDetails, transferDetails) => {
    if (incomingDetails !== undefined && !Array.isArray(incomingDetails)) {
        return { errors: ['El detalle de recepción debe ser una lista.'] };
    }

    const detailsById = new Map();
    const detailLabel = (detailId) => {
        const detail = transferDetails.find((item) => Number(item.id) === Number(detailId));
        const product = detail?.product;
        const label = product?.name
            ? `${product.cod ? `${product.cod} - ` : ''}${product.name}`
            : `detalle ${detailId}`;
        return label;
    };
    for (const incomingDetail of incomingDetails || []) {
        const detailId = Number(incomingDetail?.id_detail);

        if (!Number.isInteger(detailId) || detailsById.has(detailId)) {
            return { errors: ['Cada detalle de recepción debe tener un identificador único.'] };
        }

        if (!isValidReceivedQuantity(incomingDetail.quantity_received)) {
            return { errors: [`${detailLabel(detailId)}: ingrese una cantidad recibida no negativa con hasta ${getDecimalPlaces()} decimales.`] };
        }

        detailsById.set(detailId, {
            quantityReceived: exactCeil(incomingDetail.quantity_received),
            observation: incomingDetail.observation ?? null,
        });
    }

    const transferDetailIds = new Set(transferDetails.map((detail) => Number(detail.id)));
    for (const detailId of detailsById.keys()) {
        if (!transferDetailIds.has(detailId)) {
            return { errors: [`El detalle ${detailId} no pertenece al traslado seleccionado. Actualice la pantalla y vuelva a cargar la recepción.`] };
        }
    }

    if (detailsById.size !== transferDetails.length) {
        const missingIds = transferDetails
            .map((detail) => Number(detail.id))
            .filter((detailId) => !detailsById.has(detailId));
        const missingLabels = missingIds.map(detailLabel);
        return { errors: [`Registre la cantidad recibida de todos los productos. Faltan: ${missingLabels.join('; ')}.`] };
    }

    const receivedDetails = transferDetails.map((detail) => {
        const receivedDetail = detailsById.get(Number(detail.id));
        const quantityReceived = receivedDetail.quantityReceived;

        return {
            detail,
            quantityReceived,
            observation: receivedDetail ? receivedDetail.observation : null,
        };
    });

    return { receivedDetails };
};

const reconcileTransferReceipt = (sentQuantity, receivedQuantity) => {
    const sent = exactAdd(sentQuantity || 0, 0);
    const received = exactAdd(receivedQuantity || 0, 0);

    return {
        sent,
        base: exactCompare(sent, received) <= 0 ? sent : received,
        excess: exactCompare(received, sent) > 0 ? exactSubtract(received, sent) : '0.0000',
        shortage: exactCompare(sent, received) > 0 ? exactSubtract(sent, received) : '0.0000',
        received,
    };
};

const buildTransferVoucherSummary = (details, transferStatus, reviewNotes = []) => {
    const received = transferStatus === 'RECEIVED';
    const units = new Set();
    const totals = { sent: '0.0000', received: '0.0000', normal: '0.0000', blocked: '0.0000', accountedTotal: '0.0000', excess: '0.0000', shortage: '0.0000' };

    const rows = details.map((detail) => {
        const sentQuantity = exactAdd(detail?.quantity || 0, 0);
        const receivedQuantity = exactAdd(
            detail?.quantity_received !== null && detail?.quantity_received !== undefined
                ? detail.quantity_received
                : detail?.quantity || 0,
        );
        const reconciliation = reconcileTransferReceipt(sentQuantity, receivedQuantity);
        const excess = received ? reconciliation.excess : 0;
        const shortage = received ? reconciliation.shortage : 0;

        const tolerance = evaluateReceiptTolerance(sentQuantity, receivedQuantity);
        const normal = received ? reconciliation.base : '0.0000';
        const linkedDetails = reviewNotes.flatMap((note) => note.details || [])
          .filter((noteDetail) => Number(noteDetail.id_detail_transfer) === Number(detail.id));
        const unresolved = linkedDetails.reduce((sum, noteDetail) => {
          const activeHolds = (noteDetail.inventoryHolds || [])
            .filter(({ disposition }) => disposition !== 'LIBERADO_POR_AJUSTE')
            .reduce((holdTotal, hold) => exactAdd(holdTotal, hold.quantity || 0), '0.0000');
          const notePending = exactCompare(activeHolds, 0) > 0
            ? activeHolds
            : exactSubtract(noteDetail.quantity_difference || 0, noteDetail.quantity_resolved || 0);
          return exactAdd(sum, exactCompare(notePending, 0) > 0 ? notePending : 0);
        }, '0.0000');
        const differenceAmount = exactAdd(excess || 0, shortage || 0);
        const blocked = received
          ? exactCompare(unresolved, 0) > 0
            ? unresolved
            : isAcceptedToleranceDecision(tolerance.decision) ? '0.0000' : differenceAmount
          : '0.0000';
        const status = !received ? 'PENDIENTE'
          : exactCompare(blocked, 0) > 0 ? 'EN REVISIÓN'
            : isAcceptedToleranceDecision(tolerance.decision) ? 'ACEPTADO' : 'CONCILIADO';
        const difference = received ? exactSubtract(receivedQuantity, sentQuantity) : '-';
        const accountedQuantity = normal;

        totals.sent = exactAdd(totals.sent, reconciliation.sent);
        totals.received = exactAdd(totals.received, reconciliation.received);
        totals.normal = exactAdd(totals.normal, normal);
        totals.blocked = exactAdd(totals.blocked, blocked);
        totals.accountedTotal = exactAdd(totals.accountedTotal, accountedQuantity);
        totals.excess = exactAdd(totals.excess, excess);
        totals.shortage = exactAdd(totals.shortage, shortage);

        if (detail?.product?.unit?.siglas) units.add(detail.product.unit.siglas);

        return {
            sent: Number(reconciliation.sent),
            received: received ? Number(reconciliation.received) : '-',
            difference: received ? Number(difference) : '-',
            normal: received ? Number(normal) : '-',
            blocked: received ? Number(blocked) : 0,
            status: received ? status : 'PENDIENTE',
            excess: Number(excess),
            shortage: Number(shortage),
            differencePercentage: received && exactCompare(sentQuantity, 0) > 0
                ? `${formatDecimalEsBo(evaluateReceiptTolerance(sentQuantity, receivedQuantity).differencePercentage)}%`
                : '-',
            observation: detail?.observation || '-',
        };
    });

    return {
        rows,
        units: [...units],
        totals: {
            sent: Number(totals.sent),
            received: received ? Number(totals.received) : '-',
            difference: received ? Number(exactSubtract(totals.received, totals.sent)) : '-',
            normal: received ? Number(totals.normal) : '-',
            blocked: received ? Number(totals.blocked) : '-',
            accountedTotal: received ? Number(totals.accountedTotal) : '-',
            excess: Number(totals.excess),
            shortage: Number(totals.shortage),
            differencePercentage: received && exactCompare(totals.sent, 0) > 0
                ? `${formatDecimalEsBo(evaluateReceiptTolerance(totals.sent, totals.received).differencePercentage)}%`
                : '-',
        },
    };
};

module.exports = {
    buildReceivedDetails,
    reconcileTransferReceipt,
    buildTransferVoucherSummary,
};
