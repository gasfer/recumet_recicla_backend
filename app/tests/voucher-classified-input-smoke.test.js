const test = require('node:test');
const assert = require('node:assert');
const PdfPrinter = require('pdfmake');
const fonts = require('../helpers/generator-pdf/fonts');
const styles = require('../helpers/generator-pdf/styles');
const { dataPdfReturnClassifiedVoucher } = require('../controllers/reports/classified.controller');
const { dataPdfReturnInputVoucher } = require('../controllers/reports/input.controller');

test('dataPdfReturnClassifiedVoucher renderiza PDF válido sin errores de layout', () => {
    const mockClassified = {
        cod: 'CLA-001',
        date_classified: new Date(),
        product: { name: 'Cobre Limpio' },
        quantity_product: 150,
        number_registry: 'REG-123',
        type_registry: 'INGRESO',
        scale: { name: 'Balanza 1' },
        storage: { name: 'Almacén Principal' },
        comments: 'Nota de prueba'
    };
    const mockSucursal = {
        name: 'Sucursal Central',
        cellphone: '77788899',
        email: 'central@recumet.com',
        company: { nit: '10203040' }
    };

    const content = dataPdfReturnClassifiedVoucher(mockClassified, mockSucursal, 2);
    assert.ok(Array.isArray(content));

    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument({ content, styles });
    const chunks = [];
    pdfDoc.on('data', c => chunks.push(c));
    pdfDoc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        assert.ok(buffer.length > 500, 'PDF buffer no debe estar vacío');
    });
    pdfDoc.end();
});

test('dataPdfReturnInputVoucher renderiza PDF de compra válido sin errores', () => {
    const mockInput = {
        cod: 'COM-005',
        date_voucher: new Date(),
        type: 'CONTADO',
        registry_number: 'R-999',
        type_registry: 'COMPRA',
        scale: { name: 'Pesa 2' },
        provider: {
            full_names: 'Proveedor SRL',
            number_document: '987654321',
            cellphone: '71234567',
            direction: 'Av. Industrial 45'
        },
        comments: 'Pago en efectivo'
    };
    const mockSucursal = {
        name: 'Sucursal El Alto',
        cellphone: '70011223',
        email: 'elalto@recumet.com',
        company: { nit: '10203040' }
    };

    const content = dataPdfReturnInputVoucher(mockInput, mockSucursal, 2);
    assert.ok(Array.isArray(content));

    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument({ content, styles });
    const chunks = [];
    pdfDoc.on('data', c => chunks.push(c));
    pdfDoc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        assert.ok(buffer.length > 500, 'PDF buffer de compra no debe estar vacío');
    });
    pdfDoc.end();
});
