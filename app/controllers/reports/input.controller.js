const { buildPurchaseExcel, purchaseExcelContext } = require('../../services/purchase-management-excel.service');
const { queryPurchaseReportExport, summarizeByProduct } = require('../../services/purchase-report-query.service');
const { providerCommercialFilter } = require('../../services/provider-commercial-filter');
const { buildOperationVoucher } = require('../../helpers/generator-pdf/operation-voucher.document');
const { sendReportPdf } = require('../../services/pdf/report-pdf.service');
const { tabularReport } = require('../../helpers/generator-pdf/tabular-report.adapter');
const { Op } = require("sequelize");
const { Input, DetailsInput, Sucursal,sequelize } = require('../../database/config');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const NumeroALetras = require("../../helpers/numeros-aletras");
const { whereDateForType } = require("../../helpers/where_range");
const { getReportLogoPath } = require('../../helpers/report-logo');
const imagePath = getReportLogoPath();
const ExcelJS = require('exceljs');
const { response } = require("express");
const { getNumberDecimal } = require("../../helpers/company");
const { excelNumberMask, formatDecimalEsBo, exactAdd } = require("../../helpers/number-formatter");
const { buildStandardReportHeader } = require('../../helpers/generator-pdf/voucher-template.helper');
const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',hour: "numeric",
minute: "numeric",
second: "numeric", };

moment.locale('es');

const unitQuantitySummary = (rows, decimal) => {
    const totals = new Map();
    rows.forEach(row => {
        const unit = String(row.product?.unit || 'SIN UNIDAD').trim().toUpperCase();
        totals.set(unit, exactAdd(totals.get(unit) || '0', row.dataValues?.suma_quantity || 0));
    });
    return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right, 'es')).map(([unit, quantity]) => `${unit}: ${formatDecimalEsBo(Number(quantity), decimal)}`).join(' · ');
};

const generatePdfReports = async (req = request, res = response) => {
    try {
        const decimal = await getNumberDecimal();
        const inputs = await returnDataInput(req.query);
        const context = await purchaseExcelContext(req.query, req.userAuth);
        let dataPdf = dataPdfReturn(req.userAuth); //PDF 
        let total = '0';
        let total_quantity = '0';
        inputs.forEach((input, index) => {
            total = exactAdd(total, input.total || 0);
            total_quantity = exactAdd(total_quantity, input.total_quantity || 0);
            const tableData = [
                {text:String(index + 1), fontSize:9, alignment: 'center'},
                {text:input?.cod, fontSize:9}, 
                {text:moment(input?.date_voucher).format('DD/MM/YYYY HH:mm:ss'), fontSize:9}, 
                {text:input?.type_registry, fontSize:9}, 
                {text:input?.registry_number, fontSize:9}, 
                {text:input?.provider?.full_names, fontSize:9}, 
                {text:(input.detailsInput || []).map(detail => `${detail.product?.name || '-'} [${detail.quantity} ${detail.product?.unit?.siglas || ''}]`).join(', '), fontSize:9},
                {text:input?.type, fontSize:9}, 
                {text:input?.type_payment, fontSize:9},
                {
                    text:
                        (input?.referral_sources ?? '-') + '\n' +
                        'Cliente antiguo: ' + (input?.old_customer ? 'SI' : 'NO') + '\n' +
                        'Con recojo: ' + (input?.with_pickup ? 'SI' : 'NO'),
                    fontSize: 9
                },
                {text:input?.provider?.type?.name || '', fontSize:9},
                {text:formatDecimalEsBo(Number(input?.total_quantity), decimal), fontSize:9, alignment: 'right'},  
                {text:formatDecimalEsBo(Number(input.total), decimal), fontSize:9, alignment: 'right'},
            ];
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            {colSpan: 11, text:`TOTAL GENERAL: ${NumeroALetras(Number(total))}`,fontSize:10, },
            ...Array.from({ length: 10 }, () => ({ text: '' })),
            {text:`Kg. ${formatDecimalEsBo(Number(total_quantity), decimal)}`, bold: true, fontSize:10, alignment: 'right'},
            {text: `Bs. ${formatDecimalEsBo(Number(total), decimal)}`, bold: true, fontSize:10, alignment: 'right'}
        ]);
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE COMPRAS', paper: 'A4', orientation: 'landscape',
            company: context.company,
            filters: context.filters,
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'input-generatePdfReports.pdf');
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ ok: false, errors: [{ msg: error.message }] });
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de compras' });
    }
}

const resolveReportCompany = async idSucursal => {
    const ids = parseIds(idSucursal);
    if (ids.length !== 1) return { branchName: ids.length ? 'Varias sucursales' : 'CASA MATRIZ' };
    const branch = await Sucursal.findByPk(ids[0], { include: [{ association: 'company', attributes: ['nit', 'email'] }] });
    return branch ? { branchName: branch.name, city: branch.city, nit: branch.company?.nit, email: branch.email || branch.company?.email } : { branchName: 'CASA MATRIZ' };
};

const dataPdfReturn = (auth) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE COMPRAS TOTALIZADOS', auth, details: 'Reporte generado con los parámetros establecidos' }),
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [26,48,68,44,52,82,'*',54,58,86,60,48,58],
            body: [
                [
                    {text:'N.º', fontSize:9,fillColor: '#eeeeee', bold:true},
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA DE COMPRA', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'TIPO DE DOCUMENTO', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'N.º DE DOCUMENTO', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'PROVEEDOR', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'DETALLE', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CONDICIÓN DE PAGO', fontSize:9,fillColor: '#eeeeee', bold:true},
                    {text:'MEDIO DE PAGO', fontSize:9,fillColor: '#eeeeee', bold:true},
                    {text:'REFERENCIA COMERCIAL', fontSize:9,fillColor: '#eeeeee', bold:true},
                    {text:'TIPO PROVEEDOR', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANTIDAD (KG)', fontSize:9,fillColor: '#eeeeee', bold:true},
                    {text:'TOTAL Bs',alignment: 'center', fontSize:9,fillColor: '#eeeeee', bold:true},
                ]
            ]   ,
            layout: 'lightHorizontalLines'
        }
    }
];

const parseIds = (value) => String(value || '').split(',').map(Number).filter(Number.isFinite);

const reportFilterSummary = (params) => {
    const range = params.filterBy === 'RANGE'
        ? `${params.date1 || 'Sin inicio'} a ${params.date2 || 'Sin fin'}`
        : `${params.filterBy || 'Periodo'}: ${params.date1 || '-'}`;
    return [`Periodo: ${range}`, ...(params.report_filters ? String(params.report_filters).split(' | ') : [
        params.id_sucursal ? `Sucursal(es): ${params.id_sucursal}` : 'Sucursal(es): todas',
        params.id_storage ? `Almacén(es): ${params.id_storage}` : 'Almacén(es): todos',
        params.category_ids ? `Categoría(s): ${params.category_ids}` : 'Categoría(s): todas',
        params.id_products ? `Producto(s): ${params.id_products}` : 'Producto(s): todos',
    ])];
};

const generatePurchaseReportExcel = async (req = request, res = response) => {
    try {
        const inputs = await returnDataInput(req.query);
        const decimal = await getNumberDecimal();
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'RECUMET S.R.L.';
        const worksheet = workbook.addWorksheet('Reporte de compras', {
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
            views: [{ state: 'frozen', ySplit: 6 }],
        });
        const headers = ['CÓDIGO', 'FECHA_COMPRA', 'TIPO_DOCUMENTO', 'NRO_DOCUMENTO', 'PROVEEDOR', 'DETALLE', 'TIPO', 'TIPO_PROVEEDOR', 'CANT_KG', 'TOTAL'];
        const totalColumns = headers.length;
        const logoPath = imagePath;

        worksheet.mergeCells(1, 1, 3, 2);
        worksheet.mergeCells(1, 3, 3, totalColumns);
        const title = worksheet.getCell('C1');
        title.value = 'REPORTE DE COMPRAS';
        title.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FF1A3FA8' } };
        title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FB' } };
        title.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(1).height = 22;
        worksheet.getRow(2).height = 18;
        worksheet.getRow(3).height = 18;
        for (let row = 1; row <= 3; row++) {
            for (let column = 1; column <= totalColumns; column++) {
                worksheet.getCell(row, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FB' } };
            }
        }
        if (fs.existsSync(logoPath)) {
            const logo = workbook.addImage({ filename: logoPath, extension: 'png' });
            worksheet.addImage(logo, { tl: { col: 0.35, row: 0.2 }, ext: { width: 54, height: 54 } });
        }

        const filters = reportFilterSummary(req.query);
        filters.slice(0, 5).forEach((filter, index) => {
            const firstColumn = (index * 2) + 1;
            const lastColumn = firstColumn + 1;
            worksheet.mergeCells(4, firstColumn, 4, lastColumn);
            const cell = worksheet.getCell(4, firstColumn);
            cell.value = filter;
            cell.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF475569' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9FC' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
        worksheet.getRow(4).height = 28;
        worksheet.addRow([]).height = 6;

        const headerRow = worksheet.addRow(headers);
        headerRow.height = 22;
        headerRow.eachCell(cell => {
            cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });

        let totalKg = 0;
        let totalAmount = 0;
        const groups = new Map();
        inputs.forEach(input => {
            const provider = input.provider?.full_names || 'SIN PROVEEDOR';
            groups.set(provider, [...(groups.get(provider) || []), input]);
        });
        for (const [provider, purchases] of groups) {
            const providerRow = worksheet.addRow([`PROVEEDOR: ${provider}`]);
            worksheet.mergeCells(providerRow.number, 1, providerRow.number, totalColumns);
            providerRow.height = 20;
            const providerCell = providerRow.getCell(1);
            providerCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F3D99' } };
            providerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5F0FA' } };
            providerCell.alignment = { vertical: 'middle' };
            let providerKg = 0;
            let providerAmount = 0;
            purchases.forEach(input => {
                const quantity = Number(input.total_quantity) || 0;
                const amount = Number(input.total) || 0;
                providerKg += quantity; providerAmount += amount; totalKg += quantity; totalAmount += amount;
                const row = worksheet.addRow([
                    input.cod, moment(input.date_voucher).format('DD/MM/YYYY HH:mm:ss'), input.type_registry,
                    input.registry_number, provider,
                    input.detailsInput.map(detail => `${detail.product?.name || '-'} [${detail.quantity} ${detail.product?.unit?.siglas || ''}]`).join(', '),
                    input.type, input.provider?.type?.name || '-', quantity, amount,
                ]);
                row.eachCell((cell, column) => {
                    cell.font = { name: 'Arial', size: 9 };
                    cell.alignment = { vertical: 'middle', wrapText: column === 6 };
                });
                row.getCell(9).numFmt = excelNumberMask(decimal);
                row.getCell(10).numFmt = excelNumberMask(decimal);
            });
            const subtotal = worksheet.addRow(['SUBTOTAL PROVEEDOR', '', '', '', '', '', '', '', providerKg, providerAmount]);
            subtotal.eachCell(cell => { cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF334155' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } }; });
            subtotal.getCell(9).numFmt = excelNumberMask(decimal);
            subtotal.getCell(10).numFmt = excelNumberMask(decimal);
        }
        const totalRow = worksheet.addRow(['TOTAL GENERAL', '', '', '', '', '', '', '', totalKg, totalAmount]);
        totalRow.eachCell(cell => { cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C956C' } }; });
        totalRow.getCell(9).numFmt = excelNumberMask(decimal);
        totalRow.getCell(10).numFmt = excelNumberMask(decimal);
        [14, 20, 18, 18, 30, 55, 14, 22, 14, 16].forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
        worksheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: totalColumns } };
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte-compras.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ ok: false, errors: [{ msg: error.message }] });
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo generar el reporte Excel de compras.' }] });
    }
};
const generateExcelReports = async (req = request, res = response) => {
  try {
    const inputs = await returnDataInput(req.query);
    const decimal = await getNumberDecimal();
    const inputData = inputs.map((input, index) => ({
        NRO_FILA: index + 1,
        CÓDIGO: input.cod,
        FECHA_COMPRA: moment(input?.date_voucher).format('DD/MM/YYYY HH:mm:ss'),
        TIPO_DOCUMENTO: input.type_registry,
        NRO_DOCUMENTO: input.registry_number,
        PROVEEDOR: input.provider?.full_names ?? '',
        DETALLE: (input.detailsInput || []).map(detail => `${detail.product?.name || '-'} [${detail.quantity} ${detail.product?.unit?.siglas || ''}]`).join(', '),
        TIPO: input.type,
        TIPO_PAGO: input.type_payment ?? '',
        REFERENCIA: (input?.referral_sources ?? '-') + '  ' +
                    'Cliente antiguo: ' + (input?.old_customer ? 'SI' : 'NO') + '  ' +
                    'Con recojo: ' + (input?.with_pickup ? 'SI' : 'NO'),
        TIPO_PROVEEDOR: input.provider?.type?.name ?? '',
        CANT_KG: Number(input.total_quantity),
        TOTAL: Number(input.total),
    }));
    const workbook = await buildPurchaseExcel(req.query, inputData, decimal, false, req.userAuth);

        // Enviar Excel
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=compras-report.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, errors: [{ msg: error.message }] });
    console.log(error);
    return res.status(500).json({
      ok: false,
      errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
    });
  };
};


const returnDataInput = async params => {
    const inputs = await queryPurchaseReportExport(params);
    if (!inputs.length) throw Object.assign(new Error('No hay compras para los filtros seleccionados.'), { statusCode: 404 });
    for (const input of inputs) input.total_quantity = input.dataValues.kg_quantity;
    return inputs;
};
const generatePdfDetailsReports = async (req = request, res = response) => {
    try {
        const decimal = await getNumberDecimal();
        const detailsInput = await returnDataDetailsInput(req.query);
        const context = await purchaseExcelContext(req.query, req.userAuth);
        let dataPdf = dataDetailsPdfReturn(req.userAuth, req.query.date1, req.query.date2); //PDF
        detailsInput.forEach((detail, index) => {
            const tableData = [
                {text:index + 1, fontSize:9, alignment: 'center'},
                {text:detail?.product.cod, fontSize:9}, 
                {text:detail?.product.name, fontSize:9}, 
                {text:detail?.product.unit || '', fontSize:9},
                {text:formatDecimalEsBo(Number(detail?.dataValues.suma_quantity), decimal), fontSize:9, alignment: 'right'}, 
            ];
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            {colSpan: 3, text:'TOTALES POR UNIDAD',fontSize:10},
            {text:''}, {text:''},
            {text:'Por unidad', bold:true},
            {text:unitQuantitySummary(detailsInput, decimal), bold: true, fontSize:10, alignment: 'right'}
        ]);
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE COMPRAS POR PRODUCTO', paper: 'A4', orientation: 'portrait',
            company: context.company,
            filters: context.filters,
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'input-generatePdfDetailsReports.pdf');
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ ok: false, errors: [{ msg: error.message }] });
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'No se pudo generar el PDF. Intente nuevamente.' });
    }
}

const generatePdfDetailsCPPReports = async (req = request, res = response) => {
    try {
        const decimal = await getNumberDecimal();
        const detailsInput = await returnDataDetailsInput(req.query);
        const context = await purchaseExcelContext(req.query, req.userAuth);
        let dataPdf = dataDetailsPdfDetailsCPPReturn(req.userAuth,req.query.date1,req.query.date2); //PDF
        let total_import = '0';
        detailsInput.forEach((detail, index) => {
            total_import = exactAdd(total_import, detail.dataValues.suma_total || 0);
            const tableData = [
                {text:index + 1, fontSize:9, alignment: 'center'},
                {text:detail?.product.cod, fontSize:9}, 
                {text:detail?.product.name, fontSize:9}, 
                {text:detail?.product.unit || '', fontSize:9},
                {text:formatDecimalEsBo(Number(detail?.dataValues.cpp), decimal), fontSize:10, alignment: 'right', bold: true, fillColor: '#DFF0D8'}, 
                {text:formatDecimalEsBo(Number(detail?.dataValues.suma_quantity), decimal), fontSize:9, alignment: 'right'}, 
                {text:formatDecimalEsBo(Number(detail?.dataValues.suma_total), decimal), fontSize:9, alignment: 'right'}, 
            ];
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            {colSpan: 4, text:'TOTALES POR UNIDAD', bold: true,fontSize:10, fillColor: '#eeeeee'},
            {text:''}, {text:''}, {text:''}, {text:''},
            {text:unitQuantitySummary(detailsInput, decimal), bold: true, fontSize:9, alignment: 'right', fillColor: '#eeeeee'},
            {text: `${formatDecimalEsBo(Number(total_import), decimal)}`, bold: true, fontSize:10, alignment: 'right', fillColor: '#eeeeee'}
        ]);
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE COSTO PROMEDIO PONDERADO', paper: 'A4', orientation: 'portrait',
            company: context.company,
            filters: context.filters,
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'input-generatePdfDetailsCPPReports.pdf');
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ ok: false, errors: [{ msg: error.message }] });
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'No se pudo generar el PDF. Intente nuevamente.' });
    }
}

const dataDetailsPdfReturn = (auth,date1,date2) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE COMPRAS POR PRODUCTO', auth, details: `Fecha reporte: ${date1} ${date2}` }),
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [32,60,'*',60,75],
            body: [
                [
                    {text:'N.º', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PRODUCTO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'UNIDAD', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'CANTIDAD', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                ]
            ]   ,
            layout: 'lightHorizontalLines'
        }
    }
];

const dataDetailsPdfDetailsCPPReturn = (auth,date1,date2) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE COSTO PROMEDIO PONDERADO', auth, details: `Fecha reporte: ${date1} ${date2}` }),
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [32,60,'*',55,75,70,75],
            body: [
                [
                    {text:'N.º', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PRODUCTO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'UNIDAD', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'COSTO PROMEDIO (Bs/UNIDAD)', fontSize:8 ,fillColor: '#eeeeee', bold:true},
                    {text:'CANTIDAD POR UNIDAD', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'TOTAL (Bs)', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                ]
            ]   ,
            layout: 'lightHorizontalLines'
        }
    }
];

const generateExcelDetailsReports = async (req = request, res = response) => {
    try {
        const detailsInput = await returnDataDetailsInput(req.query);
        const decimal = await getNumberDecimal();
        const detailsInputData = detailsInput.map((detail, index) => ({
                NRO_FILA: index + 1,
                CÓDIGO: detail?.product.cod,
                PRODUCTO: detail?.product.name,
                UNIDAD: detail?.product.unit || '',
                CANTIDAD: Number(detail?.dataValues.suma_quantity)
        }));
        const workbook = await buildPurchaseExcel(req.query, detailsInputData, decimal, true, req.userAuth);

        // Enviar Excel
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=compras-detalle-report.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ ok: false, errors: [{ msg: error.message }] });
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    };
};


const returnDataDetailsInput = async params => {
    const inputs = await queryPurchaseReportExport(params);
    const summary = summarizeByProduct(inputs);
    if (!summary.length) throw Object.assign(new Error('No hay materiales comprados para los filtros seleccionados.'), { statusCode: 404 });
    return summary.map(row => ({
        product: { cod: row.cod, name: row.name, unit: row.unit },
        dataValues: { suma_quantity: row.quantity, suma_total: row.total, cpp: row.quantity ? row.total / row.quantity : 0 },
    }));
};
const printInputVoucher = async (req = request, res = response) =>{
    try {
        const { id_input } = req.params;
        const input = await Input.findByPk(id_input,{
            attributes: {exclude: ['id_scales','id_storage','id_provider','id_bank','id_user','id_sucursal']},
            include: [ 
                { association: 'provider'},
                { association: 'scale'},
                { association: 'user'},
                { association: 'bank'},
                { association: 'detailsInput', include: [
                        {   association: 'product',
                            include: [{ association:'unit'},{ association: 'category'}]
                        }
                    ]
                },
                { association: 'storage'},
                { association: 'sucursal', include:{ association: 'company'}},
                { association: 'accounts_payable'},
            ]
        });
        const decimal = await getNumberDecimal();
        const weighingRoll = req.userAuth?.role === 'OPERADOR_BALANZA' && req.query.format === 'rollo';
        const document = buildOperationVoucher(input, { kind: 'purchase', decimal, format: weighingRoll ? 'rollo' : undefined });
        await sendReportPdf(res, document, 'boleta-compra-' + id_input + '.pdf');
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ ok: false, errors: [{ msg: error.message }] });
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el comprobante de compra' });
    }
}

module.exports = {
    generatePdfReports,
    generateExcelReports,
    generatePurchaseReportExcel,
    generatePdfDetailsReports,
    generateExcelDetailsReports,
    printInputVoucher,
    generatePdfDetailsCPPReports,

}
