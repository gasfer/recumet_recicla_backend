const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPdfRenderer } = require('../services/pdf/report-pdf.service');
const { sendReportPdf } = require('../services/pdf/report-pdf.service');
const { renderReportHtml, paperDimensions } = require('../helpers/generator-pdf/report-html.template');
const sample = { title: 'Compras <script>', paper: 'LETTER', columns: [{ label: 'Producto' }, { label: 'Total', align: 'right' }], rows: [{ kind: 'total', cells: [{ text: 'TOTAL', span: 1 }, { text: '10.00' }] }] };
const { buildOperationVoucher } = require('../helpers/generator-pdf/operation-voucher.document');

test('comprobante de compra conserva datos completos, detalle y totales sin truncar nombres', () => {
    const document = buildOperationVoucher({ cod: 'COMP-1', date_voucher: '2026-10-12', provider: { full_names: 'Proveedor con un nombre muy largo que debe mantenerse completo' }, sumas: 20, discount: 2, total: 18, detailsInput: [{ quantity: 2, cost: 10, total: 20, product: { cod: 'P1', name: 'Metal', unit: { siglas: 'KG' } } }] }, { kind: 'purchase', decimal: 2 });
    const html = renderReportHtml(document);
    assert.ok(html.includes('Proveedor con un nombre muy largo que debe mantenerse completo'));
    assert.ok(html.includes('18,00'));
    assert.ok(html.includes('SUBTOTAL'));
    assert.equal(document.paper, 'HALF_LETTER');
    assert.equal(buildOperationVoucher({ detailsInput: [] }, { kind: 'purchase', format: 'rollo' }).paper.height, 'auto');
});

test('tabla de compra aplica resumen compacto, paleta sutil y una sola familia tipográfica', () => {
    const document = buildOperationVoucher({
        cod: 'COMP-10967', date_voucher: '2026-10-05', sumas: 0, discount: 0, total: 0,
        provider: { full_names: 'GASTON PRUEBA' },
        detailsInput: [{ quantity: 2, cost: 0, total: 0, product: { cod: 'PT-RAE-ITC-022', name: 'AC ADAPTER CON CABLE', unit: { siglas: 'KGR' } } }],
    }, { kind: 'purchase', decimal: 2 });
    const html = renderReportHtml(document);
    assert.match(html, /table-summary/);
    assert.match(html, /Resumen de pesaje verificado en recepción/);
    assert.match(html, /amount-summary/);
    assert.match(html, /IMPORTE EN LETRAS/);
    assert.match(html, /SON: CERO CON 00\/100/);
    assert.match(html, /TOTAL NETO/);
    assert.match(html, /#f1f5f9/);
    assert.match(html, /#ecfdf5/);
    assert.match(html, /font-family:Report/);
    assert.match(html, /class="brand-block"/);
    assert.match(html, /class="document-number"/);
    assert.match(html, /TOTAL IMPORTE/);
    assert.match(html, /row-purchase-summary/);
    assert.match(html, /grid-template-columns:1fr 1\.15fr \.8fr/);
    assert.doesNotMatch(html, /fonts\.googleapis|cdn\.tailwindcss|font-family:\s*Inter/);
});

test('crédito de compra muestra solo A CUENTA y SALDO en el resumen inferior', () => {
    const document = buildOperationVoucher({
        cod: 'COMP-CREDITO', date_voucher: '2026-10-05', type: 'CREDITO', total: 100,
        accounts_payable: { monto_abonado: 1234.5, monto_restante: 9876.25 }, detailsInput: [],
    }, { kind: 'purchase', format: 'media', decimal: 2 });
    const credit = document.sections.find(section => section.title === 'RESUMEN DE CRÉDITO');
    assert.deepEqual(credit.rows.map(row => row[0]), ['A CUENTA', 'SALDO']);
    assert.match(credit.amountInWords, /BOLIVIANOS CIEN CON 00\/100/);
    assert.equal(document.sections.some(section => section.title === 'TOTALES'), false);
    assert.equal(document.sections.some(section => section.title === 'CRÉDITO'), false);
    const html = renderReportHtml(document);
    assert.match(html, /A CUENTA/);
    assert.match(html, /SALDO/);
    assert.match(html, /1\.234,50/);
    assert.match(html, /9\.876,25/);
    assert.match(html, /BOLIVIANOS CIEN CON 00\/100/);
});

test('importe en letras interpreta separador de miles y coma decimal con precisión configurada', () => {
    const document = buildOperationVoucher({
        cod: 'COMP-LOCALIZADO', date_voucher: '2026-10-12', type: 'CREDITO',
        total: '1.382,5000', sumas: '1.382,5000', discount: 0, detailsInput: [],
    }, { kind: 'purchase', decimal: 4 });
    const summary = document.sections.find(section => section.title === 'RESUMEN DE CRÉDITO');
    assert.equal(summary.amountInWords, 'SON: BOLIVIANOS MIL TRESCIENTOS OCHENTA Y DOS CON 50/100');
    assert.match(renderReportHtml(document), /1\.382,5000/);
});

test('comprobante aplica separadores españoles y cantidad de decimales configurada', () => {
    const document = buildOperationVoucher({
        cod: 'COMP-FORMATO', date_voucher: '2026-10-12', type: 'CONTADO',
        total: 1234567.8, sumas: 1234567.8, discount: 0,
        detailsInput: [{ quantity: 1234.5, cost: 1000, total: 1234567.8, product: { cod: 'P1', name: 'Metal', unit: { siglas: 'KGR' } } }],
    }, { kind: 'purchase', decimal: 3 });
    const html = renderReportHtml(document);
    assert.match(html, /1\.234,500/);
    assert.match(html, /1\.000,000/);
    assert.match(html, /1\.234\.567,800/);
    assert.equal(buildOperationVoucher({ total: 1234, sumas: 1234, detailsInput: [] }, { kind: 'purchase', decimal: 0 }).sections[1].rows[0][1], '1.234');
});

test('encabezado compartido muestra la sucursal debajo del título y NIT/correo junto al logo', () => {
    const html = renderReportHtml({
        title: 'REPORTE DE PRUEBA', reference: 'R-01', date: '12/10/2026',
        company: { branchName: 'CASA MATRIZ', city: 'LA PAZ', nit: '1009851024', phone: '69422892', email: 'contacto@recumet.com' },
        columns: [{ label: 'Dato' }], rows: [['Prueba']],
    });
    assert.match(html, /class="brand-block"/);
    assert.match(html, /<div class="company-details"><span>LA PAZ<\/span><span>NIT: 1009851024<\/span><span>contacto@recumet\.com<\/span><\/div>/);
    assert.match(html, /<h1>REPORTE DE PRUEBA<\/h1><div class="branch-name">CASA MATRIZ<\/div>/);
    assert.doesNotMatch(html, /Teléfono \/ Celular|Contacto:/);
    assert.match(html, /\.document-header \.company-details\{display:flex;flex-direction:column/);
    assert.match(html, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.15fr\) minmax\(0,\.8fr\)/);
    assert.match(html, /\.document-header \.brand-block\{display:flex;align-items:center;gap:0/);
    assert.match(html, /\.document-header \.heading\{text-align:center;justify-self:center\}/);
    assert.match(html, /alt="RECUMET"/);
});

test('encabezado de comprobante usa CASA MATRIZ si no hay sucursal asociada', () => {
    const document = buildOperationVoucher({ cod: 'COMP-MATRIZ', date_voucher: '2026-10-12', total: 0, detailsInput: [] }, { kind: 'purchase', decimal: 2 });
    const html = renderReportHtml(document);
    assert.match(html, /<h1>NOTA DE COMPRA<\/h1><div class="branch-name">CASA MATRIZ<\/div>/);
});

test('plantilla preserva texto, totales y columnas y escapa datos', () => {
    const html = renderReportHtml(sample);
    assert.ok(html.includes('Compras &lt;script&gt;'));
    assert.ok(html.includes('10.00'));
    assert.ok(html.includes('class="row-total"'));
    assert.ok(html.includes('<thead>'));
    assert.deepEqual(paperDimensions({ paper: 'LETTER', orientation: 'landscape' }), [792, 612]);
    assert.deepEqual(paperDimensions({ paper: 'A4' }), [595.28, 841.89]);
});

function fakeBrowser(pdf) {
    const instance = new EventEmitter();
    let closed = 0;
    instance.newPage = async () => Object.assign(new EventEmitter(), {
        setJavaScriptEnabled: async () => {}, setRequestInterception: async () => {}, setContent: async () => {},
        evaluate: async () => {}, pdf, close: async () => { closed++; },
    });
    instance.close = async () => instance.emit('disconnected');
    instance.closedPages = () => closed;
    return instance;
}

test('cola acotada rechaza saturación y libera páginas después de fallo', async () => {
    let resolve;
    const instance = fakeBrowser(() => new Promise(done => { resolve = done; }));
    const renderer = createPdfRenderer({ launch: async () => instance, concurrency: 1, queueLimit: 1, timeout: 1000 });
    const first = renderer.render(sample);
    await new Promise(done => setImmediate(done));
    const second = renderer.render(sample);
    await assert.rejects(renderer.render(sample), /ocupado/);
    resolve(Buffer.from('%PDF- first'));
    await first;
    await new Promise(done => setImmediate(done));
    resolve(Buffer.from('invalid'));
    await assert.rejects(second, /inválida/);
    assert.equal(instance.closedPages(), 2);
    const third = renderer.render(sample);
    await new Promise(done => setImmediate(done));
    resolve(Buffer.from('%PDF- third'));
    assert.ok((await third).toString().startsWith('%PDF-'));
    await renderer.close();
});

test('timeout cierra página y permite una generación posterior', async () => {
    let stalled = true;
    const instance = fakeBrowser(async () => stalled ? new Promise(() => {}) : Buffer.from('%PDF- recovered'));
    const renderer = createPdfRenderer({ launch: async () => instance, timeout: 50 });
    await assert.rejects(renderer.render(sample), /agotado/);
    stalled = false;
    assert.equal((await renderer.render(sample)).toString(), '%PDF- recovered');
    assert.equal(instance.closedPages(), 2);
    await renderer.close();
});

test('fallo de Chromium no envía encabezados ni un PDF parcial', async () => {
    const previous = process.env.PUPPETEER_EXECUTABLE_PATH;
    process.env.PUPPETEER_EXECUTABLE_PATH = 'Z:/missing-pdf-chromium.exe';
    let sent = false;
    try {
        await assert.rejects(sendReportPdf({ setHeader: () => { sent = true; }, send: () => { sent = true; } }, sample, 'prueba.pdf'), /Chromium no encontrado/);
        assert.equal(sent, false);
    } finally {
        if (previous === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
        else process.env.PUPPETEER_EXECUTABLE_PATH = previous;
    }
});

test('generación bloquea solicitudes externas y desactiva JavaScript', async () => {
    let javascript;
    let aborted = false;
    let continued = false;
    const instance = fakeBrowser(async () => Buffer.from('%PDF- safe'));
    const base = instance.newPage;
    instance.newPage = async () => {
        const page = await base();
        page.setJavaScriptEnabled = async value => { javascript = value; };
        const on = page.on.bind(page);
        page.on = (event, listener) => {
            if (event === 'request') {
                listener({ url: () => 'https://external.invalid/logo.png', abort: () => { aborted = true; }, continue: () => {} });
                listener({ url: () => 'data:image/png;base64,local', abort: () => {}, continue: () => { continued = true; } });
            }
            return on(event, listener);
        };
        return page;
    };
    const renderer = createPdfRenderer({ launch: async () => instance });
    await renderer.render(sample);
    assert.equal(javascript, false);
    assert.equal(aborted, true);
    assert.equal(continued, true);
    await renderer.close();
});
