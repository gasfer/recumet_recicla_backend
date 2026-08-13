const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReceivedDetails, reconcileTransferReceipt } = require('../app/helpers/transfer-reception');

const transferDetails = [
    { id: 1, quantity: '21.40' },
    { id: 2, quantity: '10.00' },
];

test('preserva el peso físico recibido y permite excedentes por producto', () => {
    const result = buildReceivedDetails([
        { id_detail: 1, quantity_received: 23, observation: 'BALANZA' },
        { id_detail: 2, quantity_received: 11.6 },
    ], transferDetails);

    assert.equal(result.errors, undefined);
    assert.deepEqual(result.receivedDetails.map(({ detail, quantityReceived }) => ({
        id: detail.id,
        quantityReceived,
    })), [
        { id: 1, quantityReceived: 23 },
        { id: 2, quantityReceived: 11.6 },
    ]);
});

test('rechaza cantidades negativas, no numéricas o con más de dos decimales', () => {
    for (const quantity_received of [-1, 'abc', 1.234]) {
        const result = buildReceivedDetails([{ id_detail: 1, quantity_received }], transferDetails);
        assert.ok(result.errors);
    }
});

test('rechaza detalles ajenos y duplicados', () => {
    assert.ok(buildReceivedDetails([{ id_detail: 99, quantity_received: 1 }], transferDetails).errors);
    assert.ok(buildReceivedDetails([
        { id_detail: 1, quantity_received: 1 },
        { id_detail: 1, quantity_received: 2 },
    ], transferDetails).errors);
});

test('descompone un excedente en recepción base y diferencia consecutiva', () => {
    assert.deepEqual(reconcileTransferReceipt(81.7, 83), {
        sent: 81.7,
        base: 81.7,
        excess: 1.3,
        shortage: 0,
        received: 83,
    });
});

test('concilia varios ítems con excedente, faltante y recepción exacta', () => {
    const reconciliations = [
        reconcileTransferReceipt(10, 12),
        reconcileTransferReceipt(8, 6.5),
        reconcileTransferReceipt(4, 4),
    ];

    assert.deepEqual(reconciliations.map(({ base, excess, shortage, received }) => ({ base, excess, shortage, received })), [
        { base: 10, excess: 2, shortage: 0, received: 12 },
        { base: 6.5, excess: 0, shortage: 1.5, received: 6.5 },
        { base: 4, excess: 0, shortage: 0, received: 4 },
    ]);
});
