const { buildPurchaseExcel } = require('../../services/purchase-management-excel.service');
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
const { excelNumberMask } = require("../../helpers/number-formatter");
const { buildStandardReportHeader } = require('../../helpers/generator-pdf/voucher-template.helper');
const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',hour: "numeric",
minute: "numeric",
second: "numeric", };

moment.locale('es');

const generatePdfReports = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2} = req.query;
        const decimal = await getNumberDecimal();
        const inputs = await returnDataInput(req.query);
        let dataPdf = dataPdfReturn(req.userAuth); //PDF 
        let total = 0;
        let total_quantity = 0;
        inputs.forEach(input => {
            total += Number(input.total);
            total_quantity += Number(input.total_quantity);
            const tableData = [
                {text:input?.cod, fontSize:9}, 
                {text:moment(input?.date_voucher).format('DD/MM/YYYY HH:mm:ss'), fontSize:9}, 
                {text:input?.type_registry, fontSize:9}, 
                {text:input?.registry_number, fontSize:9}, 
                {text:input?.provider?.full_names, fontSize:9}, 
                {text:input.detailsInput.map(res => res.product.name + ` [${res.quantity} ${res.product.unit.siglas}]`).join(', '), fontSize:9}, 
                {text:input?.type, fontSize:9}, 
                {
                    text:
                        (input?.referral_sources ?? '-') + '\n' +
                        'Cliente antiguo: ' + (input?.old_customer ? 'SI' : 'NO') + '\n' +
                        'Con recojo: ' + (input?.with_pickup ? 'SI' : 'NO'),
                    fontSize: 9
                },
                {text:input?.provider?.type.name, fontSize:9}, 
                {text:Number(input?.total_quantity).toFixed(decimal), fontSize:9, alignment: 'right'},  
                {text:Number(input.total).toFixed(decimal), fontSize:9, alignment: 'right'},
            ];
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            {colSpan: 9, text:`TOTAL: ${NumeroALetras(total)}`,fontSize:10, },
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:`Kg. ${Number(total_quantity).toFixed(decimal)}`, bold: true, fontSize:10, alignment: 'right'},
            {text: `Bs. ${Number(total).toFixed(decimal)}`, bold: true, fontSize:10, alignment: 'right'}
        ]);
        const formatDate1 = filterBy == 'MONTH' ? 'MM' : filterBy == 'YEAR' ? 'YYYY' : 'DD-MM-YYYY'; 
        const formatDate2 = filterBy == 'MONTH' ? 'YYYY' : 'DD-MM-YYYY';
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE COMPRAS', paper: 'A4', orientation: 'landscape',
            company: await resolveReportCompany(req.query.id_sucursal),
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
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
            widths: [60,50,40,55,90,'*',45,80,60,50,50],
            body: [
                [
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO DOC.', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'NRO. DOC.', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PROVEEDOR', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'DETALLE', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO', fontSize:9,fillColor: '#eeeeee', bold:true}, 
                    {text:'REFERENCIA', fontSize:9,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO PROVEEDOR', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANT. KG', fontSize:9,fillColor: '#eeeeee', bold:true}, 
                    {text:'TOTAL',alignment: 'center', fontSize:9,fillColor: '#eeeeee', bold:true}, 
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
    let input_data = [];

    if (inputs.length == 0) {
      input_data.push({
        CÓDIGO: '',
        FECHA_COMPRA: '',
        TIPO_DOCUMENTO: '',
        NRO_DOCUMENTO: '',
        PROVEEDOR: '',
        DETALLE: '',
        TIPO: '',
        REFERENCIA: '',
        TIPO_PROVEEDOR: '',
        CANT_KG: 0,
        TOTAL: 0,
      });
    }

    let total = 0;
    let total_quantity = 0;

    inputs.forEach(input => {
      total += Number(input.total);
      total_quantity += Number(input.total_quantity);

      const tableData = {
        CÓDIGO: input.cod,
        FECHA_COMPRA: moment(input?.date_voucher).format('DD/MM/YYYY HH:mm:ss'),
        TIPO_DOCUMENTO: input.type_registry,
        NRO_DOCUMENTO: input.registry_number,
        PROVEEDOR: input.provider?.full_names ?? '',
        DETALLE: input.detailsInput.map(res => res.product.name + ` [${res.quantity} ${res.product.unit.siglas}]`).join(', '),
        TIPO: input.type,
        REFERENCIA: (input?.referral_sources ?? '-') + '  ' +
                    'Cliente antiguo: ' + (input?.old_customer ? 'SI' : 'NO') + '  ' +
                    'Con recojo: ' + (input?.with_pickup ? 'SI' : 'NO'),
        TIPO_PROVEEDOR: input.provider?.type?.name ?? '',
        CANT_KG: Number(input.total_quantity),
        TOTAL: Number(input.total),
      };
      input_data.push(tableData);
    });

    // Totales finales (como número, no texto)
    input_data.push({
      CÓDIGO: '',
      FECHA_COMPRA: '',
      TIPO_DOCUMENTO: '',
      NRO_DOCUMENTO: '',
      PROVEEDOR: '',
      DETALLE: '',
      TIPO: '',
      REFERENCIA: '',
      TIPO_PROVEEDOR: '',
      CANT_KG: Number(total_quantity),
      TOTAL: Number(total),
    });

    const workbook = await buildPurchaseExcel(req.query, input_data.slice(0, -1), decimal, false);

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
    for (const input of inputs) input.total_quantity = input.dataValues.total_quantity;
    return inputs;
};
const generatePdfDetailsReports = async (req = request, res = response) => {
    try {
        const {filterBy, date1, date2, id_sucursal} = req.query;
        const decimal = await getNumberDecimal();
        const detailsInput = await returnDataDetailsInput(req.query);
        let dataPdf = dataDetailsPdfReturn(req.userAuth,date1,date2); //PDF 
        let total = 0;
        let index= 1;
        detailsInput.forEach(detail => {
            total = Number(total) + Number(detail.dataValues.suma_quantity);
            const tableData = [
                {text:index, fontSize:9}, 
                {text:detail?.product.cod, fontSize:9}, 
                {text:detail?.product.name, fontSize:9}, 
                {text:Number(detail?.dataValues.suma_quantity).toFixed(decimal), fontSize:9, alignment: 'right'}, 
            ];
            dataPdf[5].table.body.push(tableData);
            index++;
        });
        dataPdf[5].table.body.push([
            {colSpan: 2, text:`TOTAL`,fontSize:10},
            {text:''},
            {text:''},
            {text: `${Number(total).toFixed(decimal)}`, bold: true, fontSize:10, alignment: 'right'}
        ]);
        const formatDate1 = filterBy == 'MONTH' ? 'MM' : filterBy == 'YEAR' ? 'YYYY' : 'DD-MM-YYYY'; 
        const formatDate2 = filterBy == 'MONTH' ? 'YYYY' : 'DD-MM-YYYY';
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE COMPRAS POR PRODUCTO', paper: 'A4', orientation: 'portrait',
            company: await resolveReportCompany(id_sucursal),
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
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
        const {filterBy, date1, date2, id_sucursal} = req.query;
        const decimal = await getNumberDecimal();
        const detailsInput = await returnDataDetailsInput(req.query);
        let dataPdf = dataDetailsPdfDetailsCPPReturn(req.userAuth,date1,date2); //PDF
        let total_import = 0, suma_quantity = 0; 
        detailsInput.forEach(detail => {
            suma_quantity = Number(suma_quantity) + Number(detail.dataValues.suma_quantity);
            total_import = Number(total_import) + Number(detail.dataValues.suma_total);
            const tableData = [
                {text:detail?.product.cod, fontSize:9}, 
                {text:detail?.product.name, fontSize:9}, 
                {text:Number(detail?.dataValues.cpp).toFixed(decimal), fontSize:10, alignment: 'right', bold: true, fillColor: '#DFF0D8'}, 
                {text:Number(detail?.dataValues.suma_quantity).toFixed(decimal), fontSize:9, alignment: 'right'}, 
                {text:Number(detail?.dataValues.suma_total).toFixed(decimal), fontSize:9, alignment: 'right'}, 
            ];
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            {colSpan: 3, text:`TOTAL`, bold: true,fontSize:10, fillColor: '#eeeeee'},
            {text:''},
            {text:''},
            {text: `${Number(suma_quantity).toFixed(decimal)}`, bold: true, fontSize:10, alignment: 'right', fillColor: '#eeeeee'},
            {text: `${Number(total_import).toFixed(decimal)}`, bold: true, fontSize:10, alignment: 'right', fillColor: '#eeeeee'}
        ]);
        const formatDate1 = filterBy == 'MONTH' ? 'MM' : filterBy == 'YEAR' ? 'YYYY' : 'DD-MM-YYYY'; 
        const formatDate2 = filterBy == 'MONTH' ? 'YYYY' : 'DD-MM-YYYY';
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE COSTO PROMEDIO', paper: 'A4', orientation: 'portrait',
            company: await resolveReportCompany(id_sucursal),
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
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
    ...buildStandardReportHeader({ title: 'COMPRAS TOTALIZADAS', auth, details: `Fecha reporte: ${date1} ${date2}` }),
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [70,60,'*',70],
            body: [
                [
                    {text:'N', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PRODUCTO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANTIDAD', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                ]
            ]   ,
            layout: 'lightHorizontalLines'
        }
    }
];

const dataDetailsPdfDetailsCPPReturn = (auth,date1,date2) => [
    ...buildStandardReportHeader({ title: 'COMPRAS DETALLE COSTO PROMEDIO', auth, details: `Fecha reporte: ${date1} ${date2}` }),
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [70,'*',70,70,70],
            body: [
                [
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PRODUCTO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'COSTO PROMEDIO PONDERADO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANTIDAD', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TOTAL COMPRA', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
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
        let detailsInput_data = [];

        if (detailsInput.length == 0) {
            detailsInput_data.push({
                CÓDIGO: '',
                PRODUCTO: '',
                CANTIDAD: 0
            });
        }

        let total = 0;
        detailsInput.forEach(detail => {
            total += Number(detail?.dataValues.suma_quantity);
            const tableData = {
                CÓDIGO: detail?.product.cod,
                PRODUCTO: detail?.product.name,
                CANTIDAD: Number(detail?.dataValues.suma_quantity)
            }
            detailsInput_data.push(tableData);
        });

        // Total final
        detailsInput_data.push({
            CÓDIGO: '',
            PRODUCTO: '',
            CANTIDAD: Number(total)
        });

        const workbook = await buildPurchaseExcel(req.query, detailsInput_data.slice(0, -1), decimal, true);

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
        product: { cod: row.cod, name: row.name },
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
        const document = buildOperationVoucher(input, { kind: 'purchase', decimal, format: req.query.format });
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
