const RECEIVED_QUANTITY_DECIMAL_PLACES = 2;

const isValidReceivedQuantity = (value) => {
    const quantity = Number(value);

    const scale = 10 ** RECEIVED_QUANTITY_DECIMAL_PLACES;

    return Number.isFinite(quantity)
        && quantity >= 0
        && Math.abs((quantity * scale) - Math.round(quantity * scale)) < Number.EPSILON * scale;
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

    const receivedDetails = transferDetails.map((detail) => {
        const receivedDetail = detailsById.get(Number(detail.id));
        const quantityReceived = receivedDetail ? receivedDetail.quantityReceived : Number(detail.quantity);

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

const buildTransferVoucherSummary = (details, transferStatus) => {
    const round = (value) => Math.round((value + Number.EPSILON) * 10000) / 10000;
    const received = transferStatus === 'RECEIVED';
    const units = new Set();
    const totals = { sent: 0, received: 0, excess: 0, shortage: 0 };

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

        totals.sent = round(totals.sent + reconciliation.sent);
        totals.received = round(totals.received + reconciliation.received);
        totals.excess = round(totals.excess + excess);
        totals.shortage = round(totals.shortage + shortage);

        if (detail?.product?.unit?.siglas) units.add(detail.product.unit.siglas);

        return {
            sent: reconciliation.sent,
            received: received ? reconciliation.received : '-',
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
