const test = require('node:test');
const assert = require('node:assert');
const PdfPrinter = require('pdfmake');
const fonts = require('../helpers/generator-pdf/fonts');
const styles = require('../helpers/generator-pdf/styles');

const {
    dataPdfReturnAbonoAccountPayableVoucher,
    dataPdfReturnAccountPayableVoucher
} = require('../controllers/reports/accounts_payables.controller');

const {
    dataPdfReturnAbonoAccountReceivableVoucher,
    dataPdfReturnAccountPayableVoucher: dataPdfReturnAccountReceivableVoucher
} = require('../controllers/reports/accounts_receivable.controller');

const {
    dataPdfReturnAbonoAccountReceivableMultipleVoucher
} = require('../controllers/reports/account_receivable/printBoletaAbonoMultiple');

const {
    dataPdfReturnAbonoAccountPayableMultipleVoucher
} = require('../controllers/reports/accounts_payable/printBoletaAbonoMultiple');

test('Cuentas por Pagar: dataPdfReturnAbonoAccountPayableVoucher renderiza correctamente', () => {
    const mockAbono = {
        date_abono: new Date(),
        monto_abono: 1500.50,
        type_payment: 'EFECTIVO'
    };
    const mockAccount = {
        cod: 'CXP-001',
        sucursal: {
            name: 'Central El Alto',
            cellphone: '77712345',
            email: 'alto@recumet.com',
            company: { nit: '99887766' }
        },
        input: {
            cod: 'ING-101',
            provider: { full_names: 'Proveedor Metal', number_document: '1234567' }
        }
    };
    const content = dataPdfReturnAbonoAccountPayableVoucher(mockAbono, mockAccount, 2);
    assert.ok(Array.isArray(content));

    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument({ content, styles });
    const chunks = [];
    pdfDoc.on('data', c => chunks.push(c));
    pdfDoc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        assert.ok(buffer.length > 500);
    });
    pdfDoc.end();
});

test('Cuentas por Pagar: dataPdfReturnAccountPayableVoucher renderiza correctamente', () => {
    const mockAccount = {
        cod: 'CXP-002',
        date_credit: new Date(),
        total: 5000,
        status_account: 'PENDIENTE',
        description: 'Compra a crédito de chatarra',
        monto_abonado: 2000,
        monto_restante: 3000,
        provider: { full_names: 'Proveedor Chatarra', number_document: '9876543' },
        sucursal: {
            name: 'Central Oruro',
            cellphone: '77754321',
            email: 'oruro@recumet.com',
            company: { nit: '99887766' }
        }
    };
    const content = dataPdfReturnAccountPayableVoucher(mockAccount, 2);
    assert.ok(Array.isArray(content));

    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument({ content, styles });
    const chunks = [];
    pdfDoc.on('data', c => chunks.push(c));
    pdfDoc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        assert.ok(buffer.length > 500);
    });
    pdfDoc.end();
});

test('Cuentas por Cobrar: dataPdfReturnAbonoAccountReceivableVoucher renderiza correctamente', () => {
    const mockAbono = {
        date_abono: new Date(),
        monto_abono: 850.00,
        type_payment: 'EFECTIVO'
    };
    const mockAccount = {
        cod: 'CXC-001',
        monto_abonado: 850.00,
        monto_restante: 150.00,
        sucursal: {
            name: 'Planta Achachicala',
            cellphone: '77700011',
            email: 'achachicala@recumet.com',
            company: { nit: '99887766' }
        },
        output: {
            cod: 'OUT-202',
            type_registry: 'VENTA',
            number_registry: 'REG-100',
            client: { full_names: 'Fundición del Sur', number_document: '44556677' }
        }
    };
    const content = dataPdfReturnAbonoAccountReceivableVoucher(mockAbono, mockAccount, 2);
    assert.ok(Array.isArray(content));

    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument({ content, styles });
    const chunks = [];
    pdfDoc.on('data', c => chunks.push(c));
    pdfDoc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        assert.ok(buffer.length > 500);
    });
    pdfDoc.end();
});

test('Abonos Múltiples (CxC y CxP): Generan vouchers válidos', () => {
    const mockAbonoReceivable = {
        date_abono: new Date(),
        monto_abono: 3000,
        comments: 'Abono múltiple recibido',
        client: { full_names: 'Cliente Varios', number_document: '332211' },
        sucursal: { name: 'Sucursal Central' }
    };
    const mockReceivable = {
        cod: 'CXC-MULT',
        sucursal: { name: 'Sucursal Central', company: { nit: '112233' }, cellphone: '123', email: 'a@b.com' }
    };
    const contentReceivable = dataPdfReturnAbonoAccountReceivableMultipleVoucher(mockAbonoReceivable, mockReceivable, 2);
    assert.ok(Array.isArray(contentReceivable));

    const mockAbonoPayable = {
        date_abono: new Date(),
        monto_abono: 4500,
        comments: 'Abono múltiple a proveedor',
        provider: { full_names: 'Proveedor Varios', number_document: '556677' },
        sucursal: { name: 'Sucursal Central' }
    };
    const mockPayable = {
        cod: 'CXP-MULT',
        sucursal: { name: 'Sucursal Central', company: { nit: '112233' }, cellphone: '123', email: 'a@b.com' }
    };
    const contentPayable = dataPdfReturnAbonoAccountPayableMultipleVoucher(mockAbonoPayable, mockPayable, 2);
    assert.ok(Array.isArray(contentPayable));
});
