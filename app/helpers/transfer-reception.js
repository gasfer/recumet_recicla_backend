const RECEIVED_QUANTITY_DECIMAL_PLACES = 2;
const { isAcceptedToleranceDecision } = require('../constants/transfer-reception-accounting');

const isValidReceivedQuantity = (value) => {
    if (value === null || value === undefined || value === '') return false;
    const str = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(str)) {
        const num = Number(value);
        if (!Number.isFinite(num) || num < 0) return false;
        const rounded = Number(num.toFixed(RECEIVED_QUANTITY_DECIMAL_PLACES));
        return Math.abs(num - rounded) < 1e-6;
    }
    return true;
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
            return { errors: [`La cantidad recibida del detalle ${detailId} debe ser un número no negativo de hasta ${RECEIVED_QUANTITY_DECIMAL_PLACES} decimales.`] };
        }

        detailsById.set(detailId, {
            quantityReceived: Number(incomingDetail.quantity_received),
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
    const sent = Number(sentQuantity) || 0;
    const received = Number(receivedQuantity) || 0;
    const round = (value) => Math.round((value + Number.EPSILON) * 10000) / 10000;

    return {
        sent: round(sent),
        base: round(Math.min(sent, received)),
        excess: round(Math.max(0, received - sent)),
        shortage: round(Math.max(0, sent - received)),
        received: round(received),
    };
};

const buildTransferVoucherSummary = (details, transferStatus, reviewNotes = []) => {
    const round = (value) => Math.round((value + Number.EPSILON) * 10000) / 10000;
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

        totals.sent = round(totals.sent + reconciliation.sent);
        totals.received = round(totals.received + reconciliation.received);
        totals.normal = round(totals.normal + normal);
        totals.blocked = round(totals.blocked + (isReleased ? 0 : blocked));
        totals.accountedTotal = round(totals.accountedTotal + accountedQuantity);
        totals.excess = round(totals.excess + excess);
        totals.shortage = round(totals.shortage + shortage);

        if (detail?.product?.unit?.siglas) units.add(detail.product.unit.siglas);

        return {
            sent: reconciliation.sent,
            received: received ? reconciliation.received : '-',
            normal: received ? round(normal) : '-',
            blocked: received ? round(blocked) : 0,
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
