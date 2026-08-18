const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildReceivedDetails,
    reconcileTransferReceipt,
    buildTransferVoucherSummary,
} = require('../app/helpers/transfer-reception');

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

test('resume la boleta recibida con excedente, faltante y pesos totales', () => {
    const summary = buildTransferVoucherSummary([
        { quantity: 10, quantity_received: 12, observation: 'Excedente', product: { unit: { siglas: 'KGR' } } },
        { quantity: 8, quantity_received: 6.5, observation: 'Faltante', product: { unit: { siglas: 'KGR' } } },
        { quantity: 4, quantity_received: 4, product: { unit: { siglas: 'UND' } } },
    ], 'RECEIVED');

    assert.deepEqual(summary.rows, [
        { sent: 10, received: 12, excess: 2, shortage: 0, differencePercentage: '20.00%', observation: 'Excedente' },
        { sent: 8, received: 6.5, excess: 0, shortage: 1.5, differencePercentage: '-18.75%', observation: 'Faltante' },
        { sent: 4, received: 4, excess: 0, shortage: 0, differencePercentage: '0.00%', observation: '-' },
    ]);
    assert.deepEqual(summary.totals, {
        sent: 22,
        received: 22.5,
        excess: 2,
        shortage: 1.5,
        differencePercentage: '2.27%',
    });
    assert.deepEqual(summary.units, ['KGR', 'UND']);
});

const loadReceivedTransfer = (models, notifications = []) => {
    const configPath = require.resolve('../app/database/config');
    const notificationPath = require.resolve('../app/services/notification.service');
    const reviewNoteServicePath = require.resolve('../app/services/transfer-review-note.service');
    const controllerPath = require.resolve('../app/controllers/transfers.controller');
    const cachedConfig = require.cache[configPath];
    const cachedNotification = require.cache[notificationPath];
    const cachedReviewNoteService = require.cache[reviewNoteServicePath];
    const cachedController = require.cache[controllerPath];

    require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: models };
    require.cache[notificationPath] = {
        id: notificationPath,
        filename: notificationPath,
        loaded: true,
        exports: { notifyAdmins: async (payload) => notifications.push(payload) },
    };
    delete require.cache[controllerPath];
    delete require.cache[reviewNoteServicePath];

    const { receivedTransfer } = require('../app/controllers/transfers.controller');
    const restore = () => {
        if (cachedConfig) require.cache[configPath] = cachedConfig;
        else delete require.cache[configPath];
        if (cachedNotification) require.cache[notificationPath] = cachedNotification;
        else delete require.cache[notificationPath];
        if (cachedReviewNoteService) require.cache[reviewNoteServicePath] = cachedReviewNoteService;
        else delete require.cache[reviewNoteServicePath];
        if (cachedController) require.cache[controllerPath] = cachedController;
        else delete require.cache[controllerPath];
    };

    return { receivedTransfer, restore };
};

const responseRecorder = () => {
    const result = {};
    return {
        result,
        response: {
            status: (status) => ({ json: (body) => {
                result.status = status;
                result.body = body;
                return body;
            } }),
        },
    };
};

const pendingTransfer = (details) => ({
    id: 44,
    cod: 'TRAS00044',
    status: 'PENDING',
    date_send: '2026-08-14T08:00:00.000Z',
    id_sucursal_send: 1,
    id_sucursal_received: 2,
    registry_number: 'SF-00044',
    detailsTransfers: details,
    saveCalls: 0,
    async save() { this.saveCalls += 1; },
});

const pendingDetail = (id, productId, quantity) => ({
    id,
    id_product: productId,
    quantity,
    cost: 0,
    saveCalls: 0,
    async save() { this.saveCalls += 1; },
});

test('recepción con excedente actualiza stock, Kardex y una nota independiente', async (t) => {
    const transfer = pendingTransfer([pendingDetail(1, 10, 5)]);
    const operations = { stockCreates: [], kardex: [], notes: [], noteDetails: [], history: [], commits: 0, rollbacks: 0 };
    const transaction = { commit: async () => { operations.commits += 1; }, rollback: async () => { operations.rollbacks += 1; } };
    const { receivedTransfer, restore } = loadReceivedTransfer({
        sequelize: { transaction: async () => transaction },
        Transfers: { findOne: async () => transfer },
        Product: { findOne: async () => null },
        Stock: { findOne: async () => null, create: async (data) => operations.stockCreates.push(data) },
        kardexMovements: { create: async (data) => { operations.kardex.push(data); return { id: operations.kardex.length }; } },
        TransferReviewNote: { create: async (data) => { const note = { ...data, id: operations.notes.length + 1, async save() {} }; operations.notes.push(note); return note; } },
        TransferReviewNoteDetail: { bulkCreate: async (data) => operations.noteDetails.push(...data) },
        History: { create: async (data) => operations.history.push(data) },
    });
    t.after(restore);
    const { response, result } = responseRecorder();

    await receivedTransfer({
        userAuth: { id: 9, full_names: 'Validador' },
        body: {
            id_transfer: 44,
            id_storage_received: 4,
            date_received: '2026-08-14T09:00:00.000Z',
            observations_received: '',
            details: [{ id_detail: 1, quantity_received: 7, observation: 'Balanza' }],
        },
    }, response);

    assert.equal(result.status, 201);
    assert.equal(operations.commits, 1);
    assert.equal(operations.rollbacks, 0);
    assert.equal(operations.stockCreates[0].stock, 7);
    assert.deepEqual(operations.kardex.map(({ details, quantity, id_product }) => ({ details, quantity, id_product })), [
        { details: 'EXCEDENTE TRASPASO #TRAS00044', quantity: 2, id_product: 10 },
    ]);
    assert.equal(operations.notes[0].type, 'EXCEDENTE_PARA_REVISION');
    assert.equal(operations.noteDetails[0].quantity_difference, 2);
});

test('recepción sin diferencia no crea movimientos ni notas de revisión', async (t) => {
    const transfer = pendingTransfer([pendingDetail(1, 10, 5)]);
    const operations = { kardex: 0, commits: 0 };
    const transaction = { commit: async () => { operations.commits += 1; }, rollback: async () => {} };
    const { receivedTransfer, restore } = loadReceivedTransfer({
        sequelize: { transaction: async () => transaction },
        Transfers: { findOne: async () => transfer },
        Product: { findOne: async () => null },
        Stock: { findOne: async () => null, create: async () => {} },
        kardexMovements: { create: async () => { operations.kardex += 1; } },
        History: { create: async () => {} },
        TransferReviewNote: { create: async () => { throw new Error('No debe crear nota'); } },
        TransferReviewNoteDetail: { bulkCreate: async () => { throw new Error('No debe crear detalle'); } },
    });
    t.after(restore);
    const { response, result } = responseRecorder();

    await receivedTransfer({
        userAuth: { id: 9, full_names: 'Validador' },
        body: { id_transfer: 44, id_storage_received: 4, date_received: '2026-08-14T09:00:00.000Z', details: [{ id_detail: 1, quantity_received: 5 }] },
    }, response);

    assert.equal(result.status, 201);
    assert.equal(operations.commits, 1);
    assert.equal(operations.kardex, 0);
});

test('recepción con faltante registra la diferencia consolidada en el producto MERMAS seleccionado', async (t) => {
    const transfer = pendingTransfer([pendingDetail(1, 10, 8)]);
    const operations = { stockCreates: [], kardex: [], notes: [], noteDetails: [], commits: 0, rollbacks: 0 };
    const transaction = { commit: async () => { operations.commits += 1; }, rollback: async () => { operations.rollbacks += 1; } };
    const { receivedTransfer, restore } = loadReceivedTransfer({
        sequelize: { transaction: async () => transaction },
        Transfers: { findOne: async () => transfer },
        Product: { findOne: async () => ({ id: 321, status: true }) },
        Stock: { findOne: async () => null, create: async (data) => operations.stockCreates.push(data) },
        kardexMovements: { create: async (data) => { operations.kardex.push(data); return { id: operations.kardex.length }; } },
        TransferReviewNote: { create: async (data) => { const note = { ...data, id: operations.notes.length + 1, async save() {} }; operations.notes.push(note); return note; } },
        TransferReviewNoteDetail: { bulkCreate: async (data) => operations.noteDetails.push(...data) },
        History: { create: async () => {} },
    });
    t.after(restore);
    const { response, result } = responseRecorder();

    await receivedTransfer({
        userAuth: { id: 9, full_names: 'Validador' },
        body: {
            id_transfer: 44,
            id_storage_received: 4,
            date_received: '2026-08-14T09:00:00.000Z',
            observations_received: '',
            id_merma_product: 321,
            details: [{ id_detail: 1, quantity_received: 6.5, observation: 'Balanza' }],
        },
    }, response);

    assert.equal(result.status, 201);
    assert.equal(operations.commits, 1);
    assert.deepEqual(operations.stockCreates.map(({ id_product, stock }) => ({ id_product, stock })), [
        { id_product: 10, stock: 6.5 },
        { id_product: 321, stock: 1.5 },
    ]);
    assert.deepEqual(operations.kardex.map(({ details, quantity, id_product }) => ({ details, quantity, id_product })), [
        { details: 'MERMA TRASPASO #TRAS00044', quantity: 1.5, id_product: 321 },
    ]);
    assert.equal(operations.notes[0].type, 'FALTANTE_PARA_REVISION');
    assert.equal(operations.noteDetails[0].quantity_difference, 1.5);
});

test('recepción con varios faltantes crea un único movimiento y nota consolidada', async (t) => {
    const transfer = pendingTransfer([pendingDetail(1, 10, 8), pendingDetail(2, 11, 10)]);
    const operations = { stockCreates: [], kardex: [], notes: [], noteDetails: [] };
    const transaction = { commit: async () => {}, rollback: async () => {} };
    const { receivedTransfer, restore } = loadReceivedTransfer({
        sequelize: { transaction: async () => transaction },
        Transfers: { findOne: async () => transfer },
        Product: { findOne: async () => ({ id: 321, status: true }) },
        Stock: { findOne: async () => null, create: async (data) => operations.stockCreates.push(data) },
        kardexMovements: { create: async (data) => { operations.kardex.push(data); return { id: operations.kardex.length }; } },
        TransferReviewNote: { create: async (data) => { const note = { ...data, id: 1, async save() {} }; operations.notes.push(note); return note; } },
        TransferReviewNoteDetail: { bulkCreate: async (data) => operations.noteDetails.push(...data) },
        History: { create: async () => {} },
    });
    t.after(restore);
    const { response, result } = responseRecorder();

    await receivedTransfer({
        userAuth: { id: 9, full_names: 'Validador' },
        body: {
            id_transfer: 44, id_storage_received: 4, id_merma_product: 321,
            date_received: '2026-08-14T09:00:00.000Z', observations_received: '',
            details: [{ id_detail: 1, quantity_received: 6.5 }, { id_detail: 2, quantity_received: 8 }],
        },
    }, response);

    assert.equal(result.status, 201);
    assert.deepEqual(operations.kardex.map(({ quantity, id_product }) => ({ quantity, id_product })), [{ quantity: 3.5, id_product: 321 }]);
    assert.equal(operations.notes.length, 1);
    assert.equal(operations.notes[0].type, 'FALTANTE_PARA_REVISION');
    assert.deepEqual(operations.noteDetails.map(({ id_product, quantity_difference }) => ({ id_product, quantity_difference })), [
        { id_product: 10, quantity_difference: 1.5 },
        { id_product: 11, quantity_difference: 2 },
    ]);
});

test('recepción con varios excedentes crea un movimiento y nota por producto', async (t) => {
    const transfer = pendingTransfer([pendingDetail(1, 10, 5), pendingDetail(2, 11, 8)]);
    const operations = { kardex: [], notes: [], noteDetails: [] };
    const transaction = { commit: async () => {}, rollback: async () => {} };
    const { receivedTransfer, restore } = loadReceivedTransfer({
        sequelize: { transaction: async () => transaction },
        Transfers: { findOne: async () => transfer },
        Product: { findOne: async () => null },
        Stock: { findOne: async () => null, create: async () => {} },
        kardexMovements: { create: async (data) => { operations.kardex.push(data); return { id: operations.kardex.length }; } },
        TransferReviewNote: { create: async (data) => { const note = { ...data, id: operations.notes.length + 1, async save() {} }; operations.notes.push(note); return note; } },
        TransferReviewNoteDetail: { bulkCreate: async (data) => operations.noteDetails.push(...data) },
        History: { create: async () => {} },
    });
    t.after(restore);
    const { response, result } = responseRecorder();

    await receivedTransfer({
        userAuth: { id: 9, full_names: 'Validador' },
        body: {
            id_transfer: 44, id_storage_received: 4,
            date_received: '2026-08-14T09:00:00.000Z', observations_received: '',
            details: [{ id_detail: 1, quantity_received: 7 }, { id_detail: 2, quantity_received: 9.5 }],
        },
    }, response);

    assert.equal(result.status, 201);
    assert.deepEqual(operations.kardex.map(({ quantity, id_product }) => ({ quantity, id_product })), [
        { quantity: 2, id_product: 10 }, { quantity: 1.5, id_product: 11 },
    ]);
    assert.equal(operations.notes.length, 2);
    assert.ok(operations.notes.every(({ type }) => type === 'EXCEDENTE_PARA_REVISION'));
    assert.deepEqual(operations.noteDetails.map(({ id_product, quantity_difference }) => ({ id_product, quantity_difference })), [
        { id_product: 10, quantity_difference: 2 }, { id_product: 11, quantity_difference: 1.5 },
    ]);
});

test('faltante sin producto MERMAS válido revierte la recepción sin movimientos parciales', async (t) => {
    const transfer = pendingTransfer([pendingDetail(1, 10, 8)]);
    const operations = { stockCreates: 0, kardex: 0, commits: 0, rollbacks: 0 };
    let mermaLookup;
    const transaction = { commit: async () => { operations.commits += 1; }, rollback: async () => { operations.rollbacks += 1; } };
    const { receivedTransfer, restore } = loadReceivedTransfer({
        sequelize: { transaction: async () => transaction },
        Transfers: { findOne: async () => transfer },
        Product: { findOne: async (options) => { mermaLookup = options; return null; } },
        Stock: { findOne: async () => null, create: async () => { operations.stockCreates += 1; } },
        kardexMovements: { create: async () => { operations.kardex += 1; } },
        History: { create: async () => {} },
    });
    t.after(restore);
    const { response, result } = responseRecorder();

    await receivedTransfer({
        userAuth: { id: 9 },
        body: {
            id_transfer: 44,
            id_storage_received: 4,
            date_received: '2026-08-14T09:00:00.000Z',
            details: [{ id_detail: 1, quantity_received: 6.5 }],
        },
    }, response);

    assert.equal(result.status, 422);
    assert.equal(operations.rollbacks, 1);
    assert.equal(operations.commits, 0);
    assert.equal(operations.stockCreates, 0);
    assert.equal(operations.kardex, 0);
    assert.equal(transfer.saveCalls, 0);
    assert.deepEqual(mermaLookup.where, { id: undefined, status: true });
    assert.deepEqual(mermaLookup.include[0].where, { id: 22, status: true });
});
