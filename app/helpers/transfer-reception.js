const { isAcceptedToleranceDecision } = require('../constants/transfer-reception-accounting');
const { exactAdd, exactSubtract, exactCompare, exactMin, exactAbs, exactCeil } = require('./number-formatter');
const { evaluateReceiptTolerance } = require('../services/transfer-reception-tolerance.service');

const isValidReceivedQuantity = (value) => {
    if (value === null || value === undefined || value === '') return false;
    const str = String(value).trim();
    if (!/^\d+(?:\.\d+)?$/.test(str)) return false;
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
    for (const incomingDetail of incomingDetails || []) {
        const detailId = Number(incomingDetail?.id_detail);

        if (!Number.isInteger(detailId) || detailsById.has(detailId)) {
            return { errors: ['Cada detalle de recepción debe tener un identificador único.'] };
        }

        if (!isValidReceivedQuantity(incomingDetail.quantity_received)) {
            return { errors: [`La cantidad recibida del detalle ${detailId} debe ser un número no negativo válido.`] };
        }

        detailsById.set(detailId, {
            quantityReceived: exactCeil(incomingDetail.quantity_received),
            observation: incomingDetail.observation ?? null,
        });
    }

    const transferDetailIds = new Set(transferDetails.map((detail) => Number(detail.id)));
    for (const detailId of detailsById.keys()) {
        if (!transferDetailIds.has(detailId)) {
            return { errors: [`El detalle ${detailId} no pertenece al traslado.`] };
        }
    }

    if (detailsById.size !== transferDetails.length) {
        const missingIds = transferDetails
            .map((detail) => Number(detail.id))
            .filter((detailId) => !detailsById.has(detailId));
        return { errors: [`Debe registrar el peso recibido de todos los detalles. Faltan: ${missingIds.join(', ')}.`] };
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
        const isAccepted = isAcceptedToleranceDecision(detail?.tolerance_decision)
            || (detail?.tolerance_decision === undefined && exactCompare(sentQuantity, 0) > 0 && tolerance.decision === 'ACEPTADO');

        const normal = received ? (isAccepted ? receivedQuantity : exactMin(sentQuantity, receivedQuantity)) : '0.0000';
        const blocked = received ? (isAccepted ? '0.0000' : exactAbs(exactSubtract(receivedQuantity, sentQuantity))) : '0.0000';

        let isReleased = false;
        if (Array.isArray(reviewNotes) && reviewNotes.length > 0) {
            for (const note of reviewNotes) {
                const matchingDetail = (note.details || []).find((d) => Number(d.id_detail_transfer) === Number(detail.id));
                if (matchingDetail && (matchingDetail.reconciliation_status === 'COMPLETADO' || note.reconciliation_status === 'COMPLETADO')) {
                    isReleased = true;
                    break;
                }
            }
        }

        let status = 'PENDIENTE';
        if (received) {
            if (isAccepted) {
                status = 'ACEPTADO';
            } else if (isReleased) {
                status = 'LIBERADO';
            } else {
                status = 'EN REVISIÓN';
            }
        }

        const accountedQuantity = exactAdd(normal, isReleased ? blocked : 0);

        totals.sent = exactAdd(totals.sent, reconciliation.sent);
        totals.received = exactAdd(totals.received, reconciliation.received);
        totals.normal = exactAdd(totals.normal, normal);
        totals.blocked = exactAdd(totals.blocked, isReleased ? 0 : blocked);
        totals.accountedTotal = exactAdd(totals.accountedTotal, accountedQuantity);
        totals.excess = exactAdd(totals.excess, excess);
        totals.shortage = exactAdd(totals.shortage, shortage);

        if (detail?.product?.unit?.siglas) units.add(detail.product.unit.siglas);

        return {
            sent: Number(reconciliation.sent),
            received: received ? Number(reconciliation.received) : '-',
            normal: received ? Number(normal) : '-',
            blocked: received ? Number(blocked) : 0,
            status: received ? status : 'PENDIENTE',
            excess: Number(excess),
            shortage: Number(shortage),
            differencePercentage: received && exactCompare(sentQuantity, 0) > 0
                ? `${evaluateReceiptTolerance(sentQuantity, receivedQuantity).differencePercentage.toFixed(2)}%`
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
            normal: received ? Number(totals.normal) : '-',
            blocked: received ? Number(totals.blocked) : '-',
            accountedTotal: received ? Number(totals.accountedTotal) : '-',
            excess: Number(totals.excess),
            shortage: Number(totals.shortage),
            differencePercentage: received && exactCompare(totals.sent, 0) > 0
                ? `${evaluateReceiptTolerance(totals.sent, totals.received).differencePercentage.toFixed(2)}%`
                : '-',
        },
    };
};

module.exports = {
    buildReceivedDetails,
    reconcileTransferReceipt,
    buildTransferVoucherSummary,
};
