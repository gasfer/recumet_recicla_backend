const { buildCashVoucher } = require('../../helpers/generator-pdf/cash-voucher.document');
const { sendReportPdf } = require('../../services/pdf/report-pdf.service');
const { companyData, money, field } = require('../../helpers/generator-pdf/operation-voucher.document');
const { CajaSmall, CjSessionBalance, CjLedger, CjDailyClose, CjExpense } = require('../../database/config');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const { getReportLogoPath } = require('../../helpers/report-logo');
const imagePath = getReportLogoPath();
const { response } = require("express");
const { getNumberDecimal } = require("../../helpers/company");
const { getTotalesAndMovements } = require('../caja_small.controller');
const ExcelJS = require('exceljs');
const { mergeCloseAccountSummary } = require('../../services/caja-account-balances.service');
const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',hour: "numeric",
minute: "numeric",
second: "numeric", };

moment.locale('es'); 

const canAccessBranch = (user, branchId) => ['ADMINISTRADOR', 'DESARROLLADOR'].includes(user?.role)
    || (user?.assign_sucursales || []).some(assignment => assignment.status !== false && Number(assignment.id_sucursal) === Number(branchId));
const canAccessCashbox = (user, cashboxType) => {
    if (user?.role === 'ADMINISTRADOR') return true;
    if (cashboxType === 'MAYOR') return false;
    if (user?.role === 'LIQUIDACION_CAJA') return true;
    return (user?.assign_permission || []).some(permission => {
        const module = String(permission?.module || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
        return ['CAJA', 'CAJACHICA'].includes(module) && permission.status !== false && Boolean(permission.view || permission.create || permission.reports);
    });
};


const printCaja = async (req = request, res = response) =>{
    try {
        const { id_caja_small } = req.params;
        const caja_small = await CajaSmall.findByPk(id_caja_small,{include: [ 
            { association: 'sucursal', include:[{association:'company'}] },
            { association: 'user', attributes: ['full_names','number_document']},
        ]});
        if (!caja_small) return res.status(404).json({ ok: false, errors: [{ msg: 'No se encontró la sesión de Caja.' }] });
        if (!canAccessBranch(req.userAuth, caja_small.id_sucursal)) return res.status(403).json({ ok: false, errors: [{ msg: 'No tienes permiso para exportar la Caja de esta sucursal.' }] });
        if (!canAccessCashbox(req.userAuth, caja_small.cashbox_type || 'CHICA')) return res.status(403).json({ ok: false, errors: [{ msg: 'No tienes permiso para exportar esta caja.' }] });
        if (caja_small.cashbox_type === 'MAYOR' && req.userAuth?.role !== 'ADMINISTRADOR') return res.status(403).json({ ok: false, errors: [{ msg: 'Solo un administrador puede exportar una Caja Mayor.' }] });
        const total_movements = await getTotalesAndMovements(caja_small.id,caja_small.monto_apertura);
        total_movements.accountSummary = await getAccountSummary(caja_small.id);
        const close = await CjDailyClose.findOne({ where: { id_caja_small: caja_small.id }, include: [{ association: 'details', include: [{ association: 'account' }] }] });
        total_movements.closeDetails = close?.details || [];
        total_movements.accountSummary = mergeCloseAccountSummary(total_movements.accountSummary, total_movements.closeDetails);
        total_movements.closeObservations = close?.observations || '';
        total_movements.expenseDocuments = await getExpenseDocuments(caja_small.id);
        const decimal = await getNumberDecimal();
        const document = buildCashVoucher(caja_small, total_movements, decimal);
        await sendReportPdf(res, document, 'arqueo-caja-' + caja_small.id + '.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el arqueo de caja' });
    }
}

const exportCajaExcel = async (req = request, res = response) => {
    try {
        const { id_caja_small } = req.params;
        const caja = await CajaSmall.findByPk(id_caja_small, { include: [
            { association: 'sucursal', include: [{ association: 'company' }] },
            { association: 'user', attributes: ['full_names', 'number_document'] },
        ] });
        if (!caja) return res.status(404).json({ ok: false, errors: [{ msg: 'No se encontró la sesión de Caja.' }] });

        if (!canAccessBranch(req.userAuth, caja.id_sucursal)) return res.status(403).json({ ok: false, errors: [{ msg: 'No tienes permiso para exportar la Caja de esta sucursal.' }] });
        if (!canAccessCashbox(req.userAuth, caja.cashbox_type || 'CHICA')) return res.status(403).json({ ok: false, errors: [{ msg: 'No tienes permiso para exportar esta caja.' }] });
        if (caja.cashbox_type === 'MAYOR' && req.userAuth?.role !== 'ADMINISTRADOR') return res.status(403).json({ ok: false, errors: [{ msg: 'Solo un administrador puede exportar una Caja Mayor.' }] });
        const totals = await getTotalesAndMovements(caja.id, caja.monto_apertura);
        totals.accountSummary = await getAccountSummary(caja.id);
        const close = await CjDailyClose.findOne({ where: { id_caja_small: caja.id }, include: [{ association: 'details', include: [{ association: 'account' }] }] });
        totals.closeDetails = close?.details || [];
        totals.accountSummary = mergeCloseAccountSummary(totals.accountSummary, totals.closeDetails);
        totals.closeObservations = close?.observations || '';
        totals.expenseDocuments = await getExpenseDocuments(caja.id);
        const decimal = await getNumberDecimal();
        const company = companyData(caja.sucursal);
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'RECUMET S.R.L.';
        const sheet = workbook.addWorksheet('Arqueo de Caja', { views: [{ state: 'frozen', ySplit: 7 }], pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
        sheet.columns = [{ width: 18 }, { width: 26 }, { width: 22 }, { width: 16 }, { width: 20 }, { width: 20 }, { width: 24 }, { width: 12 }, { width: 18 }];
        // Mantener la franja corporativa del Excel de compras: logo a la izquierda,
        // título centrado y los datos de sucursal/empresa debajo.
        sheet.mergeCells('A1:B3');
        sheet.mergeCells('C1:I3');
        sheet.getCell('C1').value = `ARQUEO DE CAJA ${caja.cashbox_type || 'CHICA'}`;
        sheet.getCell('C1').font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FF1A3FA8' } };
        sheet.getCell('C1').alignment = { horizontal: 'center', vertical: 'middle' };
        for (let row = 1; row <= 3; row++) {
            for (let column = 1; column <= 9; column++) {
                sheet.getCell(row, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FB' } };
            }
        }
        sheet.getRow(1).height = 22;
        sheet.getRow(2).height = 18;
        sheet.getRow(3).height = 18;
        sheet.mergeCells('A4:I4'); sheet.getCell('A4').value = [company.branchName || 'CASA MATRIZ', company.city, company.nit ? `NIT: ${company.nit}` : null, company.phone ? `Tel: ${company.phone}` : null, company.email].filter(Boolean).join(' | ');
        sheet.mergeCells('A5:I5'); sheet.getCell('A5').value = `Caja ${caja.id} · Apertura: ${moment(caja.date_apertura).format('DD/MM/YYYY HH:mm:ss')} · Cierre: ${caja.date_cierre ? moment(caja.date_cierre).format('DD/MM/YYYY HH:mm:ss') : 'Abierta'}`;
        sheet.mergeCells('A6:I6'); sheet.getCell('A6').value = `Responsable: ${caja.user?.full_names || '-'} · Generado: ${moment().format('DD/MM/YYYY HH:mm:ss')}`;
        for (let row = 4; row <= 6; row++) {
            sheet.getCell(`A${row}`).font = { name: 'Arial', size: row === 4 ? 10 : 9, bold: row === 4, color: { argb: row === 4 ? 'FF008C59' : 'FF475569' } };
            sheet.getCell(`A${row}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }
        const logoPath = imagePath;
        if (fs.existsSync(logoPath)) {
            const logo = workbook.addImage({ filename: logoPath, extension: path.extname(logoPath).replace('.', '') || 'png' });
            sheet.addImage(logo, { tl: { col: 0.35, row: 0.2 }, ext: { width: 54, height: 54 } });
        }
        sheet.addRow([]).height = 6;
        const infoHeader = sheet.addRow(['CONCEPTO', caja.cashbox_type === 'MAYOR' ? 'DETALLE' : 'MONTO (Bs)', '', '']);
        infoHeader.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        infoHeader.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        infoHeader.getCell(1).fill = infoHeader.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00A96B' } };
        const summaryRows = caja.cashbox_type === 'MAYOR' ? [
            ['Caja Mayor', 'Ver saldos separados por cuenta y moneda en el detalle inferior'],
        ] : [
            ['Monto apertura', Number(totals.monto_apertura)], ['Total ingresos', Number(totals.total_ingresos || 0)],
            ['Total egresos', Number(totals.total_gastos || 0)], ['Saldo esperado', Number(totals.monto_apertura_mas_saldo)],
            ['Monto contado al cierre', caja.monto_cierre == null ? 'Caja abierta' : Number(caja.monto_cierre)],
        ];
        summaryRows.forEach(row => sheet.addRow(row));
        sheet.addRow([]);
        const accountTitle = sheet.addRow(['SALDOS POR CUENTA', '', '', '']);
        accountTitle.font = { bold: true, color: { argb: 'FF008C59' } };
        const accountHeader = sheet.addRow(['CUENTA', 'MONEDA', 'APERTURA', 'INGRESOS', 'EGRESOS', 'ESPERADO', 'CONTADO', 'DIFERENCIA']);
        accountHeader.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00A96B' } }; });
        for (const account of totals.accountSummary || []) {
            const closeDetail = (totals.closeDetails || []).find(item => item.id_cuenta === account.id_cuenta);
            const label = account.snapshot_missing ? `${account.name} · SIN APERTURA REGISTRADA` : account.name;
            sheet.addRow([label, account.currency, account.snapshot_missing ? 'Sin dato' : account.opening_amount, account.snapshot_missing ? 'Sin desglose' : account.inflows, account.snapshot_missing ? 'Sin desglose' : account.outflows, account.expected_amount,
                closeDetail?.counted_amount ?? '—', closeDetail?.difference ?? '—']);
        }
        sheet.addRow([]);
        const expenseTitle = sheet.addRow(['GASTOS DOCUMENTADOS']);
        expenseTitle.font = { bold: true, color: { argb: 'FF008C59' } };
        const expenseHeader = sheet.addRow(['FECHA', 'CONCEPTO', 'PROVEEDOR', 'NIT / CI', 'COMPROBANTE', 'CATEGORIA', 'CUENTA', 'MONEDA', 'IMPORTE']);
        expenseHeader.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00A96B' } }; });
        for (const expense of totals.expenseDocuments || []) {
            sheet.addRow([moment(expense.expense_date).format('DD/MM/YYYY'), expense.concept || expense.description, expense.provider_name || '-', expense.provider_tax_id || '-', [expense.receipt_type, expense.receipt_number].filter(Boolean).join(' ') || '-', expense.category?.name || '-', expense.account?.name || '-', expense.currency || 'BOB', Number(expense.amount || 0)]);
        }
        if (!(totals.expenseDocuments || []).length) sheet.addRow(['-', 'Sin gastos documentados', '-', '-', '-', '-', '-', '-', 0]);
        sheet.addRow([]);
        const movementHeader = sheet.addRow(['FECHA', 'TIPO', 'DESCRIPCION / CUENTA', 'MONEDA', 'IMPORTE']);
        movementHeader.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00A96B' } }; cell.alignment = { horizontal: 'center' }; });
        const allMovements = [...(totals.ingresos || []), ...(totals.gastos || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
        allMovements.forEach(item => sheet.addRow([moment(item.date).format('DD/MM/YYYY HH:mm:ss'), item.type, `${item.description || '-'}${item.account?.name ? ` | ${item.account.name}` : ''}${item.type_payment ? ` | ${item.type_payment}` : ''}${item.id_bank ? ` | Banco ${item.id_bank}` : ''}`, item.account?.currency || 'SIN MONEDA REGISTRADA', Number(item.monto || 0)]));
        if (!allMovements.length) sheet.addRow(['-', '-', 'Sin movimientos registrados', '-', 0]);
        sheet.eachRow((row, rowNumber) => {
            row.eachCell((cell, columnNumber) => {
                if (rowNumber > 7 && columnNumber >= 2 && typeof cell.value === 'number') cell.numFmt = `#,##0.${'0'.repeat(decimal)}`;
                if (rowNumber > 7) cell.alignment = { vertical: 'middle', wrapText: true };
            });
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=arqueo-caja-${caja.id}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo generar el Excel del arqueo de Caja.' }] });
    }
};

module.exports = {
    printCaja,
    exportCajaExcel,

}

async function getExpenseDocuments(sessionId) {
    if (!CjExpense) return [];
    const rows = await CjExpense.findAll({ where: { id_caja_small: sessionId }, include: [
        { association: 'account', attributes: ['id', 'name', 'currency'] },
        { association: 'category', attributes: ['id', 'name'] },
    ], order: [['expense_date', 'ASC'], ['id', 'ASC']] });
    return rows.map(row => row.toJSON());
}

async function getAccountSummary(sessionId) {
    const openings = await CjSessionBalance.findAll({ where: { id_caja_small: sessionId }, include: [{ association: 'account' }], order: [['id', 'ASC']] });
    const ledger = await CjLedger.findAll({ where: { id_caja_small: sessionId }, attributes: ['id_cuenta', 'direction', 'amount'] });
    return openings.map(opening => {
        const entries = ledger.filter(row => row.id_cuenta === opening.id_cuenta);
        const inflows = entries.filter(row => row.direction === 'IN').reduce((sum, row) => sum + Number(row.amount), 0);
        const outflows = entries.filter(row => row.direction === 'OUT').reduce((sum, row) => sum + Number(row.amount), 0);
        return { id_cuenta: opening.id_cuenta, name: opening.account?.name || `Cuenta ${opening.id_cuenta}`, type: opening.account?.type || 'BANK', currency: opening.currency,
            opening_amount: Number(opening.opening_amount), inflows, outflows, expected_amount: Number(opening.opening_amount) + inflows - outflows };
    });
}
