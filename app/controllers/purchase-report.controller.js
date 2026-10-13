const { request, response } = require('express');
const { sendReportPdf } = require('../services/pdf/report-pdf.service');
const ExcelJS = require('exceljs');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const { getNumberDecimal } = require('../helpers/company');
const { excelNumberMask } = require('../helpers/number-formatter');
const { queryPurchaseReportPage, queryPurchaseReportExport, summarizeByProduct } = require('../services/purchase-report-query.service');

const { getReportLogoPath } = require('../helpers/report-logo');
const imagePath = getReportLogoPath();

const restrictToAuthorizedBranches = (params, user) => {
    if (user?.role === 'ADMINISTRADOR') return { ...params };
    const assigned = (user?.assign_sucursales || []).map(({ id_sucursal }) => Number(id_sucursal)).filter(Number.isFinite);
    const requested = String(params.id_sucursal || '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0);
    const allowed = requested.length ? requested.filter((id) => assigned.includes(id)) : assigned;
    return { ...params, id_sucursal: allowed.join(',') };
};

const selectedPeriodLabel = (params) => {
    if (params.filterBy === 'RANGE') {
        const start = moment(params.date1, 'DD-MM-YYYY', true);
        const end = moment(params.date2 || params.date1, 'DD-MM-YYYY', true);
        return `Período: ${start.isValid() ? start.format('DD/MM/YYYY') : '-'} al ${end.isValid() ? end.format('DD/MM/YYYY') : '-'}`;
    }
    if (params.filterBy === 'YEAR') return `Período anual: ${params.date1 || '-'}`;
    if (params.filterBy === 'DAY') {
        const day = moment(params.date1, 'DD-MM-YYYY', true);
        return `Período diario: ${day.isValid() ? day.format('DD/MM/YYYY') : '-'}`;
    }
    const month = moment(`${params.date1 || ''}-${params.date2 || ''}`, 'MM-YYYY', true).locale('es');
    return `Período mensual: ${month.isValid() ? month.format('MMMM [de] YYYY').replace(/^./, (letter) => letter.toUpperCase()) : '-'}`;
};

const reportFilterSummary = (params) => [
    selectedPeriodLabel(params),
    ...String(params.report_filters || [
        `Sucursales: ${params.id_sucursal || 'Todas'}`,
        `Almacenes: ${params.id_storage || 'Todos'}`,
        `Categorías: ${params.category_ids || 'Todas'}`,
        `Productos: ${params.id_products || 'Todos'}`,
    ].join(' | ')).split(' | ').filter((item) => !/^per[ií]odo/i.test(item)),
];

const purchaseDetail = (input) => (input.detailsInput || []).map((detail) =>
    `${detail.product?.name || '-'} [${detail.quantity} ${detail.product?.unit?.siglas || ''}]`
).join(', ');

const pdfCell = (text, options = {}) => ({ text: String(text ?? ''), fontSize: 6.5, margin: [2, 2, 2, 2], ...options });

const buildPurchaseReportPdfBody = (inputs, decimal) => {
    const columns = ['CÓDIGO', 'FECHA_COMPRA', 'TIPO_DOCUMENTO', 'NRO_DOCUMENTO', 'PROVEEDOR', 'DETALLE', 'TIPO', 'TIPO_PROVEEDOR', 'CANT_KG', 'TOTAL'];
    const body = [columns.map((text) => pdfCell(text, { bold: true, fillColor: '#D1D5DB', fontSize: 6.5, alignment: 'center' }))];
    const groups = new Map();
    inputs.forEach((input) => {
        const provider = input.provider?.full_names || 'SIN PROVEEDOR';
        groups.set(provider, [...(groups.get(provider) || []), input]);
    });
    let totalKg = 0; let totalAmount = 0;
    for (const [provider, purchases] of groups) {
        body.push([pdfCell(`PROVEEDOR: ${provider}`, { colSpan: columns.length, bold: true, fillColor: '#E5E7EB', fontSize: 7 }), ...Array(columns.length - 1).fill({})]);
        let providerKg = 0; let providerAmount = 0;
        purchases.forEach((input) => {
            const quantity = Number(input.total_quantity || 0); const amount = Number(input.total || 0);
            providerKg += quantity; providerAmount += amount; totalKg += quantity; totalAmount += amount;
            body.push([
                pdfCell(input.cod), pdfCell(moment(input.date_voucher).format('DD/MM/YYYY\nHH:mm')),
                pdfCell(input.type_registry), pdfCell(input.registry_number), pdfCell(provider), pdfCell(purchaseDetail(input)),
                pdfCell(input.type), pdfCell(input.provider?.type?.name || '-'),
                pdfCell(quantity.toFixed(decimal), { alignment: 'right' }), pdfCell(amount.toFixed(decimal), { alignment: 'right' }),
            ]);
        });
        body.push([
            pdfCell('SUBTOTAL PROVEEDOR', { colSpan: 8, bold: true, fillColor: '#F3F4F6' }), ...Array(7).fill({}),
            pdfCell(providerKg.toFixed(decimal), { bold: true, fillColor: '#F3F4F6', alignment: 'right' }),
            pdfCell(providerAmount.toFixed(decimal), { bold: true, fillColor: '#F3F4F6', alignment: 'right' }),
        ]);
    }
    body.push([
        pdfCell('TOTAL GENERAL', { colSpan: 8, bold: true, fillColor: '#D1D5DB', fontSize: 7 }), ...Array(7).fill({}),
        pdfCell(totalKg.toFixed(decimal), { bold: true, fillColor: '#D1D5DB', alignment: 'right', fontSize: 7 }),
        pdfCell(totalAmount.toFixed(decimal), { bold: true, fillColor: '#D1D5DB', alignment: 'right', fontSize: 7 }),
    ]);
    return body;
};

const getPurchaseReport = async (req = request, res = response) => {
    try {
        const inputs = await queryPurchaseReportPage(restrictToAuthorizedBranches(req.query, req.userAuth));
        return res.status(200).json({ ok: true, inputs });
    } catch (error) {
        console.error('Error consultando el Reporte de compras:', error);
        return res.status(error.statusCode || 500).json({ ok: false, errors: [{ msg: error.statusCode ? error.message : 'No se pudo consultar el Reporte de compras.' }] });
    }
};

const generatePurchaseReportExcel = async (req = request, res = response) => {
    try {
        const params = restrictToAuthorizedBranches(req.query, req.userAuth);
        const inputs = await queryPurchaseReportExport(params);
        const decimal = await getNumberDecimal();
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'RECUMET S.R.L.';
        const worksheet = workbook.addWorksheet('Compras por proveedor', {
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
            views: [{ state: 'frozen', ySplit: 6 }],
        });
        const headers = ['CÓDIGO', 'FECHA_COMPRA', 'TIPO_DOCUMENTO', 'NRO_DOCUMENTO', 'PROVEEDOR', 'DETALLE', 'TIPO', 'TIPO_PROVEEDOR', 'CANT_KG', 'TOTAL'];
        worksheet.mergeCells(1, 1, 3, 2);
        worksheet.mergeCells(1, 3, 3, headers.length);
        for (let row = 1; row <= 3; row += 1) {
            for (let column = 1; column <= headers.length; column += 1) {
                worksheet.getCell(row, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
            }
        }
        const title = worksheet.getCell('C1');
        title.value = 'REPORTE DE COMPRAS';
        title.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FF000000' } };
        title.alignment = { horizontal: 'center', vertical: 'middle' };
        if (fs.existsSync(imagePath)) {
            worksheet.addImage(workbook.addImage({ filename: imagePath, extension: 'png' }), { tl: { col: 0.35, row: 0.2 }, ext: { width: 54, height: 54 } });
        }
        const filterRow = worksheet.getRow(4);
        filterRow.height = 28;
        reportFilterSummary(params).slice(0, 5).forEach((filter, index) => {
            const column = (index * 2) + 1;
            worksheet.mergeCells(4, column, 4, Math.min(column + 1, headers.length));
            const cell = worksheet.getCell(4, column);
            cell.value = filter;
            cell.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF374151' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
        worksheet.addRow([]).height = 6;
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell) => {
            cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
        const groups = new Map();
        inputs.forEach((input) => {
            const provider = input.provider?.full_names || 'SIN PROVEEDOR';
            groups.set(provider, [...(groups.get(provider) || []), input]);
        });
        let totalKg = 0; let totalAmount = 0;
        const numberFormat = excelNumberMask(decimal);
        for (const [provider, purchases] of groups) {
            const groupRow = worksheet.addRow([`PROVEEDOR: ${provider}`]);
            worksheet.mergeCells(groupRow.number, 1, groupRow.number, headers.length);
            groupRow.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
            groupRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
            let providerKg = 0; let providerAmount = 0;
            purchases.forEach((input) => {
                const quantity = Number(input.total_quantity || 0); const amount = Number(input.total || 0);
                providerKg += quantity; providerAmount += amount; totalKg += quantity; totalAmount += amount;
                const row = worksheet.addRow([
                    input.cod, moment(input.date_voucher).format('DD/MM/YYYY HH:mm:ss'), input.type_registry,
                    input.registry_number, provider, purchaseDetail(input), input.type,
                    input.provider?.type?.name || '-', quantity, amount,
                ]);
                row.eachCell((cell, column) => { cell.font = { name: 'Arial', size: 9 }; cell.alignment = { vertical: 'middle', wrapText: column === 6 }; });
                row.getCell(9).numFmt = numberFormat; row.getCell(10).numFmt = numberFormat;
            });
            const subtotal = worksheet.addRow(['SUBTOTAL PROVEEDOR', '', '', '', '', '', '', '', providerKg, providerAmount]);
            subtotal.eachCell((cell) => { cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF111827' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; });
            subtotal.getCell(9).numFmt = numberFormat; subtotal.getCell(10).numFmt = numberFormat;
        }
        const totalRow = worksheet.addRow(['TOTAL GENERAL', '', '', '', '', '', '', '', totalKg, totalAmount]);
        totalRow.eachCell((cell) => { cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } }; });
        totalRow.getCell(9).numFmt = numberFormat; totalRow.getCell(10).numFmt = numberFormat;
        [14, 20, 18, 18, 30, 55, 14, 22, 14, 16].forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
        worksheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: headers.length } };
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte-compras-por-proveedor.xlsx');
        await workbook.xlsx.write(res); return res.end();
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo generar el Excel del Reporte de compras.' }] });
    }
};

const purchaseTableDocument = (body, widths, metadata) => ({
    ...metadata,
    columns: body[0].map((cell, index) => ({ label: cell.text, width: widths[index], align: cell.alignment })),
    rows: body.slice(1).map(cells => ({
        kind: String(cells[0]?.text || '').startsWith('PROVEEDOR:') ? 'group'
            : String(cells[0]?.text || '').startsWith('SUBTOTAL') ? 'subtotal'
                : String(cells[0]?.text || '').startsWith('TOTAL') ? 'total' : 'detail',
        cells: cells.map(cell => ({ text: cell.text ?? '', span: cell.colSpan, align: cell.alignment })),
    })),
});

const generatePurchaseReportPdf = async (req = request, res = response) => {
    try {
        const params = restrictToAuthorizedBranches(req.query, req.userAuth);
        const inputs = await queryPurchaseReportExport(params);
        const decimal = await getNumberDecimal();
        const body = buildPurchaseReportPdfBody(inputs, decimal);
        const document = purchaseTableDocument(body, [42,45,42,47,68,185,38,57,42,48], {
            title: 'REPORTE DE COMPRAS', filters: reportFilterSummary(params), paper: 'LETTER', orientation: 'landscape',
        });
        await sendReportPdf(res, document, 'reporte-compras.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo generar el PDF del Reporte de compras.' }] });
    }
};

const buildDetailedPdfBody = (inputs, decimal) => {
    const summary = summarizeByProduct(inputs);
    const body = [[
        pdfCell('N', { bold: true, fillColor: '#D1D5DB', alignment: 'center' }),
        pdfCell('CÓDIGO', { bold: true, fillColor: '#D1D5DB', alignment: 'center' }),
        pdfCell('PRODUCTO', { bold: true, fillColor: '#D1D5DB', alignment: 'center' }),
        pdfCell('CANTIDAD', { bold: true, fillColor: '#D1D5DB', alignment: 'center' }),
    ]];
    summary.forEach((row, index) => {
        body.push([
            pdfCell(index + 1, { alignment: 'center' }),
            pdfCell(row.cod),
            pdfCell(row.name),
            pdfCell(Number(row.quantity).toFixed(decimal), { alignment: 'right' }),
        ]);
    });
    const total = summary.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    body.push([
        pdfCell('TOTAL', { colSpan: 3, bold: true, fillColor: '#D1D5DB' }), ...Array(2).fill({}),
        pdfCell(total.toFixed(decimal), { bold: true, fillColor: '#D1D5DB', alignment: 'right' }),
    ]);
    return body;
};

const buildDetailedCppPdfBody = (inputs, decimal) => {
    const summary = summarizeByProduct(inputs);
    const body = [[
        pdfCell('CÓDIGO', { bold: true, fillColor: '#D1D5DB', alignment: 'center' }),
        pdfCell('PRODUCTO', { bold: true, fillColor: '#D1D5DB', alignment: 'center' }),
        pdfCell('COSTO PROMEDIO PONDERADO', { bold: true, fillColor: '#D1D5DB', alignment: 'center' }),
        pdfCell('CANTIDAD', { bold: true, fillColor: '#D1D5DB', alignment: 'center' }),
        pdfCell('TOTAL COMPRA', { bold: true, fillColor: '#D1D5DB', alignment: 'center' }),
    ]];
    summary.forEach((row) => {
        const quantity = Number(row.quantity || 0);
        const total = Number(row.total || 0);
        const cpp = quantity ? total / quantity : 0;
        body.push([
            pdfCell(row.cod),
            pdfCell(row.name),
            pdfCell(cpp.toFixed(decimal), { alignment: 'right', bold: true, fillColor: '#DFF0D8' }),
            pdfCell(quantity.toFixed(decimal), { alignment: 'right' }),
            pdfCell(total.toFixed(decimal), { alignment: 'right' }),
        ]);
    });
    const totalQuantity = summary.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const totalAmount = summary.reduce((sum, row) => sum + Number(row.total || 0), 0);
    body.push([
        pdfCell('TOTAL', { colSpan: 3, bold: true, fillColor: '#D1D5DB' }), ...Array(2).fill({}),
        pdfCell(totalQuantity.toFixed(decimal), { bold: true, fillColor: '#D1D5DB', alignment: 'right' }),
        pdfCell(totalAmount.toFixed(decimal), { bold: true, fillColor: '#D1D5DB', alignment: 'right' }),
    ]);
    return body;
};

const generatePurchaseReportDetailsPdf = async (req = request, res = response) => {
    try {
        const params = restrictToAuthorizedBranches(req.query, req.userAuth);
        const inputs = await queryPurchaseReportExport(params);
        const decimal = await getNumberDecimal();
        const body = buildDetailedPdfBody(inputs, decimal);
        const document = purchaseTableDocument(body, [30,70,300,80], {
            title: 'REPORTE DE COMPRAS - RESUMEN POR PRODUCTO', filters: reportFilterSummary(params), paper: 'LETTER', orientation: 'portrait',
        });
        await sendReportPdf(res, document, 'reporte-compras-resumen-producto.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo generar el PDF de resumen por producto.' }] });
    }
};

const generatePurchaseReportDetailsPdfCpp = async (req = request, res = response) => {
    try {
        const params = restrictToAuthorizedBranches(req.query, req.userAuth);
        const inputs = await queryPurchaseReportExport(params);
        const decimal = await getNumberDecimal();
        const body = buildDetailedCppPdfBody(inputs, decimal);
        const document = purchaseTableDocument(body, [70,220,80,70,80], {
            title: 'REPORTE DE COMPRAS - DETALLE COSTO PROMEDIO', filters: reportFilterSummary(params), paper: 'LETTER', orientation: 'portrait',
        });
        await sendReportPdf(res, document, 'reporte-compras-costo-promedio.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo generar el PDF detallado por costo promedio.' }] });
    }
};

const generatePurchaseReportExcelDetails = async (req = request, res = response) => {
    try {
        const params = restrictToAuthorizedBranches(req.query, req.userAuth);
        const inputs = await queryPurchaseReportExport(params);
        const decimal = await getNumberDecimal();
        const summary = summarizeByProduct(inputs);
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'RECUMET S.R.L.';
        const worksheet = workbook.addWorksheet('Resumen por producto', {
            views: [{ state: 'frozen', ySplit: 6 }],
        });
        const headers = ['CÓDIGO', 'PRODUCTO', 'CANTIDAD'];
        worksheet.mergeCells(1, 1, 3, 2);
        worksheet.mergeCells(1, 3, 3, headers.length);
        for (let row = 1; row <= 3; row += 1) {
            for (let column = 1; column <= headers.length; column += 1) {
                worksheet.getCell(row, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
            }
        }
        const title = worksheet.getCell('C1');
        title.value = 'REPORTE DE COMPRAS - RESUMEN POR PRODUCTO';
        title.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FF000000' } };
        title.alignment = { horizontal: 'center', vertical: 'middle' };
        if (fs.existsSync(imagePath)) {
            worksheet.addImage(workbook.addImage({ filename: imagePath, extension: 'png' }), { tl: { col: 0.35, row: 0.2 }, ext: { width: 54, height: 54 } });
        }
        const filterRow = worksheet.getRow(4);
        filterRow.height = 28;
        reportFilterSummary(params).slice(0, headers.length).forEach((filter, index) => {
            const column = index + 1;
            const cell = worksheet.getCell(4, column);
            cell.value = filter;
            cell.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF374151' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
        worksheet.addRow([]).height = 6;
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell) => {
            cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
        const numberFormat = excelNumberMask(decimal);
        summary.forEach((row) => {
            worksheet.addRow([row.cod, row.name, Number(row.quantity || 0)]);
        });
        const total = summary.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
        const totalRow = worksheet.addRow(['TOTAL', '', total]);
        totalRow.eachCell((cell) => { cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } }; });
        worksheet.getColumn('C').numFmt = numberFormat;
        worksheet.getColumn('C').alignment = { horizontal: 'right' };
        [15, 55, 20].forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte-compras-resumen-producto.xlsx');
        await workbook.xlsx.write(res); return res.end();
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo generar el Excel de resumen por producto.' }] });
    }
};

module.exports = { getPurchaseReport, generatePurchaseReportExcel, generatePurchaseReportPdf, generatePurchaseReportDetailsPdf, generatePurchaseReportDetailsPdfCpp, generatePurchaseReportExcelDetails, restrictToAuthorizedBranches, reportFilterSummary, buildPurchaseReportPdfBody, buildDetailedPdfBody, buildDetailedCppPdfBody };
