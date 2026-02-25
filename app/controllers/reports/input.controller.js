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
        const pathImage = path.join(__dirname, `../../../uploads/none-img.jpg`);
        return res.sendFile(pathImage);
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
        old_customer, with_pickup
    } = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"Input"."date_voucher"');
    const optionsDb = {
        order: [orderNew],
        where: {
            [Op.and]: [
                id_sucursal   ? { id_sucursal   } : {},
                id_storage    ? { id_storage   } : {},
                type_pay      ? { type:type_pay } : {},
                type_registry ? { type_registry } : {},
                id_provider   ? { id_provider   } : {},
                { status },
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
            { association: 'detailsInput', attributes: {include: ['quantity']} , include: [{ association: 'product', attributes: ['cod','name'], include: [{association: 'unit', attributes: ['name','siglas']}] } ]},
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
        let dataPdf = dataPdfReturnInputVoucher(input,input.sucursal,decimal); //PDF 
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
            dataPdf[15].table.body.push(tableData);
        });
        dataPdf[15].table.body.push(
            [
                {text:'',colSpan: 2, border:[true,false,false,false]},
                '',
                {text: quantity_total,  fontSize:8, alignment:'center'},
                {text: units.join(','), fontSize:8, alignment:'center'},
                {   border:[true,false,true,true],
                    text: `SUB TOTAL: ${Number(input.sumas).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                    fillColor: '#eeeeee',alignment:'right', 
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
                    fillColor: '#eeeeee',alignment:'right', 
                    bold:true,
                },
            ],
            [
                {
                    text:'SON: ' + NumeroALetras(Number(input.total).toFixed(decimal)),
                    style: 'sonBs', fontSize:8, colSpan: 4, border:[true,false,true,true],
                },
                '',
                '',
                '',
                {   border:[true,false,true,true],
                    text: `TOTAL: ${Number(input.total).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                    fillColor: '#eeeeee',alignment:'right', 
                    bold:true,
                },
            ]
        );
        if(input.type === 'CREDITO') {
            dataPdf[15].table.body.push(
                [
                    {text:'',colSpan: 4, border:[true,false,false,false]},
                    '',
                    '',
                    '',
                    { text: 'A CREDITO',colSpan: 2 , fontSize:8,alignment:'center' }
                ],
                [
                    {text:'',colSpan: 4, border:[true,false,false,false]},
                    '',
                    '',
                    '',
                    {   border:[true,false,true,true],
                        text: `A CUENTA: ${Number(input.accounts_payable.monto_abonado).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                        fillColor: '#eeeeee',alignment:'right', 
                        bold:true,
                    },
                ],
                [
                    {
                        text:'SON: ' + NumeroALetras(Number(input.accounts_payable.monto_restante).toFixed(decimal)),
                        style: 'sonBs', fontSize:8, colSpan: 4, border:[true,false,true,true],
                    },
                    '',
                    '',
                    '',
                    {   border:[true,false,true,true],
                        text: `SALDO: ${Number(input.accounts_payable.monto_restante).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                        fillColor: '#eeeeee',alignment:'right', 
                        bold:true,
                    },
                ]
            );  
        }
        let docDefinition = {
            content: dataPdf,
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
        const pathImage = path.join(__dirname, `../../../uploads/none-img.jpg`);
        return res.sendFile(pathImage);
    }
}

const dataPdfReturnInputVoucher = (input,sucursal,decimal) => [
    {
        image: 'data:image/png;base64,'+ fs.readFileSync(imagePath,'base64'),
        width: 60,
        absolutePosition: { x:30, y: 15 }
    },
    {   text: sucursal.name, style: 'text',
        absolutePosition: { x:97, y: 25 }
    },
    {   text: 'NIT:', bold:true, style: 'text',
        absolutePosition: { x:97, y: 35 }
    },
    {   text: `${sucursal.company.nit}`, style: 'text',
        absolutePosition: { x:120, y: 35 }
    },
    {   text: 'TELÉFONO:',bold:true, style: 'text',
        absolutePosition: { x:97, y: 45 }
    },
    {   text: `${sucursal.cellphone}`, style: 'text',
        absolutePosition: { x:155, y: 45 }
    },
    {   text: 'EMAIL:', bold:true, style: 'text',
        absolutePosition: { x:97, y: 55 }
    },
    {   text: `${sucursal.email}`, style: 'text',
        absolutePosition: { x:133, y: 55 }
    },
    { text: 'COMPRA: ' + input.cod, style: 'fechaDoc',
      absolutePosition: {  y: 30 }
    },
    { text: new Date(input.date_voucher).toLocaleDateString('es-ES', options),  style: 'fechaDoc', absolutePosition: {  y: 40 }},
    { text: 'NOTA DE COMPRA', style: 'title',bold:true , fontSize:12},
    { text: 'DATOS PROVEEDOR:', style: 'datos_person', bold:true ,fontSize:10 },
    {
        columns: [
            { text: `Nombre:`, bold:true ,style: 'text',width: 45, },
            { text: `${input?.provider?.full_names ?? '-'}`, style: 'text',  },
            { text: `Nro. Nit:`, bold:true ,style: 'text',width: 50, },
            { text: `${input?.provider?.number_document ?? '-'}`, style: 'text',  },
        ]
    },
    {
        margin: [0,3,0,0],
        columns: [
            { text: `Teléfono:`, bold:true ,style: 'text',width: 45, },
            { text: `${input?.provider?.cellphone??'-'}`, style: 'text',  },
            { text: `Dirección:`, bold:true, style: 'text',width: 50,  },
            { text: `${input?.provider?.direction??'-'}`,  style: 'text',  },
        ]
    },
    { text: 'DETALLE:', style: 'datos_person',bold:true ,fontSize:10 },
    {
        style: 'tableExample',
        table: {
            widths: [55, '*', 50, 50,50,50],
            body: [
                [
                    {text:'CÓDIGO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'DETALLE', fontSize:8,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANT.',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true},
                    {text:'UND',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true},
                    {text:'P.U.',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true}, 
                    {text:'IMPORTE',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true},
                ]
            ]
        }
    },
    input?.comments ? {   
        margin: [0,3,0,0],
        columns: [
            { text: 'OBSERVACIONES:', bold:true ,style: 'text',width: 90, },
            { text: `${input?.comments ?? ''}`, style: 'text',fontSize:8  },
        ]
    }: {},
    {
        margin: [0,3,0,0],
        columns: [
            { text: `P/${input.type_registry} NRO:`, bold:true ,style: 'text',width: 65, },
            { text: `${input.registry_number}`, style: 'text',  },
            { text: `BALANZA:`, bold:true, style: 'text',width: 58,  },
            { text: `${input.scale.name}`,  style: 'text',  },
            { text: `TIPO DE COMPRA:`, bold:true, style: 'text',width: 100,  },
            { text: `${input.type === 'CONTADO' ? 'AL CONTADO': 'A CREDITO'}`,  style: 'text',  },
        ]
    },
    {
        margin: [0,40,0,0],
        columns: [
            { text: `-----------------------------------------`, bold:true, style: 'text', alignment: 'center' },
            { text: `-----------------------------------------`, bold:true, style: 'text',alignment: 'center' },
        ]
    },
    {
        margin: [0,-5,0,0],
        columns: [
            { text: `Recibí conforme`, bold:true ,style: 'text', alignment: 'center' },
            { text: `Entregue conforme`, bold:true,style: 'text',alignment: 'center' },
        ]
    },
      {
        margin: [0,-2,0,0],
        columns: [
            { text: `PROVEEDOR: ${input?.provider?.full_names}`, style: 'text',alignment: 'center' },
            { text: `RESPONSABLE CAJA`,style: 'text',alignment: 'center' },
        ]
    },
  /*  {
        margin: [0,-2,0,0],
        columns: [
            { text: `Responsable de almacén` , style: 'text',alignment: 'center' },
            { text: `Proveedor`,style: 'text',alignment: 'center' },
        ]
    },*/
];

module.exports = {
    generatePdfReports,
    generateExcelReports,
    generatePdfDetailsReports,
    generateExcelDetailsReports,
    printInputVoucher,
    generatePdfDetailsCPPReports
}