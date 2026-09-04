const test = require('node:test');
const assert = require('node:assert');
const {
    buildHeader,
    buildHr,
    buildSectionTitle,
    buildInfoRow,
    buildInfoRowDouble,
    buildInfoPanel,
    buildDetailTable,
    buildClosingSection,
    VOUCHER_THEME
} = require('../helpers/generator-pdf/voucher-template.helper');

test('voucher-template.helper construye encabezado válido para pdfmake', () => {
    const header = buildHeader({
        title: 'COMPROBANTE DE PRUEBA',
        codePrefix: 'DOC',
        codeValue: '001',
        dateValue: '02/09/2026',
        company: { branchName: 'Sucursal Central', nit: '123456' },
        statusBadge: { text: 'PENDIENTE' }
    });

    assert.strictEqual(header.layout, 'noBorders');
    assert.ok(header.table && header.table.body.length === 1);
    assert.strictEqual(header.table.body[0][1].text, 'COMPROBANTE DE PRUEBA');
});

test('buildInfoPanel genera layout con 1 o 2 grupos', () => {
    const single = buildInfoPanel([
        { title: 'DATOS', rows: [{ label: 'Cliente:', value: 'Juan' }] }
    ]);
    assert.ok(single.table);

    const double = buildInfoPanel([
        { title: 'ORIGEN', rows: [{ label: 'Sucursal:', value: 'A' }] },
        { title: 'DESTINO', rows: [{ label: 'Sucursal:', value: 'B' }] }
    ]);
    assert.ok(double.columns && double.columns.length === 3);
});

test('buildDetailTable incluye encabezados estilizados con tokens corporativos', () => {
    const table = buildDetailTable({
        widths: [50, '*'],
        headers: [{ text: 'COD' }, { text: 'DESC' }],
        rows: [[{ text: '01' }, { text: 'Item' }]]
    });

    assert.strictEqual(table.table.body.length, 2);
    assert.strictEqual(table.table.body[0][0].fillColor, VOUCHER_THEME.colors.headerFill);
});

test('buildClosingSection genera bloques de firmas y metadatos sin fallar con campos vacíos', () => {
    const closing = buildClosingSection({
        observations: [{ title: 'OBS', text: 'Nota' }],
        meta: [{ label: 'BALANZA:', value: 'Pesa 1' }],
        signatures: [
            { role: 'Entrega', name: 'Almacén' },
            { role: 'Recibe', name: 'Chofer' }
        ]
    });

    assert.strictEqual(closing.unbreakable, true);
    assert.ok(closing.stack.length >= 3);
});
