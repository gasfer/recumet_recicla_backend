const test = require('node:test');
const assert = require('node:assert');
const PdfPrinter = require('pdfmake');
const fonts = require('../helpers/generator-pdf/fonts');
const styles = require('../helpers/generator-pdf/styles');
const { dataPdfReturnOutputVoucher } = require('../controllers/reports/output.controller');
const { dataPdfReturnCajaVoucher } = require('../controllers/reports/caja.controller');

test('dataPdfReturnOutputVoucher renderiza PDF de venta válido sin errores', () => {
    const mockOutput = {
        cod: 'VEN-010',
        date_output: new Date(),
        voucher: 'MENOR',
        type_output: 'CONTADO',
        type_payment: 'EFECTIVO',
        number_registry: 'REG-88',
        type_registry: 'VENTA',
        scale: { name: 'Pesa Central' },
        client: {
            full_names: 'Cliente Mayorista',
            number_document: '11223344',
            cellphone: '60012345',
            direction: 'Calle Comercio 100'
        },
        comments: 'Venta contado menor'
    };
    const mockSucursal = {
        name: 'Sucursal Central',
        cellphone: '77788899',
        email: 'central@recumet.com',
        company: { nit: '10203040' }
    };

    const content = dataPdfReturnOutputVoucher(mockOutput, mockSucursal, 2);
    assert.ok(Array.isArray(content));

    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument({ content, styles });
    const chunks = [];
    pdfDoc.on('data', c => chunks.push(c));
    pdfDoc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        assert.ok(buffer.length > 500, 'PDF buffer de salida no debe estar vacío');
    });
    pdfDoc.end();
});

test('dataPdfReturnCajaVoucher renderiza PDF de arqueo de caja sin errores', () => {
    const mockCaja = {
        id: 12,
        date_apertura: new Date(),
        date_cierre: null,
        monto_apertura: 500,
        monto_cierre: null,
        user: { full_names: 'Cajero Principal' },
        sucursal: {
            name: 'Sucursal El Alto',
            cellphone: '70011223',
            email: 'elalto@recumet.com',
            company: { nit: '10203040' }
        }
    };
    const mockTotals = {
        ingresos: [{ description: 'Venta', monto: 200 }],
        total_ingresos: 200,
        gastos: [{ description: 'Almuerzo', monto: 50 }],
        total_gastos: 50,
        saldo: 150,
        monto_apertura_mas_saldo: 650
    };

    const content = dataPdfReturnCajaVoucher(mockCaja, mockTotals, 2);
    assert.ok(Array.isArray(content));

    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument({ content, styles });
    const chunks = [];
    pdfDoc.on('data', c => chunks.push(c));
    pdfDoc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        assert.ok(buffer.length > 500, 'PDF buffer de caja no debe estar vacío');
    });
    pdfDoc.end();
});
