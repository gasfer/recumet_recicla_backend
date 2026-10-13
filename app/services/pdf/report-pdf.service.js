const fs = require('fs');
const puppeteer = require('puppeteer');
const { paperDimensions, renderReportHtml } = require('../../helpers/generator-pdf/report-html.template');

const positiveInteger = (value, fallback) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
function createPdfRenderer({ launch = options => puppeteer.launch(options), concurrency = 3, queueLimit = 20, timeout = 30000 } = {}) {
    let browserPromise;
    let active = 0;
    let stopped = false;
    const waiting = [];
    const acquire = () => {
        if (stopped) return Promise.reject(new Error('Servicio PDF cerrado'));
        if (active < concurrency) { active++; return Promise.resolve(); }
        if (waiting.length >= queueLimit) return Promise.reject(new Error('Servicio PDF ocupado; intente nuevamente'));
        return new Promise((resolve, reject) => {
            const entry = { resolve, reject };
            entry.timer = setTimeout(() => { const index = waiting.indexOf(entry); if (index >= 0) waiting.splice(index, 1); reject(new Error('Tiempo de espera PDF agotado')); }, timeout);
            waiting.push(entry);
        });
    };
    const release = () => {
        const entry = waiting.shift();
        if (entry) { clearTimeout(entry.timer); entry.resolve(); }
        else active--;
    };
    const browser = () => {
        if (!browserPromise) {
            const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
            if (executablePath && !fs.existsSync(executablePath)) throw new Error('Ejecutable Chromium no encontrado');
            browserPromise = launch({ headless: true, timeout, ...(executablePath ? { executablePath } : {}), args: process.env.PDF_DISABLE_SANDBOX === 'true' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [] }).then(instance => {
                instance.once('disconnected', () => { browserPromise = undefined; });
                return instance;
            }).catch(error => { browserPromise = undefined; throw error; });
        }
        return browserPromise;
    };
    const render = async document => {
        const html = renderReportHtml(document);
        const [width, height] = paperDimensions(document);
        const started = Date.now();
        await acquire();
        let page;
        let timer;
        let expired = false;
        const remaining = Math.max(1, timeout - (Date.now() - started));
        const work = async () => {
            const instance = await browser();
            if (expired) throw new Error('Tiempo de generación PDF agotado');
            page = await instance.newPage();
            if (expired) { await page.close(); throw new Error('Tiempo de generación PDF agotado'); }
            await page.setJavaScriptEnabled(false);
            await page.setRequestInterception(true);
            page.on('request', request => /^(data:|about:)/.test(request.url()) ? request.continue() : request.abort());
            await page.setContent(html, { waitUntil: 'load', timeout: remaining });
            await page.evaluate(async () => {
                await document.fonts.ready;
                await Promise.all(Array.from(document.images).map(image => image.decode()));
            });
            const options = { printBackground: true, preferCSSPageSize: true, timeout: remaining, displayHeaderFooter: height !== 'auto', headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:7px;width:100%;text-align:center;color:#64748b">RECUMET · <span class="pageNumber"></span> / <span class="totalPages"></span></div>' };
            if (height === 'auto') {
                await page.emulateMediaType('print');
                await page.setViewport({ width: Math.floor((width - 12) * 96 / 72), height: 100 });
                const pixels = await page.evaluate(() => document.documentElement.scrollHeight);
                Object.assign(options, { preferCSSPageSize: false, width: `${width / 72}in`, height: `${Math.max(128, pixels * 72 / 96 + 23) / 72}in`, margin: { top: `${10 / 72}in`, bottom: `${10 / 72}in`, left: `${6 / 72}in`, right: `${6 / 72}in` } });
            } else {
                await page.evaluate(maxHeight => {
                    document.querySelectorAll('tbody tr,.panel,.closing').forEach(element => {
                        if (element.getBoundingClientRect().height > maxHeight) { element.classList.add('oversized'); element.style.breakInside = 'auto'; }
                    });
                }, (height - 54) * 96 / 72);
            }
            const result = Buffer.from(await page.pdf(options));
            if (result.subarray(0, 5).toString() !== '%PDF-') throw new Error('Respuesta PDF inválida');
            return result;
        };
        try {
            return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('Tiempo de generación PDF agotado')); }, remaining); })]);
        } finally {
            clearTimeout(timer);
            if (page) await page.close().catch(() => {});
            release();
        }
    };
    const close = async () => {
        stopped = true;
        waiting.splice(0).forEach(entry => { clearTimeout(entry.timer); entry.reject(new Error('Servicio PDF cerrado')); });
        if (browserPromise) await (await browserPromise).close();
        browserPromise = undefined;
    };
    return { render, close };
}
const renderer = createPdfRenderer({ concurrency: positiveInteger(process.env.PDF_CONCURRENCY, 3), queueLimit: positiveInteger(process.env.PDF_QUEUE_LIMIT, 20), timeout: positiveInteger(process.env.PDF_TIMEOUT_MS, 30000) });
const generateReportPdf = document => renderer.render(document);
const sendReportPdf = async (response, document, filename) => {
    const buffer = await generateReportPdf(document);
    const safeName = String(filename || 'reporte.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    response.setHeader('Cache-Control', 'no-store, private');
    return response.send(buffer);
};
module.exports = { createPdfRenderer, generateReportPdf, sendReportPdf, closePdfRenderer: () => renderer.close() };
