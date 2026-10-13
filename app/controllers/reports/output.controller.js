const { buildOperationVoucher } = require('../../helpers/generator-pdf/operation-voucher.document');
const { sendReportPdf } = require('../../services/pdf/report-pdf.service');
const { tabularReport } = require('../../helpers/generator-pdf/tabular-report.adapter');
const { Op } = require("sequelize");
const { Output, DetailsOutput, sequelize } = require('../../database/config');
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
        const decimal = await getNumberDecimal();
        const outputs = await returnDataOutput(req.query);
        let dataPdf = dataPdfReturn(req.userAuth); //PDF 
        let total = 0;
        let total_quantity = 0;
        outputs.forEach(output => {
            total += Number(output.total);
            total_quantity += Number(output.total_quantity);
            const tableData = [
                {text:output?.cod, fontSize:9}, 
                {text:moment(output?.date_output).format('DD/MM/YYYY HH:mm:ss'), fontSize:9}, 
                {text:output?.type_registry, fontSize:9}, 
                {text:output?.number_registry, fontSize:9}, 
                {text:output?.client?.full_names, fontSize:8}, 
                {
                    text: output.detailsOutput
                        .map(detail => {
                            const productName = detail.product.name;
                            const quantity = detail.quantity;
                            const unit = detail.product.unit.siglas;
                            return `${productName} [${quantity} ${unit}]`;
                        })
                        .join(', '), 
                    fontSize: 9,
                }, 
                {text:output?.comments, fontSize:9}, 
                {text:output?.type_output, fontSize:9}, 
                {text:Number(output?.total_quantity).toFixed(decimal), fontSize:9, alignment: 'right'},  
                {text:Number(output.total).toFixed(decimal), fontSize:9, alignment: 'right'},
            ];
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            {colSpan: 8, text:`TOTAL: ${NumeroALetras(total)}`,fontSize:10,},
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
            title: 'REPORTE DE VENTAS', paper: 'A4', orientation: 'landscape',
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'output-generatePdfReports.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de ventas' });
    }
}

const dataPdfReturn = (auth) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE VENTAS TOTALIZADOS', auth, details: 'Reporte generado con los parámetros establecidos' }),
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [60,40,45,55,'*','*','*',45,60,60],
            body: [
                [
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO DOC.', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'NRO. DOC.', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CLIENTE', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'DETALLE', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'COMENTARIOS', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO', fontSize:9,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANT. KG',alignment: 'center', fontSize:9,fillColor: '#eeeeee', bold:true}, 
                    {text:'TOTAL',alignment: 'center', fontSize:9,fillColor: '#eeeeee', bold:true}, 
                ]
            ]   ,
            layout: 'lightHorizontalLines'
        }
    }
];

const generateExcelReports = async (req = request, res = response) => {
  try {
    const outputs = await returnDataOutput(req.query);
    const decimal = await getNumberDecimal();
    let output_data = [];
    if (outputs.length == 0) {
      output_data.push({
        CÓDIGO: '',
        FECHA_VENTA: '',
        TIPO_DOCUMENTO: '',
        NRO_DOCUMENTO: '',
        CLIENTE: '',
        DETALLE: '',
        COMENTARIOS: '',
        TIPO: '',
        TOTAL_KG: '',
        TOTAL: '',
      });
    }
    let total = 0;
    let total_quantity = 0;
    outputs.forEach(output => {
      total +=Number(output.total);
      total_quantity +=Number(output.total_quantity);
      const tableData = {
        CÓDIGO: output.cod,
        FECHA_VENTA: moment(output?.date_output).format('DD/MM/YYYY HH:mm:ss'),
        TIPO_DOCUMENTO: output.type_registry,
        NRO_DOCUMENTO: output.number_registry,
        CLIENTE: output?.client?.full_names ?? '',
        DETALLE: output.detailsOutput
            .map(detail => {
                const productName = detail.product.name;
                const quantity = detail.quantity;
                const unit = detail.product.unit.siglas;
                return `${productName} [${quantity} ${unit}]`;
            })
            .join(', \n '), 
        COMENTARIOS: output.comments,
        TIPO: output.type_output,
        TOTAL_KG: Number(output.total_quantity).toFixed(decimal),
        TOTAL: Number(output.total).toFixed(decimal),
      }
      output_data.push(tableData);
    });
    output_data.push({
        CÓDIGO: '',
        FECHA_VENTA: '',
        TIPO_DOCUMENTO: '',
        NRO_DOCUMENTO: '',
        CLIENTE: '',
        DETALLE: '',
        COMENTARIOS: '',
        TIPO: '',
        TOTAL_KG:  Number(total_quantity).toFixed(decimal),
        TOTAL: Number(total).toFixed(decimal),
      });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Ventas totales`);
    // Agregar encabezados
    const headers = Object.keys(output_data[0]);
    worksheet.addRow(headers);
    // Agregar datos
    output_data.forEach(data => {
      const row = [];
      headers.forEach(header => {
        row.push(data[header]);
      });
      worksheet.addRow(row);
    });
    worksheet.getColumn('A').width = 15; 
    worksheet.getColumn('B').width = 20; 
    worksheet.getColumn('C').width = 25; 
    worksheet.getColumn('D').width = 20; 
    worksheet.getColumn('E').width = 20; 
    worksheet.getColumn('F').width = 100; 
    worksheet.getColumn('F').alignment = { wrapText: true };
    worksheet.getColumn('G').width = 50; 
    worksheet.getColumn('H').width = 20; 
    worksheet.getColumn('I').width = 15; 
    worksheet.getColumn('J').width = 15; 
    worksheet.getColumn('K').width = 15; 
    worksheet.getColumn('L').width = 15; 
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=ventas-report.xlsx`);
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

const returnDataOutput = async (params) => {
    const {type_pay, type_registry, id_client,id_sucursal,id_storage, status, filterBy, date1, date2,orderNew} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"Output"."date_output"');
    const orderList = (orderNew && Array.isArray(orderNew) && orderNew.length > 0 && orderNew[0])
        ? [orderNew]
        : [['date_output', 'DESC']];
    const optionsDb = {
        order: orderList,
        where: {
            [Op.and]: [
                id_sucursal   ? { id_sucursal   } : {},
                id_storage    ? { id_storage  } : {},
                type_pay      ? { type_output:type_pay } : {},
                type_registry ? { type_registry } : {},
                id_client   ? { id_client   } : {},
                status        ? { status } : {},
                { date_output: whereDate }
            ]
        },
        include: [ 
            { association: 'client' },
            { association: 'sucursal',attributes: ['name'] },
            { association: 'storage',attributes: ['name'] },
            { association: 'scale', attributes: ['name']},
            { association: 'user', attributes: ['full_names','number_document']},
            { association: 'bank'},
            { 
                association: 'detailsOutput', 
                attributes: ['quantity'],
                include: [
                    { 
                        association: 'product', 
                        attributes: ['cod', 'name'],
                        include: [
                            {
                                association: 'unit', 
                                attributes: ['name', 'siglas']
                            }
                        ]
                    },
                    
                ]
            }
        ]
    };
    const outputs = await Output.findAll(optionsDb);
    for (const output of outputs) {
        output.total_quantity = output.detailsOutput.reduce((acc, item) => acc + Number(item.quantity), 0);
    }
    return outputs;
}

const generatePdfDetailsReports = async (req = request, res = response) => {
    try {
        const {filterBy, date1, date2} = req.query;
        const decimal = await getNumberDecimal();
        const detailsOutput = await returnDataDetailsOutput(req.query);
        let dataPdf = dataDetailsPdfReturn(req.userAuth); //PDF 
        let total = 0;
        detailsOutput.forEach(detail => {
            total += Number(detail.dataValues.suma_total);
            const tableData = [
                {text:detail?.product.cod, fontSize:9}, 
                {text:detail?.product.name, fontSize:9}, 
                {text:Number(detail?.price).toFixed(decimal), fontSize:9, alignment: 'right'},  
                {text:Number(detail?.dataValues.suma_quantity).toFixed(decimal), fontSize:9, alignment: 'right'}, 
                {text:Number(detail?.dataValues.suma_total).toFixed(decimal), fontSize:9, alignment: 'right'},
            ];
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            {colSpan: 2, text:`TOTAL: ${NumeroALetras(total)}`},
            {text:''},
            {text:''},
            {text:''},
            {text: `${Number(total).toFixed(decimal)}`, bold: true, fontSize:10, alignment: 'right'}
        ]);
        const formatDate1 = filterBy == 'MONTH' ? 'MM' : filterBy == 'YEAR' ? 'YYYY' : 'DD-MM-YYYY'; 
        const formatDate2 = filterBy == 'MONTH' ? 'YYYY' : 'DD-MM-YYYY';
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE VENTAS DETALLADAS', paper: 'A4', orientation: 'landscape',
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'output-generatePdfDetailsReports.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'No se pudo generar el PDF. Intente nuevamente.' });
    }
}

const dataDetailsPdfReturn = (auth) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE VENTAS DETALLADAS', auth, details: 'Reporte generado con los parámetros establecidos' }),
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [60,'*',70,70,70],
            body: [
                [
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PRODUCTO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PRECIO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANTIDAD', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'IMPORTE', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                ]
            ]   ,
            layout: 'lightHorizontalLines'
        }
    }
];

const generateExcelDetailsReports = async (req = request, res = response) => {
    try {
        const detailsOutput = await returnDataDetailsOutput(req.query)
        let detailsOutput_data = [];
        if (detailsOutput.length == 0) {
            detailsOutput_data.push({
                CÓDIGO: '',
                PRODUCTO: '',
                PRECIO: '',
                CANTIDAD: '',
                IMPORTE: '',
            });
        }
        detailsOutput.forEach(detail => {
            const tableData = {
                CÓDIGO: detail?.product.cod,
                PRODUCTO: detail?.product.name,
                PRECIO: Number(detail?.price),
                CANTIDAD:Number(detail?.dataValues.suma_quantity),
                IMPORTE: Number(detail?.dataValues.suma_total),
            }
            detailsOutput_data.push(tableData);
        });
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Ventas detalladas`);
        // Agregar encabezados
        const headers = Object.keys(detailsOutput_data[0]);
        worksheet.addRow(headers);
        // Agregar datos
        detailsOutput_data.forEach(data => {
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
        res.setHeader('Content-Disposition', `attachment; filename=ventas-detalle-report.xlsx`);
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

const returnDataDetailsOutput = async (params) => {
    const {type_pay, type_registry, id_client,id_sucursal,id_storage, status, filterBy, date1, date2} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"output"."date_output"');
    const optionsDb = {
        attributes: [
            'price',
            [sequelize.fn('SUM', sequelize.col('quantity')), 'suma_quantity'],
            [sequelize.fn('SUM', sequelize.col('DetailsOutput.total')), 'suma_total'],
        ],
        include: [
            { 
                association: 'product', 
                attributes: {exclude: ['id_category','id_unit','status','createdAt','updatedAt']}, 
            },
            {    
                association: 'output',
                attributes: [], //para no incluir, pero si usar el where
                where: {
                        [Op.and]: [
                            id_sucursal   ? { id_sucursal   } : {},
                            id_storage    ? { id_storage   } : {},
                            type_pay      ? { type_output:type_pay } : {},
                            type_registry ? { type_registry } : {},
                            id_client   ? { id_client   } : {},
                            status ? { status } : {},
                            { date_output: whereDate }
                        ]
                }, 
            }
        ],
        group: [ 'id_product','product.id','price']
    };
    return await DetailsOutput.findAll(optionsDb);
}

const printOutputVoucher = async (req = request, res = response) =>{
    try {
        const { id_output } = req.params;
        const output = await Output.findByPk(id_output,{
            include: [ 
                { association: 'client'},
                { association: 'scale'},
                { association: 'user'},
                { association: 'bank'},
                { association: 'detailsOutput', include: [
                        {   association: 'product',
                            include: [{ association:'unit'},{ association: 'category'}]
                        }
                    ]
                },
                { association: 'storage'},
                { association: 'sucursal', include:{ association: 'company'}},
                { association: 'accounts_receivable'},
                { association: 'outputBig', include: [
                    { association: 'chauffeur', include: [{association: 'trasport_company'}]},
                    { association: 'cargo_truck'}
                ]},
            ]
        });
        const decimal = await getNumberDecimal();
        const document = buildOperationVoucher(output, { kind: 'sale', decimal, format: req.query.format });
        await sendReportPdf(res, document, 'boleta-venta-' + id_output + '.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el comprobante de venta' });
    }
}

module.exports = {
    generatePdfReports,
    generateExcelReports,
    generatePdfDetailsReports,
    generateExcelDetailsReports,
    printOutputVoucher,

}
