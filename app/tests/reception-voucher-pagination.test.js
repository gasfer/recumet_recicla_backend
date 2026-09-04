'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const PdfPrinter = require('pdfmake');

const controllerPath = path.resolve(__dirname, '../controllers/reports/transfers.controller.js');
const controllerRequire = createRequire(controllerPath);

async function renderVoucher(count, options = {}) {
    const details = Array.from({ length: count }, (_, index) => ({
        quantity: 10, quantity_received: 12, observation: 'Verificado',
        product: { cod: `ITEM-${String(index + 1).padStart(3, '0')}`, name: 'MATERIAL RECICLABLE', unit: { siglas: 'KGR' } },
    }));
    const transfer = {
        id: 1, cod: 'PRUEBA', status: 'RECEIVED', date_send: '2026-08-25T14:18:53', date_received: '2026-08-25T15:20:12',
        sucursal_send: { name: 'SUCURSAL ORIGEN' }, sucursal_received: { name: 'CASA MATRIZ' },
        observations_send: 'Envío verificado', observations_received: 'Recepción verificada',
        type_registry: 'BOLETA', registry_number: 'PRUEBA', scale: { name: 'BALANZA PRINCIPAL' }, detailsTransfers: details,
    };
    const defaultNotes = details.map((detail, index) => ({
        type: 'EXCEDENTE_PARA_REVISION', reconciliation_status: 'COMPLETADO',
        assignedUser: { full_names: 'RESPONSABLE DE ALMACÉN' }, registeredProduct: detail.product,
        details: [{ product: { ...detail.product, cod: `CONC-${String(index + 1).padStart(3, '0')}` },
            quantity_sent: 10, quantity_received: 12, quantity_difference: 2,
            quantity_resolved: 2, reconciliation_status: 'COMPLETADO', resolutionActions: [] }],
    }));
    const notes = options.notes === undefined ? defaultNotes : options.notes;
    let reviewQuery;
    let pages;
    class CapturingPrinter extends PdfPrinter {
        createPdfKitDocument(definition) {
            const doc = super.createPdfKitDocument(definition);
            pages = doc._pdfMakePages;
            return doc;
        }
    }
    const sandbox = {
        module: { exports: {} }, __dirname: path.dirname(controllerPath), Buffer, console,
        require(name) {
            if (name === '../../database/config') return {
                Transfers: { findByPk: async () => transfer },
                TransferReviewNote: { findAll: async (query) => { reviewQuery = query; return notes; } },
            };
            if (name === 'pdfmake') return CapturingPrinter;
            return controllerRequire(name);
        },
    };
    vm.runInNewContext(fs.readFileSync(controllerPath, 'utf8'), sandbox, { filename: controllerPath });
    const buffer = await new Promise((resolve, reject) => {
        sandbox.module.exports.printTransferReceptionVoucher({ params: { id_transfer: 1 } }, {
            setHeader() {}, send: resolve, status() { return this; }, json: reject,
        }).catch(reject);
    });
    if (process.env.RECEPTION_PDF_QA_DIR) {
        fs.mkdirSync(process.env.RECEPTION_PDF_QA_DIR, { recursive: true });
        fs.writeFileSync(path.join(process.env.RECEPTION_PDF_QA_DIR, `reception-${count}.pdf`), buffer);
    }
    return { reviewQuery, pages: pages.map(page => page.items.filter(item => item.type === 'line').map(({ item }) => ({
        text: item.inlines.map(inline => inline.text).join(''), y: item.y,
    }))) };
}

test('la guía corta continúa con conciliaciones en la primera hoja', async () => {
    const { pages, reviewQuery } = await renderVoucher(2);
    const first = pages[0].map(line => line.text).join('\n');
    assert.match(first, /ITEM-001/);
    assert.match(first, /CONCILIACIÓN DE DIFERENCIAS REGISTRADAS/);
    assert.match(first, /CONC-002/);
    assert.equal(pages.length, 1, 'Una guía corta debe usar una sola hoja');
    assert.match(first, /OBSERVACIONES RECEPCIÓN/);
    assert.match(first, /Recibí conforme/);
    const totals = pages[0].find(line => line.text === 'PESOS TOTALES');
    const reconciliation = pages[0].find(line => line.text === 'CONCILIACIÓN DE DIFERENCIAS REGISTRADAS');
    assert.ok(reconciliation.y - totals.y < 40, 'La conciliación debe seguir inmediatamente a los productos');
    assert.equal(reviewQuery.where.id_transfer, 1);
    assert.ok(reviewQuery.include.some((association) => association.association === 'details'));
});

test('guía extensa conserva todos los ítems y repite los encabezados en cada continuación', async () => {
    const count = 32;
    const { pages } = await renderVoucher(count);
    assert.ok(pages.length > 1);
    let productPages = 0;
    let reconciliationPages = 0;
    for (const lines of pages) {
        const text = lines.map(line => line.text).join('\n');
        if (/ITEM-\d/.test(text)) {
            productPages++;
            assert.match(text, /DETALLE/);
            assert.match(text, /ENVIADO/);
            assert.match(text, /RECIBIDO/);
        }
        if (/CONC-\d/.test(text)) {
            reconciliationPages++;
            assert.match(text, /CONCILIACIÓN DE DIFERENCIAS REGISTRADAS/);
            assert.match(text, /PRODUCTO ORIGEN/);
            assert.match(text, /CONC\./);
        }
        for (const line of lines) assert.ok(line.y >= 0 && line.y < 378, 'Contenido dentro de la hoja');
    }
    assert.ok(productPages >= 2, 'Se ejercita la continuación de productos');
    assert.ok(reconciliationPages >= 2, 'Se ejercita la continuación de conciliaciones');
    for (let index = 1; index <= count; index++) {
        for (const prefix of ['ITEM', 'CONC']) {
            const code = `${prefix}-${String(index).padStart(3, '0')}`;
            assert.ok(pages.flat().some(line => line.text.includes(code)), `${code} debe estar impreso`);
        }
    }
});

test('recepción sin diferencias mantiene la guía sin tabla de conciliación', async () => {
    const { pages } = await renderVoucher(1, { notes: [] });
    const text = pages.flat().map((line) => line.text).join('\n');
    assert.doesNotMatch(text, /CONCILIACIÓN DE DIFERENCIAS REGISTRADAS/);
    assert.match(text, /OBSERVACIONES RECEPCIÓN/);
    assert.match(text, /Recibí conforme/);
});
