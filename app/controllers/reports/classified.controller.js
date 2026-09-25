const { Op } = require("sequelize");
const { Classified, DetailsClassified,sequelize } = require('../../database/config');
const PdfPrinter = require('pdfmake');
const fonts = require('../../helpers/generator-pdf/fonts');
const styles = require('../../helpers/generator-pdf/styles');
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
const {
    buildHeader,
    buildHr,
    buildSectionTitle,
    buildInfoRowDouble,
    buildDetailTable,
    buildClosingSection,
    VOUCHER_THEME,
} = require('../../helpers/generator-pdf/voucher-template.helper');
const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',hour: "numeric",
minute: "numeric",
second: "numeric", };

moment.locale('es'); 

const generatePdfReports = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2} = req.query;
        const classifieds = await returnDataClassified(req.query);
        let dataPdf = dataPdfReturn(req.userAuth); //PDF 
        let total = 0;
        classifieds.forEach(classified => {
            total += Number(classified.quantity_product);
            const tableData = [
                {text:classified?.cod, fontSize:9}, 
                {text:moment(classified?.date_classified).format('DD/MM/YYYY HH:mm:ss'), fontSize:9}, 
                {text:classified?.type_registry, fontSize:9}, 
                {text:classified?.number_registry, fontSize:9}, 
                {text:classified?.scale.name, fontSize:9}, 
                {text:classified?.comments, fontSize:9}, 
                {text:classified?.product?.name, fontSize:9}, 
                {text:classified?.cost_product, fontSize:9}, 
                {text:classified?.quantity_product, fontSize:9, alignment: 'right'}, 
            ];
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            {colSpan: 8, text:`Cantidad Total:`,fontSize:10 , alignment: 'right'},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text: `${Number(total)}`, bold: true, fontSize:10, alignment: 'right'}
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
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de clasificados' });
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
    { text: 'REPORTE DE CLASIFICADOS TOTALIZADOS', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Reporte generados con los parámetros establecidos', alignment:'center',absolutePosition: {  y: 73 } },
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [60,70,50,55,50,'*','*',50,80],
            body: [
                [
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA CLA.', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO DOC.', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'NRO. DOC.', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'BALANZA',alignment: 'center', fontSize:9,fillColor: '#eeeeee', bold:true}, 
                    {text:'COMENTARIOS', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PRODUCTO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'COSTO', alignment: 'center',fontSize:9,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANTIDAD',alignment: 'right', fontSize:9,fillColor: '#eeeeee', bold:true},
                ]
            ]   ,
            layout: 'lightHorizontalLines'
        }
    }
];

const generateExcelReports = async (req = request, res = response) => {
  try {
    const classifieds = await returnDataClassified(req.query);
    let classified_data = [];
    if (classifieds.length == 0) {
    classified_data.push({
        CÓDIGO: '',
        FECHA_CLASIFICACIÓN: '',
        TIPO_DOC: '',
        NRO_DOC: '',
        BALANZA: '',
        COMENTARIOS: '',
        PRODUCTO: '',
        COSTO: '',
        CANTIDAD: '',
      });
    }
    classifieds.forEach(classified => {
      const tableData = {
        CÓDIGO: classified.cod,
        FECHA_CLASIFICACIÓN: classified.date_classified,
        TIPO_DOC: classified?.type_registry,
        NRO_DOC: classified?.number_registry,
        BALANZA: classified?.scale.name,
        COMENTARIOS: classified?.comments,
        PRODUCTO: classified?.product?.name,
        COSTO: classified?.cost_product,
        CANTIDAD: classified?.quantity_product,
      }
      classified_data.push(tableData);
    });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Clasificados totales`);
    // Agregar encabezados
    const headers = Object.keys(classified_data[0]);
    worksheet.addRow(headers);
    // Agregar datos
    classified_data.forEach(data => {
      const row = [];
      headers.forEach(header => {
        row.push(data[header]);
      });
      worksheet.addRow(row);
    });
    worksheet.getColumn('A').width = 15; 
    worksheet.getColumn('B').width = 20; 
    worksheet.getColumn('C').width = 25; 
    worksheet.getColumn('D').width = 25; 
    worksheet.getColumn('E').width = 20; 
    worksheet.getColumn('F').width = 50; 
    worksheet.getColumn('G').width = 50; 
    worksheet.getColumn('H').width = 15; 
    worksheet.getColumn('I').width = 15; 
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=clasificados-report.xlsx`);
    workbook.xlsx.write(res)
      .then(() => {
        res.end();
      })
      .catch(err => {
        console.error('Error generar Excel:', err);
        res.status(500).json({ error: 'Error al crear excel' });
      })
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      ok: false,
      errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
  });
  };
}

const returnDataClassified = async (params) => {
    const {type_registry,id_product, id_sucursal, id_storage, status, filterBy, date1, date2, orderNew} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"Classified"."date_classified"');
    const orderList = (orderNew && Array.isArray(orderNew) && orderNew.length > 0 && orderNew[0])
        ? [orderNew]
        : [['date_classified', 'DESC']];
    const optionsDb = {
        order: orderList,
        where: {
            [Op.and]: [
                id_sucursal   ? { id_sucursal   } : {},
                id_storage    ? { id_storage   } : {},
                type_registry ? { type_registry } : {},
                id_product    ? { id_product   } : {},
                status        ? { status } : {},
                { date_classified: whereDate }
            ]
        },
        include: [ 
            { association: 'scale', attributes: ['name']},
            { association: 'product',  attributes: [
                [sequelize.literal(`CONCAT("product"."cod",' - ' ,"product"."name")`), 'name'],
              ],
            },
            { association: 'user', attributes: ['full_names','number_document']},
        ]
    };
    return await Classified.findAll(optionsDb);
}

const generatePdfDetailsReports = async (req = request, res = response) => {
    try {
        const {filterBy, date1, date2} = req.query;
        const decimal = await getNumberDecimal();
        const detailsClassified = await returnDataDetailsClassified(req.query);
        let dataPdf = dataDetailsPdfReturn(req.userAuth); //PDF 
        let total = 0;
        detailsClassified.forEach(detail => {
            total += Number(detail.dataValues.suma_quantity);
            const tableData = [
                {text:detail?.product.cod, fontSize:9}, 
                {text:detail?.product.name, fontSize:9}, 
                {text:Number(detail?.cost).toFixed(decimal), fontSize:9, alignment: 'right'},  
                {text:Number(detail?.dataValues.suma_quantity).toFixed(decimal), fontSize:9, alignment: 'right'}, 
            ];
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            {colSpan: 2, text:`TOTAL: ${NumeroALetras(total)}`},
            {text:''},
            {text:''},
            {text: `${Number(total).toFixed(decimal)}`, bold: true, fontSize:10, alignment: 'right'}
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

const dataDetailsPdfReturn = (auth) => [
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
    { text: 'REPORTE DE CLASIFICADOS DETALLADAS', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Reporte generados con los parámetros establecidos', alignment:'center',absolutePosition: {  y: 73 } },
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [60,'*',70,70],
            body: [
                [
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PRODUCTO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'COSTO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANTIDAD', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                ]
            ]   ,
            layout: 'lightHorizontalLines'
        }
    }
];

const generateExcelDetailsReports = async (req = request, res = response) => {
    try {
        const detailsClassified = await returnDataDetailsClassified(req.query)
        let detailsInput_data = [];
        if (detailsClassified.length == 0) {
            detailsInput_data.push({
                CÓDIGO: '',
                PRODUCTO: '',
                COSTO: '',
                CANTIDAD: '',
            });
        }
        detailsClassified.forEach(detail => {
            const tableData = {
                CÓDIGO: detail?.product.cod,
                PRODUCTO: detail?.product.name,
                COSTO: Number(detail?.cost),
                CANTIDAD:Number(detail?.dataValues.suma_quantity),
            }
            detailsInput_data.push(tableData);
        });
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Clasificados detalladas`);
        // Agregar encabezados
        const headers = Object.keys(detailsInput_data[0]);
        worksheet.addRow(headers);
        // Agregar datos
        detailsInput_data.forEach(data => {
            const row = [];
            headers.forEach(header => {
                row.push(data[header]);
            });
            worksheet.addRow(row);
        });
        worksheet.getColumn('A').width = 15; 
        worksheet.getColumn('B').width = 50; 
        worksheet.getColumn('C').width = 20; 
        worksheet.getColumn('D').width = 20; 
        worksheet.getColumn('E').width = 20; 
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=compras-detalle-report.xlsx`);
        workbook.xlsx.write(res)
            .then(() => {
                res.end();
            })
            .catch(err => {
                console.error('Error generar Excel:', err);
                res.status(500).json({ error: 'Error al crear excel' });
            })
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        ok: false,
        errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
    });
    };
}

const returnDataDetailsClassified = async (params) => {
    const {type_registry,id_product, id_sucursal, id_storage, status, filterBy, date1, date2} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"classified"."date_classified"');
    const optionsDb = {
        attributes: [
            'cost',
            [sequelize.fn('SUM', sequelize.col('quantity')), 'suma_quantity'],
        ],
        include: [
            { 
                association: 'product', 
                attributes: {exclude: ['id_category','id_unit','status','createdAt','updatedAt']}, 
            },
            {    
                association: 'classified',
                attributes: [], //para no incluir, pero si usar el where
                where: {
                        [Op.and]: [
                            id_sucursal   ? { id_sucursal   } : {},
                            id_storage    ? { id_storage   } : {},
                            type_registry ? { type_registry } : {},
                            id_product    ? { id_product   } : {},
                            status ? { status } : {},
                            { date_classified: whereDate }
                        ]
                }, 
            }
        ],
        group: [ 'DetailsClassified.id_product','product.id','cost']
    };
    return await DetailsClassified.findAll(optionsDb);
}

const printClassifiedVoucher = async (req = request, res = response) =>{
    try {
        const { id_classified } = req.params;
        const classified = await Classified.findByPk(id_classified,{
            attributes: {exclude: ['id_scale','id_storage','id_product','id_user','id_sucursal']},
            include: [ 
                { association: 'product'},
                { association: 'scale'},
                { association: 'user'},
                { association: 'detailsClassified', include: [
                        {   association: 'product',
                            include: [{ association:'unit'},{ association: 'category'}]
                        }
                    ]
                },
                { association: 'storage'},
                { association: 'sucursal', include:{ association: 'company'}},
            ]
        });
        const decimal = await getNumberDecimal();
        let dataPdf = dataPdfReturnClassifiedVoucher(classified,classified.sucursal,decimal); //PDF 
        const detailTableNode = dataPdf.find(node => node?.table?.widths?.length === 4) || dataPdf[5];
        let quantity_total = 0;
        let units = [];
        classified.detailsClassified.forEach(detail => {
            quantity_total+= Number(detail?.quantity);
            if (!units.includes(detail?.product?.unit.siglas)) {
                units.push(detail?.product?.unit.siglas);
            }
            const tableData = [
                {text:detail?.product?.cod, fontSize:8}, 
                {text:detail?.product?.name, fontSize:8}, 
                {text:detail?.quantity, fontSize:8, alignment: 'center'}, 
                {text:detail?.product?.unit?.siglas, fontSize:8, alignment: 'center'}, 
            ];
            detailTableNode.table.body.push(tableData);
        });
        detailTableNode.table.body.push(
            [
                {text:'',colSpan: 2, border:[false,false,false,false]},
                '',
                {text: quantity_total,  fontSize:8, alignment:'center'},
                {text: units.join(','), fontSize:8, alignment:'center'},
            ],
        );

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
        return res.status(500).json({ ok: false, msg: 'Error al generar el comprobante de clasificación' });
    }
}

const dataPdfReturnClassifiedVoucher = (classified, sucursal, decimal) => [
    buildHeader({
        title: 'NOTA DE CLASIFICACIÓN',
        codePrefix: 'CLASIFICADO',
        codeValue: classified.cod,
        dateLabel: 'Fecha',
        dateValue: moment(classified.date_classified).format('DD/MM/YYYY HH:mm:ss'),
        company: {
            branchName: sucursal.name,
            nit: sucursal.company?.nit,
            phone: sucursal.cellphone,
            email: sucursal.email,
        },
        logoWidth: 55,
    }),
    buildHr([0, 1, 0, 4]),
    buildSectionTitle('DATOS PRODUCTO'),
    buildInfoRowDouble(
        'Producto:', classified?.product?.name ?? '-',
        'Cantidad:', classified?.quantity_product ?? '-'
    ),
    buildSectionTitle('DETALLE'),
    buildDetailTable({
        widths: [55, '*', 50, 80],
        headers: [
            { text: 'CÓDIGO', alignment: 'center' },
            { text: 'DETALLE' },
            { text: 'CANT.', alignment: 'center' },
            { text: 'UND', alignment: 'center' },
        ],
        rows: [],
    }),
    buildClosingSection({
        observations: classified?.comments ? [{ title: 'OBSERVACIONES', text: classified.comments }] : [],
        meta: [
            { label: `P/${classified.type_registry} NRO:`, value: classified.number_registry, width: 70 },
            { label: 'BALANZA:', value: classified.scale?.name || '', width: 52 },
            { label: 'ALMACÉN:', value: classified.storage?.name || '', width: 52 },
        ],
        signatures: [
            { role: 'Recibí conforme', name: '' },
            { role: 'Entregue conforme', name: 'Responsable de almacén' },
        ],
        margin: [0, 8, 0, 0],
        signatureSpace: 35,
    }),
];


module.exports = {
    generatePdfReports,
    generateExcelReports,
    generatePdfDetailsReports,
    generateExcelDetailsReports,
    printClassifiedVoucher,
    dataPdfReturnClassifiedVoucher,
}
