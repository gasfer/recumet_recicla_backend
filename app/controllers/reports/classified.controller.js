const { buildOperationVoucher } = require('../../helpers/generator-pdf/operation-voucher.document');
const { sendReportPdf } = require('../../services/pdf/report-pdf.service');
const { tabularReport } = require('../../helpers/generator-pdf/tabular-report.adapter');
const { Op } = require("sequelize");
const { Classified, DetailsClassified,sequelize } = require('../../database/config');
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
const { buildStandardReportHeader } = require('../../helpers/generator-pdf/voucher-template.helper');
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
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE CLASIFICADOS TOTALIZADOS', paper: 'A4', orientation: 'landscape',
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'classified-generatePdfReports.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de clasificados' });
    }
}

const dataPdfReturn = (auth) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE CLASIFICADOS TOTALIZADOS', auth, details: 'Reporte generado con los parámetros establecidos' }),
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
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE CLASIFICADOS DETALLADOS', paper: 'A4', orientation: 'landscape',
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'classified-generatePdfDetailsReports.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'No se pudo generar el PDF. Intente nuevamente.' });
    }
}

const dataDetailsPdfReturn = (auth) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE CLASIFICADOS DETALLADAS', auth, details: 'Reporte generado con los parámetros establecidos' }),
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
        const document = buildOperationVoucher(classified, { kind: 'classified', decimal, format: req.query.format });
        await sendReportPdf(res, document, 'boleta-clasificado-' + id_classified + '.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el comprobante de clasificación' });
    }
}


module.exports = {
    generatePdfReports,
    generateExcelReports,
    generatePdfDetailsReports,
    generateExcelDetailsReports,
    printClassifiedVoucher,

}
