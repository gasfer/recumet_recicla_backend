const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSheet, createRegistrationPdf } = require('../services/provider-registration-pdf');

const sheet = {
    name: 'Proveedor de prueba', reference: 'ID: 123', status: 'Activo',
    sections: [{ id: 1, title: 'Identificación Legal & Tipo de Proveedor', fields: [{ label: 'CI / NIT', value: '0012345' }], records: [] }],
};

test('la ficha valida contenido y rechaza estructuras o textos sin límite', () => {
    assert.equal(validateSheet(sheet), true);
    assert.equal(validateSheet({ ...sheet, sections: [{ ...sheet.sections[0], id: '<script>' }] }), false);
    assert.equal(validateSheet({ ...sheet, sections: [{ ...sheet.sections[0], fields: [{ label: 'Nombre', value: 'a'.repeat(6001) }] }] }), false);
    assert.equal(validateSheet({ ...sheet, sections: null }), false);
});

test('omite el enlace de Google Maps sin modificar los datos de origen', t => {
    const PDFDocument = require('pdfkit');
    const originalText = PDFDocument.prototype.text;
    const printed = [];
    t.mock.method(PDFDocument.prototype, 'text', function (text, ...args) {
        printed.push(String(text));
        return originalText.call(this, text, ...args);
    });
    const source = { ...sheet, sections: [...sheet.sections, { id: 2, title: 'Ubicación', fields: [{ label: 'Enlace de Google Maps', value: 'https://maps.google.com/private-link' }, { label: 'Dirección empresa', value: 'Dirección registrada' }], records: [] }] };
    const pdf = createRegistrationPdf(source);
    pdf.resume();
    pdf.end();
    assert.ok(printed.includes('Dirección registrada'));
    assert.ok(!printed.some(text => text.includes('private-link') || text.includes('ENLACE DE GOOGLE MAPS')));
    assert.equal(source.sections[1].fields.length, 2);
});

test('PDF paginado conserva textos largos, contactos y cuentas sin errores', async () => {
    const singlePage = createRegistrationPdf(sheet);
    assert.equal(singlePage.bufferedPageRange().count, 1, 'el pie de página no debe crear páginas vacías');
    singlePage.resume();
    singlePage.end();
    const records = Array.from({ length: 45 }, (_, i) => ({ title: `Cuenta ${i + 1}`, fields: [{ label: 'N.º de cuenta', value: `000000${i}` }, { label: 'Titular', value: 'Nombre largo '.repeat(20) }] }));
    const pdf = createRegistrationPdf({ ...sheet, sections: [...sheet.sections, { id: 7, title: 'Información bancaria de la sede', fields: [], records }, { id: 8, title: 'Observaciones', fields: [{ label: 'Observaciones generales', value: 'Observación '.repeat(450), full: true }], records: [] }] });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    const finished = new Promise((resolve, reject) => { pdf.on('end', resolve); pdf.on('error', reject); });
    assert.ok(pdf.bufferedPageRange().count > 1);
    pdf.end();
    await finished;
    assert.equal(Buffer.concat(chunks).subarray(0, 5).toString(), '%PDF-');
    assert.match(Buffer.concat(chunks).toString('latin1'), /\/Subtype \/Image/, 'incluye el logo real de los reportes del sistema');
});
