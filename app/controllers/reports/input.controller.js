const { buildOperationVoucher } = require('../../helpers/generator-pdf/operation-voucher.document');
const { sendReportPdf } = require('../../services/pdf/report-pdf.service');
const { tabularReport } = require('../../helpers/generator-pdf/tabular-report.adapter');
const { Op } = require("sequelize");
const { Input, DetailsInput,sequelize } = require('../../database/config');
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
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'input-generatePdfReports.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de compras' });
    }
}

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
        PROVEEDOR: input.provider.full_names,
        DETALLE: input.detailsInput.map(res => res.product.name + ` [${res.quantity} ${res.product.unit.siglas}]`).join(', '),
        TIPO: input.type,
        REFERENCIA: (input?.referral_sources ?? '-') + '  ' +
                    'Cliente antiguo: ' + (input?.old_customer ? 'SI' : 'NO') + '  ' +
                    'Con recojo: ' + (input?.with_pickup ? 'SI' : 'NO'),
        TIPO_PROVEEDOR: input.provider.type.name,
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

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Compras totales`);

    // Encabezados
    const headers = Object.keys(input_data[0]);
    worksheet.addRow(headers);

    // Datos
    input_data.forEach(data => {
      const row = [];
      headers.forEach(header => row.push(data[header]));
      worksheet.addRow(row);
    });

    // Configuración visual
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.getColumn('A').width = 15; 
    worksheet.getColumn('B').width = 20; 
    worksheet.getColumn('C').width = 25; 
    worksheet.getColumn('D').width = 25; 
    worksheet.getColumn('E').width = 20; 
    worksheet.getColumn('F').width = 50; 
    worksheet.getColumn('G').width = 50; 
    worksheet.getColumn('H').width = 50; 
    worksheet.getColumn('I').width = 50; 
    worksheet.getColumn('J').width = 15; 
    worksheet.getColumn('K').width = 15; 

    // Formato decimal para números
    const decimalFormat = excelNumberMask(decimal);
    worksheet.getColumn('J').numFmt = decimalFormat; // CANT_KG
    worksheet.getColumn('K').numFmt = decimalFormat; // TOTAL
    worksheet.getColumn('J').alignment = { horizontal: 'right' };
    worksheet.getColumn('K').alignment = { horizontal: 'right' };

    // Enviar Excel
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=compras-report.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      ok: false,
      errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
    });
  };
};


const returnDataInput = async (params) => {
    const {id_sucursal, id_storage,type_pay, type_registry, id_provider, status, filterBy, date1, date2,orderNew, referral_sources, id_type_provider,
        old_customer, with_pickup, category_ids, id_products
    } = params;
    const sucursalIds = parseIds(id_sucursal);
    const storageIds = parseIds(id_storage);
    const categoryIds = parseIds(category_ids);
    const productIds = parseIds(id_products);
    const whereDate = whereDateForType(filterBy,date1, date2, '"Input"."date_voucher"');
    const orderList = (orderNew && Array.isArray(orderNew) && orderNew.length > 0 && orderNew[0])
        ? [orderNew]
        : [['date_voucher', 'DESC']];
    const optionsDb = {
        order: orderList,
        where: {
            [Op.and]: [
                sucursalIds.length ? { id_sucursal: { [Op.in]: sucursalIds } } : {},
                storageIds.length ? { id_storage: { [Op.in]: storageIds } } : {},
                type_pay      ? { type:type_pay } : {},
                type_registry ? { type_registry } : {},
                id_provider   ? { id_provider   } : {},
                status        ? { status } : {},
                { date_voucher: whereDate },
                referral_sources ? { referral_sources } : {},
                old_customer ? { old_customer: old_customer == 'SI' } : {},
                with_pickup   ? { with_pickup: with_pickup == 'SI'} : {},
            ]
        },
        include: [ 
            { 
                association: 'provider', attributes: ['full_names','number_document','name_contact'],
                where: id_type_provider ? { id_type_provider } : {},
                include: [{association: 'type', attributes: ['name']}],
            },
            { association: 'scale', attributes: ['name']},
            { association: 'user', attributes: ['full_names','number_document']},
            {
                association: 'detailsInput',
                attributes: {include: ['quantity']},
                where: { status: 'ACTIVE' },
                required: categoryIds.length > 0 || productIds.length > 0,
                include: [{
                    association: 'product',
                    attributes: ['cod','name'],
                    where: {
                        ...(categoryIds.length ? { id_category: { [Op.in]: categoryIds } } : {}),
                        ...(productIds.length ? { id: { [Op.in]: productIds } } : {}),
                    },
                    required: categoryIds.length > 0 || productIds.length > 0,
                    include: [{association: 'unit', attributes: ['name','siglas']}],
                }],
            },
        ]
    };
    const inputs = await Input.findAll(optionsDb);
    for (const input of inputs) {
        input.total_quantity = input.detailsInput.reduce((acc, item) => acc + Number(item.quantity), 0);
    }
    return inputs;
}

const generatePdfDetailsReports = async (req = request, res = response) => {
    try {
        const {filterBy, date1, date2} = req.query;
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
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'input-generatePdfDetailsReports.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'No se pudo generar el PDF. Intente nuevamente.' });
    }
}

const generatePdfDetailsCPPReports = async (req = request, res = response) => {
    try {
        const {filterBy, date1, date2} = req.query;
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
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'input-generatePdfDetailsCPPReports.pdf');
    } catch (error) {
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

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Compras detalladas`);

        // Encabezados
        const headers = Object.keys(detailsInput_data[0]);
        worksheet.addRow(headers);

        // Datos
        detailsInput_data.forEach(data => {
            const row = [];
            headers.forEach(header => row.push(data[header]));
            worksheet.addRow(row);
        });

        // Configuración visual
        worksheet.getColumn('A').width = 15; 
        worksheet.getColumn('B').width = 50; 
        worksheet.getColumn('C').width = 20; 

        // Formato decimal para CANTIDAD
        const decimalFormat = excelNumberMask(decimal);
        worksheet.getColumn('C').numFmt = decimalFormat;
        worksheet.getColumn('C').alignment = { horizontal: 'right' };

        // Enviar Excel
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=compras-detalle-report.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    };
};


const returnDataDetailsInput = async (params) => {
    const {id_sucursal, id_storage,type_pay, type_registry, id_provider, status, filterBy, date1, date2, referral_sources, id_type_provider, old_customer, with_pickup} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"input"."date_voucher"');
    const optionsDb = {
        attributes: [
            [sequelize.fn('SUM', sequelize.col('quantity')), 'suma_quantity'],
            [sequelize.fn('SUM', sequelize.col('DetailsInput.total')), 'suma_total'],
            [
                sequelize.literal(`
                    SUM("DetailsInput"."total") / NULLIF(SUM(quantity), 0)
                `),
                'cpp'
            ]
        ],
        include: [
            { 
                association: 'product', 
                attributes: {exclude: ['id_category','id_unit','status','createdAt','updatedAt']}, 
            },
            {    
                association: 'input',
                attributes: [], //para no incluir, pero si usar el where
                where: {
                        [Op.and]: [
                            id_sucursal   ? { id_sucursal   } : {},
                            id_storage    ? { id_storage   } : {},
                            type_pay      ? { type:type_pay } : {},
                            type_registry ? { type_registry } : {},
                            id_provider   ? { id_provider   } : {},
                            status ? { status } : {},
                            { date_voucher: whereDate },
                            referral_sources ? { referral_sources } : {},
                            old_customer ? { old_customer: old_customer == 'SI' } : {},
                            with_pickup   ? { with_pickup: with_pickup == 'SI'} : {},
                        ]
                }, 
                include: [
                    {
                        association: 'provider',
                        where: id_type_provider ? { id_type_provider } : {},
                        attributes: [], 
                        include: [{association: 'type', attributes: []}],
                    },
                ]
            }
        ],
        group: [ 'id_product','product.id']
    };
    return await DetailsInput.findAll(optionsDb);
}

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
