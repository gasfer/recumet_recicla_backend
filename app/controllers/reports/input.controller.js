const { Op } = require("sequelize");
const { Input, DetailsInput,sequelize } = require('../../database/config');
const PdfPrinter = require('pdfmake');
const fonts = require('../../helpers/generator-pdf/fonts');
const styles = require('../../helpers/generator-pdf/styles');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const NumeroALetras = require("../../helpers/numeros-aletras");
const { whereDateForType } = require("../../helpers/where_range");
const imagePath = path.join(__dirname, '../../../uploads/logo.png');
const ExcelJS = require('exceljs');
const { response } = require("express");
const { getNumberDecimal } = require("../../helpers/company");
const {
    buildHeader,
    buildHr,
    buildSectionTitle,
    buildInfoPanel,
    buildDetailTable,
    buildClosingSection,
    VOUCHER_THEME,
} = require('../../helpers/generator-pdf/voucher-template.helper');
const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',hour: "numeric",
minute: "numeric",
second: "numeric", };

moment.locale('es'); 
const createPdfBuffer = async (docDefinition) => {
  return new Promise((resolve, reject) => {
    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    let chunks = [];
    pdfDoc.on("data", chunk => chunks.push(chunk));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", err => reject(err));
    pdfDoc.end();
  });
};

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
        let docDefinition = {
            content: dataPdf,
            pageOrientation: 'landscape',
            footer: function(currentPage, pageCount) { return [
                {
                    text:`Fechas: ${moment(date1,formatDate1).format(formatDate1)} / ${moment(date2,formatDate2).format(formatDate2) != 'Fecha inválida' ? moment(date2,formatDate2).format(formatDate2) :'' }` + ' - Paginas: ' +currentPage.toString() + ' de ' + pageCount,
                    fontSize: 9,alignment: 'center', margin:[10,10,10,10]
                }
            ] },
            styles: styles,
        };
        const printer = new PdfPrinter(fonts);
        let pdfDoc =  printer.createPdfKitDocument(docDefinition);
        let chunks = [];
        pdfDoc.on("data", (chunk) => { chunks.push(chunk);});
        pdfDoc.on("end", () => {
            const result = Buffer.concat(chunks);
            res.setHeader('Content-Type', 'application/pdf;');
            res.setHeader('Content-disposition', `filename=report_compras_${new Date()}.pdf`);
            return res.send(result);
        });
        pdfDoc.end();
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de compras' });
    }
}

const dataPdfReturn = (auth) => [
    {
        image: 'data:image/png;base64,'+ fs.readFileSync(imagePath,'base64'),
        width: 70,
        absolutePosition: { x:25, y: 15 }
    },
    {   text:`Impreso por: ` + moment().format('LLLL'), style: 'fechaDoc',
        absolutePosition: { y: 16 },
    },
    {   text: `${auth.full_names} / ${auth.number_document}`, style: 'fechaDoc',
        absolutePosition: {  y: 27 }
    },
    { text: 'REPORTE DE COMPRAS TOTALIZADOS', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Reporte generados con los parámetros establecidos', alignment:'center',absolutePosition: {  y: 73 } },
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
                row.getCell(9).numFmt = decimal === 3 ? '#,##0.000' : '#,##0.00';
                row.getCell(10).numFmt = decimal === 3 ? '#,##0.000' : '#,##0.00';
            });
            const subtotal = worksheet.addRow(['SUBTOTAL PROVEEDOR', '', '', '', '', '', '', '', providerKg, providerAmount]);
            subtotal.eachCell(cell => { cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF334155' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } }; });
            subtotal.getCell(9).numFmt = decimal === 3 ? '#,##0.000' : '#,##0.00';
            subtotal.getCell(10).numFmt = decimal === 3 ? '#,##0.000' : '#,##0.00';
        }
        const totalRow = worksheet.addRow(['TOTAL GENERAL', '', '', '', '', '', '', '', totalKg, totalAmount]);
        totalRow.eachCell(cell => { cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C956C' } }; });
        totalRow.getCell(9).numFmt = decimal === 3 ? '#,##0.000' : '#,##0.00';
        totalRow.getCell(10).numFmt = decimal === 3 ? '#,##0.000' : '#,##0.00';
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
    const decimalFormat = decimal === 3 ? '#,##0.000' : '#,##0.00';
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
        let docDefinition = {
            content: dataPdf,
            footer: function(currentPage, pageCount) { return [
                {
                    text:`Fechas: ${moment(date1,formatDate1).format(formatDate1)} / ${moment(date2,formatDate2).format(formatDate2) != 'Fecha inválida' ? moment(date2,formatDate2).format(formatDate2) :'' }` + ' - Paginas: ' +currentPage.toString() + ' de ' + pageCount,
                    fontSize: 9,alignment: 'center', margin:[10,10,10,10]
                }
            ] },
            styles: styles,
        };
        const printer = new PdfPrinter(fonts);
        let pdfDoc =  printer.createPdfKitDocument(docDefinition);
        let chunks = [];
        pdfDoc.on("data", (chunk) => { chunks.push(chunk);});
        pdfDoc.on("end", () => {
            const result = Buffer.concat(chunks);
            res.setHeader('Content-Type', 'application/pdf;');
            res.setHeader('Content-disposition', `filename=report_compras_detalle_${new Date()}.pdf`);
            return res.send(result);
        });
        pdfDoc.end();
    } catch (error) {
        console.log(error);
        const pathImage = path.join(__dirname, `../../../uploads/none-img.jpg`);
        return res.sendFile(pathImage);
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
        let docDefinition = {
            content: dataPdf,
            footer: function(currentPage, pageCount) { return [
                {
                    text:`Fechas: ${moment(date1,formatDate1).format(formatDate1)} / ${moment(date2,formatDate2).format(formatDate2) != 'Fecha inválida' ? moment(date2,formatDate2).format(formatDate2) :'' }` + ' - Paginas: ' +currentPage.toString() + ' de ' + pageCount,
                    fontSize: 9,alignment: 'center', margin:[10,10,10,10]
                }
            ] },
            styles: styles,
        };
        const printer = new PdfPrinter(fonts);
        let pdfDoc =  printer.createPdfKitDocument(docDefinition);
        let chunks = [];
        pdfDoc.on("data", (chunk) => { chunks.push(chunk);});
        pdfDoc.on("end", () => {
            const result = Buffer.concat(chunks);
            res.setHeader('Content-Type', 'application/pdf;');
            res.setHeader('Content-disposition', `filename=report_compras_detalle_${new Date()}.pdf`);
            return res.send(result);
        });
        pdfDoc.end();
    } catch (error) {
        console.log(error);
        const pathImage = path.join(__dirname, `../../../uploads/none-img.jpg`);
        return res.sendFile(pathImage);
    }
}

const dataDetailsPdfReturn = (auth,date1,date2) => [
    {
        image: 'data:image/png;base64,'+ fs.readFileSync(imagePath,'base64'),
        width: 70,
        absolutePosition: { x:25, y: 15 }
    },
    {   text:`Fecha Impreso: ` + moment().format('LLLL'), style: 'fechaDoc',
        absolutePosition: { y: 16 },
    },
    {   text:`Impreso por:` + `${auth.number_document} - ${auth.full_names}`, style: 'fechaDoc',
        absolutePosition: {  y: 27 }
    },
    { text: 'COMPRAS TOTALIZADAS ', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Fecha Reporte:' +  date1 + ' ' + date2, alignment:'center',absolutePosition: {  y: 73 } },
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
    {
        image: 'data:image/png;base64,'+ fs.readFileSync(imagePath,'base64'),
        width: 70,
        absolutePosition: { x:25, y: 15 }
    },
    {   text:`Fecha Impreso: ` + moment().format('LLLL'), style: 'fechaDoc',
        absolutePosition: { y: 16 },
    },
    {   text:`Impreso por:` + `${auth.number_document} - ${auth.full_names}`, style: 'fechaDoc',
        absolutePosition: {  y: 27 }
    },
    { text: 'COMPRAS DETALLE COSTO PROMEDIO ', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Fecha Reporte:' +  date1 + ' ' + date2, alignment:'center',absolutePosition: {  y: 73 } },
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
        const decimalFormat = decimal === 3 ? '#,##0.000' : '#,##0.00';
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
        const { format } = req.query;
        let dataPdf;
        let docDefinition;

        if (format === 'rollo') {
            dataPdf = dataPdfReturnInputVoucherRollo(input, input.sucursal, decimal);
            docDefinition = {
                pageSize: { width: 226.77, height: 'auto' },
                pageMargins: [6, 10, 6, 10],
                content: dataPdf,
                styles: styles,
            };
        } else if (format === 'media') {
            dataPdf = dataPdfReturnInputVoucherMedia(input, input.sucursal, decimal);
            docDefinition = {
                pageSize: 'A5',
                pageMargins: [15, 15, 15, 15],
                content: dataPdf,
                styles: styles,
            };
        } else {
            dataPdf = dataPdfReturnInputVoucher(input,input.sucursal,decimal); //PDF 
            const detailTableNode = dataPdf.find(node => node?.table?.widths?.length === 6) || dataPdf[4];
            let quantity_total = 0;
            let units = [];
            input.detailsInput.forEach(detail => {
                quantity_total+= Number(detail?.quantity);
                if (!units.includes(detail?.product?.unit.siglas)) {
                    units.push(detail?.product?.unit.siglas);
                }
                const tableData = [
                    {text:detail?.product?.cod, fontSize:8}, 
                    {text:detail?.product?.name, fontSize:8}, 
                    {text:detail?.quantity, fontSize:8, alignment: 'center'}, 
                    {text:detail?.product?.unit?.siglas, fontSize:8, alignment: 'center'}, 
                    {text:Number(detail?.cost).toFixed(decimal), fontSize:8, alignment: 'right'},  
                    {text:Number(detail?.total).toFixed(decimal), fontSize:8, alignment: 'right'}, 
                ];
                detailTableNode.table.body.push(tableData);
            });
            detailTableNode.table.body.push(
                [
                    {text:'',colSpan: 2, border:[true,false,false,false]},
                    '',
                    {
                        text: `${Number(quantity_total).toLocaleString('es-BO', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}`,
                        fontSize: 8,
                        alignment: 'center',
                        bold: true,
                        fillColor: '#dde3ea'
                    },
                    {text: units.join(','), fontSize:8, alignment:'center'},
                    {   border:[true,false,true,true],
                        text: `SUB TOTAL: ${Number(input.sumas).toLocaleString('es-BO', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}`, colSpan: 2,fontSize:8,
                        fillColor: '#dde3ea',alignment:'right', 
                        bold:true,
                    },
                ],
                [
                    {text:'',colSpan: 4, border:[true,false,false,false]},
                    '',
                    '',
                    '',
                    {   border:[true,false,true,true],
                        text: `DESCUENTO: ${Number(input.discount).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                        fillColor: '#dde3ea',alignment:'right', 
                        bold:true,
                    },
                ],
                [
                    {
                        text:'SON: ' + NumeroALetras(Number(input.total).toFixed(decimal)),
                        style: 'SonBs', fontSize:8, colSpan: 4, border:[true,false,true,true],
                    },
                    '',
                    '',
                    '',
                    {   border:[true,false,true,true],
                        text: `TOTAL: ${Number(input.total).toLocaleString('es-BO', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}`, colSpan: 2,fontSize:8,
                        fillColor: '#dde3ea',alignment:'right', 
                        bold:true,
                    },
                ]
            );

            if (input.payment_type != 'EFECTIVO') {
                const accountsPayableNode = dataPdf.find(node => node && node.table && node.table.widths && node.table.widths.length === 5);
                if (accountsPayableNode && input.accounts_payable) {
                    input.accounts_payable.forEach(account => {
                        const tableData = [
                            {text:account?.cod, fontSize:8}, 
                            {text:moment(account?.date_credit).format('DD/MM/YYYY HH:mm:ss'), fontSize:8}, 
                            {text:account?.description, fontSize:8}, 
                            {text:Number(account?.total).toFixed(decimal), fontSize:8}, 
                            {text:Number(account?.monto_restante).toFixed(decimal), fontSize:8}, 
                        ];
                        accountsPayableNode.table.body.push(tableData);
                    });
                }
            }
            if (input.status == 'ANULADO') {
                dataPdf.push(
                    {
                        text: 'ANULADO',
                        fontSize: 40,
                        bold: true,
                        alignment: 'center',
                        color: 'red',
                        opacity: 0.3,
                        margin: [0, 20, 0, 0]
                    }
                );  
            }

            docDefinition = {
                content: dataPdf,
                styles: styles,
            };
        }
        const printer = new PdfPrinter(fonts);
        let pdfDoc =  printer.createPdfKitDocument(docDefinition);
        let chunks = [];
        pdfDoc.on("data", (chunk) => { chunks.push(chunk);});
        pdfDoc.on("end", () => {
            const result = Buffer.concat(chunks);
            res.setHeader('Content-Type', 'application/pdf;');
            res.setHeader('Content-disposition', `filename=report_compras_${new Date()}.pdf`);
            return res.send(result);
        });
        pdfDoc.end();
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el comprobante de compra' });
    }
}

const dataPdfReturnInputVoucher = (input, sucursal, decimal) => [
    buildHeader({
        title: 'NOTA DE COMPRA',
        codePrefix: 'COMPRA',
        codeValue: input.cod,
        dateLabel: 'Fecha',
        dateValue: moment(input.date_voucher).format('DD/MM/YYYY HH:mm:ss'),
        company: {
            branchName: sucursal.name,
            nit: sucursal.company?.nit,
            phone: sucursal.cellphone,
            email: sucursal.email,
        },
        logoWidth: 55,
    }),
    buildHr([0, 1, 0, 4]),
    buildInfoPanel([
        {
            title: 'DATOS PROVEEDOR',
            rows: [
                { label: 'Nombre:', value: input?.provider?.full_names || '-', labelWidth: 50 },
                { label: 'Nro. Nit:', value: input?.provider?.number_document || '-', labelWidth: 50 },
                { label: 'Teléfono:', value: input?.provider?.cellphone || '-', labelWidth: 50 },
                { label: 'Dirección:', value: input?.provider?.direction || '-', labelWidth: 50 },
            ]
        }
    ]),
    buildSectionTitle('DETALLE DE PRODUCTOS'),
    buildDetailTable({
        widths: [55, '*', 45, 35, 55, 60],
        headers: [
            { text: 'CÓDIGO', alignment: 'center' },
            { text: 'DETALLE' },
            { text: 'CANT.', alignment: 'center' },
            { text: 'UND', alignment: 'center' },
            { text: 'P.U.', alignment: 'center' },
            { text: 'IMPORTE', alignment: 'center' },
        ],
        rows: [],
    }),
    buildClosingSection({
        observations: input?.comments ? [{ title: 'OBSERVACIONES', text: input.comments }] : [],
        meta: [
            { label: `P/${input.type_registry} NRO:`, value: input.registry_number, width: 65 },
            { label: 'BALANZA:', value: input.scale?.name || '', width: 55 },
            { label: 'TIPO COMPRA:', value: input.type === 'CONTADO' ? 'AL CONTADO' : 'A CREDITO', width: 85 },
        ],
        signatures: [
            { role: 'Recibí conforme', name: `PROVEEDOR: ${input?.provider?.full_names || ''}` },
            { role: 'Entregue conforme', name: 'RESPONSABLE CAJA' },
        ],
        margin: [0, 8, 0, 0],
        signatureSpace: 35,
    }),
];


const dataPdfReturnInputVoucherRollo = (input, sucursal, decimal) => {
    let body = [
        [
            { text: 'CÓDIGO / PRODUCTO', fontSize: 7, bold: true, fillColor: '#eeeeee' },
            { text: 'CANT.', fontSize: 7, bold: true, alignment: 'right', fillColor: '#eeeeee' }
        ]
    ];
    let quantity_total = 0;
    input.detailsInput.forEach(detail => {
        quantity_total += Number(detail.quantity);
        body.push([
            { text: `${detail.product.cod} - ${detail.product.name}`, fontSize: 7 },
            { text: `${detail.quantity} ${detail.product.unit.siglas}`, fontSize: 7, alignment: 'right' }
        ]);
    });
    
    body.push(
        [
            { text: 'TOTAL CANTIDAD:', bold: true, fontSize: 7, alignment: 'right' },
            { text: Number(quantity_total).toFixed(decimal), fontSize: 7, alignment: 'right' }
        ]
    );

    return [
        { text: sucursal.name.toUpperCase(), bold: true, fontSize: 9, alignment: 'center', margin: [0, 0, 0, 2] },
        { text: `NIT: ${sucursal.company.nit}`, fontSize: 7, alignment: 'center' },
        { text: `TELF: ${sucursal.cellphone} - EMAIL: ${sucursal.email}`, fontSize: 6, alignment: 'center', margin: [0, 0, 0, 5] },
        { text: '----------------------------------------', fontSize: 7, alignment: 'center' },
        { text: 'COMPROBANTE DE PESAJE', bold: true, fontSize: 9, alignment: 'center', margin: [0, 2, 0, 2] },
        { text: `COMPRA: ${input.cod}`, bold: true, fontSize: 8, alignment: 'center' },
        { text: `FECHA: ${new Date(input.date_voucher).toLocaleString('es-ES')}`, fontSize: 7, alignment: 'center', margin: [0, 0, 0, 5] },
        { text: '----------------------------------------', fontSize: 7, alignment: 'center' },
        { text: 'PROVEEDOR:', bold: true, fontSize: 7, margin: [0, 2, 0, 2] },
        { text: `Nombre: ${input.provider?.full_names || '-'}`, fontSize: 7 },
        { text: `NIT/CI: ${input.provider?.number_document || '-'}`, fontSize: 7 },
        { text: `Balanza: ${input.scale.name}`, fontSize: 7 },
        { text: `P/${input.type_registry} NRO: ${input.registry_number}`, fontSize: 7, margin: [0, 0, 0, 5] },
        { text: '----------------------------------------', fontSize: 7, alignment: 'center' },
        {
            table: {
                widths: ['*', 70],
                body: body
            },
            layout: 'noBorders',
            margin: [0, 5, 0, 5]
        },
        input.comments ? { text: `OBSERVACIONES: ${input.comments}`, fontSize: 7, margin: [0, 2, 0, 5] } : {}
    ];
};

const dataPdfReturnInputVoucherMedia = (input, sucursal, decimal) => {
    let quantity_total = 0;
    let units = [];
    let tableBody = [
        [
            { text: 'CÓDIGO', fontSize: 7, fillColor: '#eeeeee', bold: true },
            { text: 'DETALLE', fontSize: 7, fillColor: '#eeeeee', bold: true },
            { text: 'CANT.', alignment: 'center', fontSize: 7, fillColor: '#eeeeee', bold: true },
            { text: 'UND', alignment: 'center', fontSize: 7, fillColor: '#eeeeee', bold: true },
            { text: 'P.U.', alignment: 'center', fontSize: 7, fillColor: '#eeeeee', bold: true },
            { text: 'IMPORTE', alignment: 'center', fontSize: 7, fillColor: '#eeeeee', bold: true },
        ]
    ];
    
    input.detailsInput.forEach(detail => {
        quantity_total += Number(detail.quantity);
        if (!units.includes(detail.product?.unit.siglas)) {
            units.push(detail.product?.unit.siglas);
        }
        tableBody.push([
            { text: detail.product?.cod, fontSize: 7 },
            { text: detail.product?.name, fontSize: 7 },
            { text: detail.quantity, fontSize: 7, alignment: 'center' },
            { text: detail.product?.unit?.siglas, fontSize: 7, alignment: 'center' },
            { text: Number(detail.cost).toFixed(decimal), fontSize: 7, alignment: 'right' },
            { text: Number(detail.total).toFixed(decimal), fontSize: 7, alignment: 'right' },
        ]);
    });

    tableBody.push(
        [
            { text: '', colSpan: 2, border: [true, false, false, false] },
            '',
            { text: quantity_total, fontSize: 7, alignment: 'center' },
            { text: units.join(','), fontSize: 7, alignment: 'center' },
            {
                border: [true, false, true, true],
                text: `SUB TOTAL: ${Number(input.sumas).toFixed(decimal)}`, colSpan: 2, fontSize: 7,
                fillColor: '#eeeeee', alignment: 'right', bold: true,
            },
        ],
        [
            { text: '', colSpan: 4, border: [true, false, false, false] },
            '', '', '',
            {
                border: [true, false, true, true],
                text: `DESCUENTO: ${Number(input.discount).toFixed(decimal)}`, colSpan: 2, fontSize: 7,
                fillColor: '#eeeeee', alignment: 'right', bold: true,
            },
        ],
        [
            {
                text: 'SON: ' + NumeroALetras(Number(input.total).toFixed(decimal)),
                fontSize: 7, colSpan: 4, border: [true, false, true, true],
            },
            '', '', '',
            {
                border: [true, false, true, true],
                text: `TOTAL: ${Number(input.total).toFixed(decimal)}`, colSpan: 2, fontSize: 7,
                fillColor: '#eeeeee', alignment: 'right', bold: true,
            },
        ]
    );

    if (input.type === 'CREDITO') {
        tableBody.push(
            [
                { text: '', colSpan: 4, border: [true, false, false, false] },
                '', '', '',
                { text: 'A CREDITO', colSpan: 2, fontSize: 7, alignment: 'center' }
            ],
            [
                { text: '', colSpan: 4, border: [true, false, false, false] },
                '', '', '',
                {
                    border: [true, false, true, true],
                    text: `A CUENTA: ${Number(input.accounts_payable.monto_abonado).toFixed(decimal)}`, colSpan: 2, fontSize: 7,
                    fillColor: '#eeeeee', alignment: 'right', bold: true,
                },
            ],
            [
                {
                    text: 'SON: ' + NumeroALetras(Number(input.accounts_payable.monto_restante).toFixed(decimal)),
                    fontSize: 7, colSpan: 4, border: [true, false, true, true],
                },
                '', '', '',
                {
                    border: [true, false, true, true],
                    text: `SALDO: ${Number(input.accounts_payable.monto_restante).toFixed(decimal)}`, colSpan: 2, fontSize: 7,
                    fillColor: '#eeeeee', alignment: 'right', bold: true,
                },
            ]
        );
    }

    return [
        {
            columns: [
                {
                    image: 'data:image/png;base64,' + fs.readFileSync(imagePath, 'base64'),
                    width: 50,
                },
                {
                    text: [
                        { text: `${sucursal.name}\n`, bold: true, fontSize: 8 },
                        { text: `NIT: ${sucursal.company.nit}\n`, fontSize: 7 },
                        { text: `TELF: ${sucursal.cellphone}\n`, fontSize: 7 },
                        { text: `${sucursal.email}`, fontSize: 7 }
                    ],
                    margin: [10, 0, 0, 0]
                },
                {
                    text: [
                        { text: 'NOTA DE COMPRA\n', bold: true, fontSize: 10 },
                        { text: `NRO: ${input.cod}\n`, bold: true, fontSize: 9, color: 'red' },
                        { text: `FECHA: ${new Date(input.date_voucher).toLocaleDateString('es-ES')}`, fontSize: 8 }
                    ],
                    alignment: 'right'
                }
            ]
        },
        { text: '\nDATOS PROVEEDOR:', bold: true, fontSize: 8, margin: [0, 5, 0, 2] },
        {
            table: {
                widths: [45, '*', 50, '*'],
                body: [
                    [
                        { text: 'Nombre:', bold: true, fontSize: 7, border: [true, true, false, true] },
                        { text: input?.provider?.full_names || '-', fontSize: 7, border: [false, true, true, true] },
                        { text: 'NIT/CI:', bold: true, fontSize: 7, border: [true, true, false, true] },
                        { text: input?.provider?.number_document || '-', fontSize: 7, border: [false, true, true, true] },
                    ],
                    [
                        { text: 'Teléfono:', bold: true, fontSize: 7, border: [true, false, false, true] },
                        { text: input?.provider?.cellphone || '-', fontSize: 7, border: [false, false, true, true] },
                        { text: 'Dirección:', bold: true, fontSize: 7, border: [true, false, false, true] },
                        { text: input?.provider?.direction || '-', fontSize: 7, border: [false, false, true, true] },
                    ]
                ]
            }
        },
        { text: '\nDETALLE:', bold: true, fontSize: 8, margin: [0, 5, 0, 2] },
        {
            table: {
                widths: [50, '*', 40, 30, 40, 45],
                body: tableBody
            },
            margin: [0, 0, 0, 5]
        },
        {
            columns: [
                { text: `P/${input.type_registry} NRO: ${input.registry_number}`, fontSize: 7 },
                { text: `BALANZA: ${input.scale.name}`, fontSize: 7 },
                { text: `TIPO COMPRA: ${input.type === 'CONTADO' ? 'AL CONTADO' : 'A CREDITO'}`, fontSize: 7 },
            ],
            margin: [0, 5, 0, 5]
        },
        input.comments ? { text: `OBSERVACIONES: ${input.comments}`, fontSize: 7, margin: [0, 2, 0, 5] } : {},
        {
            columns: [
                { text: '\n\n\n_________________________________\nRecibí conforme\nProv: ' + (input.provider?.full_names || '').substring(0, 20), fontSize: 7, alignment: 'center' },
                { text: '\n\n\n_________________________________\nEntregue conforme\nResponsable Caja', fontSize: 7, alignment: 'center' }
            ],
            margin: [0, 10, 0, 0]
        }
    ];
};

module.exports = {
    generatePdfReports,
    generateExcelReports,
    generatePurchaseReportExcel,
    generatePdfDetailsReports,
    generateExcelDetailsReports,
    printInputVoucher,
    generatePdfDetailsCPPReports,
    dataPdfReturnInputVoucher,
}
