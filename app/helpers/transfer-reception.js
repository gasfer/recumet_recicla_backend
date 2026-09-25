const { isAcceptedToleranceDecision } = require('../constants/transfer-reception-accounting');
const { getDecimalPlaces } = require('./decimals-value');
const { decimalAdd, decimalCompare, decimalSubtract, decimalToNumber } = require('./number-formatter');

const isValidReceivedQuantity = (value) => {
    if (value === null || value === undefined || value === '') return false;
    const str = String(value).trim();
    try {
        return decimalCompare(decimalToNumber(str), 0) >= 0;
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
            return { errors: [`La cantidad recibida del detalle ${detailId} debe ser un número no negativo de hasta ${getDecimalPlaces()} decimales.`] };
        }

        detailsById.set(detailId, {
            quantityReceived: decimalToNumber(incomingDetail.quantity_received),
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
    const sent = decimalToNumber(sentQuantity || 0);
    const received = decimalToNumber(receivedQuantity || 0);

    return {
        sent,
        base: decimalCompare(sent, received) <= 0 ? sent : received,
        excess: decimalCompare(received, sent) > 0 ? decimalSubtract(received, sent) : 0,
        shortage: decimalCompare(sent, received) > 0 ? decimalSubtract(sent, received) : 0,
        received,
    };
};

const buildTransferVoucherSummary = (details, transferStatus, reviewNotes = []) => {
    const received = transferStatus === 'RECEIVED';
    const units = new Set();
    const totals = { sent: 0, received: 0, normal: 0, blocked: 0, accountedTotal: 0, excess: 0, shortage: 0 };

    const rows = details.map((detail) => {
        const sentQuantity = Number(detail?.quantity || 0);
        const receivedQuantity = Number(
            detail?.quantity_received !== null && detail?.quantity_received !== undefined
                ? detail.quantity_received
                : detail?.quantity || 0,
        );
        const reconciliation = reconcileTransferReceipt(sentQuantity, receivedQuantity);
        const excess = received ? reconciliation.excess : 0;
        const shortage = received ? reconciliation.shortage : 0;

        const diffPct = sentQuantity > 0 ? ((receivedQuantity - sentQuantity) / sentQuantity) * 100 : 0;
        const isAccepted = isAcceptedToleranceDecision(detail?.tolerance_decision)
            || (detail?.tolerance_decision === undefined && sentQuantity > 0 && diffPct >= -1 && diffPct <= 1);

        const normal = received ? (isAccepted ? receivedQuantity : Math.min(sentQuantity, receivedQuantity)) : 0;
        const blocked = received ? (isAccepted ? 0 : Math.abs(receivedQuantity - sentQuantity)) : 0;

        let isReleased = false;
        if (detail?.accounting_status === 'CONTABILIZADO' && !isAccepted) {
            isReleased = true;
        } else if (Array.isArray(reviewNotes) && reviewNotes.length > 0) {
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

        const accountedQuantity = normal + (isReleased ? blocked : 0);

        totals.sent = decimalAdd(totals.sent, reconciliation.sent);
        totals.received = decimalAdd(totals.received, reconciliation.received);
        totals.normal = decimalAdd(totals.normal, normal);
        totals.blocked = decimalAdd(totals.blocked, isReleased ? 0 : blocked);
        totals.accountedTotal = decimalAdd(totals.accountedTotal, accountedQuantity);
        totals.excess = decimalAdd(totals.excess, excess);
        totals.shortage = decimalAdd(totals.shortage, shortage);

        if (detail?.product?.unit?.siglas) units.add(detail.product.unit.siglas);

        return {
            sent: reconciliation.sent,
            received: received ? reconciliation.received : '-',
            normal: received ? decimalToNumber(normal) : '-',
            blocked: received ? decimalToNumber(blocked) : 0,
            status: received ? status : 'PENDIENTE',
            excess,
            shortage,
            differencePercentage: received && sentQuantity > 0
                ? `${(((receivedQuantity - sentQuantity) / sentQuantity) * 100).toFixed(2)}%`
                : '-',
            observation: detail?.observation || '-',
        };
    });

    return {
        rows,
        units: [...units],
        totals: {
            ...totals,
            received: received ? totals.received : '-',
            normal: received ? totals.normal : '-',
            blocked: received ? totals.blocked : '-',
            accountedTotal: received ? totals.accountedTotal : '-',
            differencePercentage: received && totals.sent > 0
                ? `${(((totals.received - totals.sent) / totals.sent) * 100).toFixed(2)}%`
                : '-',
        },
    };
};

module.exports = {
    buildReceivedDetails,
    reconcileTransferReceipt,
    buildTransferVoucherSummary,
};
