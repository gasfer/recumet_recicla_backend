const { Op } = require("sequelize");
const { Transfers } = require('../../database/config');
const PdfPrinter = require('pdfmake');
const fonts = require('../../helpers/generator-pdf/fonts');
const styles = require('../../helpers/generator-pdf/styles');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const { whereDateForType } = require("../../helpers/where_range");
const imagePath = path.join(__dirname, '../../../uploads/logo.png');
const ExcelJS = require('exceljs');
const { response } = require("express");
const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',hour: "numeric",
minute: "numeric",
second: "numeric", };

moment.locale('es'); 

const generatePdfReports = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2} = req.query;
        const transfers = await returnDataTransfer(req.query);
        let dataPdf = dataPdfReturn(req.userAuth); //PDF 
        let total = 0;
        transfers.forEach(transfer => {
            total += Number(transfer.quantity_product);
            const tableData = [
                {text:transfer?.cod, fontSize:9}, 
                {text:moment(transfer?.date_send).format('DD/MM/YYYY HH:mm:ss'), fontSize:9}, 
                {text:transfer?.date_received ? moment(transfer?.date_received).format('DD/MM/YYYY HH:mm:ss') : '', fontSize:9}, 
                {text:transfer?.observations_send, fontSize:8}, 
                {text:transfer?.observations_received, fontSize:8}, 
                {text:transfer?.sucursal_send.name, fontSize:9}, 
                {text:transfer?.sucursal_received.name, fontSize:9}, 
                {text:transfer?.status == 'PENDING' ? 'PENDIENTE' : 'RECEPCIONADO', fontSize:9}, 
            ];
            dataPdf[5].table.body.push(tableData);
        });
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
    { text: `REPORTE DE TRASLADOS`, alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Reporte generados con los parámetros establecidos', alignment:'center',absolutePosition: {  y: 73 } },
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [55,55,55,'*','*',80,80,68],
            body: [
                [
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA ENVIÓ', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA RECEPCIÓN', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'OBSERVACIÓN ENVIÓ', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'OBSERVACIÓN RECEPCIÓN', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'SUCURSAL ENVIÓ', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'SUCURSAL RECEPCIÓN', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'ESTADO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                ]
            ]   ,
            layout: 'lightHorizontalLines'
        }
    }
];

const generateExcelReports = async (req = request, res = response) => {
  try {
    const transfers = await returnDataTransfer(req.query);
    let transfers_data = [];
    if (transfers.length == 0) {
    transfers_data.push({
        CÓDIGO: '',
        FECHA_ENVIÓ: '',
        FECHA_RECEPCIÓN: '',
        OBSERVACIÓN_ENVIÓ: '',
        OBSERVACIÓN_RECEPCIÓN: '',
        SUCURSAL_ENVIÓ: '',
        SUCURSAL_RECEPCIÓN: '',
        ESTADO: '',
      });
    }
    transfers.forEach(transfer => {
      const tableData = {
        CÓDIGO: transfer.cod,
        FECHA_ENVIÓ: moment(transfer.date_send).format('DD/MM/YYYY HH:mm:ss') ,
        FECHA_RECEPCIÓN: transfer?.date_received ? moment(transfer?.date_received).format('DD/MM/YYYY HH:mm:ss') : '',
        OBSERVACIÓN_ENVIÓ: transfer?.observations_send,
        OBSERVACIÓN_RECEPCIÓN: transfer?.observations_received,
        SUCURSAL_ENVIÓ: transfer?.sucursal_send.name,
        SUCURSAL_RECEPCIÓN: transfer?.sucursal_received?.name,
        ESTADO: transfer?.status == 'PENDING' ? 'PENDIENTE' : 'RECEPCIONADO',
      }
      transfers_data.push(tableData);
    });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Traslados`);
    // Agregar encabezados
    const headers = Object.keys(transfers_data[0]);
    worksheet.addRow(headers);
    // Agregar datos
    transfers_data.forEach(data => {
      const row = [];
      headers.forEach(header => {
        row.push(data[header]);
      });
      worksheet.addRow(row);
    });
    worksheet.getColumn('A').width = 15; 
    worksheet.getColumn('B').width = 20; 
    worksheet.getColumn('C').width = 20; 
    worksheet.getColumn('D').width = 60; 
    worksheet.getColumn('E').width = 60; 
    worksheet.getColumn('F').width = 40; 
    worksheet.getColumn('G').width = 40; 
    worksheet.getColumn('H').width = 25; 
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=traslados-report.xlsx`);
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

const returnDataTransfer = async (params) => {
    const {id_sucursal_send, id_storage_send,id_storage_received, id_user_send,id_user_received, id_sucursal_received, status, filterBy, date1, date2,orderNew} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"Transfers"."date_send"');
    const optionsDb = {
        order: [orderNew],
        where: {
            [Op.and]: [
                id_sucursal_send     ? { id_sucursal_send } : {},
                id_storage_send      ? { id_storage_send  } : {},
                id_sucursal_received ? { id_sucursal_received  } : {},
                id_storage_received  ? { id_storage_received   } : {},
                id_user_send         ? { id_user_send   } : {},
                id_user_received     ? { id_user_received   } : {},
                { status },
                { date_send: whereDate }
            ]
        },
        include: [
            {association: 'sucursal_send', attributes: ['name']},
            {association: 'sucursal_received', attributes: ['name']},
            {association: 'storage_send', attributes: ['name']},
            {association: 'storage_received', attributes: ['name']},
            {association: 'user_send', attributes: ['full_names']},
            {association: 'user_received', attributes: ['full_names']},
        ]
    };
    return await Transfers.findAll(optionsDb);
}

const printTransferVoucher = async (req = request, res = response) =>{
    try {
        const { id_transfer } = req.params;
        const transfers = await Transfers.findByPk(id_transfer,{
            include: [ 
                {association: 'sucursal_send', attributes: ['name']},
                {association: 'sucursal_received', attributes: ['name']},
                {association: 'storage_send', attributes: ['name']},
                {association: 'storage_received', attributes: ['name']},
                {association: 'user_send', attributes: ['full_names']},
                {association: 'user_received', attributes: ['full_names']},
                { association: 'detailsTransfers', include: [
                        { association: 'product',  attributes: ['cod','name'], include: [{association:'unit', attributes: ['name','siglas']}]},
                    ]
                },
            ]
        });
        let dataPdf = dataPdfReturnTransferVoucher(transfers); //PDF 
        let quantity_total = 0;
        let units = [];
        transfers.detailsTransfers.forEach(detail => {
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
            dataPdf[9].table.body.push(tableData);
        });
        dataPdf[9].table.body.push(
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
        const pathImage = path.join(__dirname, `../../../uploads/none-img.jpg`);
        return res.sendFile(pathImage);
    }
}

const dataPdfReturnTransferVoucher = (transfer) => [
    {
        image: 'data:image/png;base64,'+ fs.readFileSync(imagePath,'base64'),
        width: 60,
        absolutePosition: { x:30, y: 15 }
    },
    { text: 'TRASLADO: ' + transfer.cod, style: 'fechaDoc',
      absolutePosition: {  y: 30 }
    },
    { text: new Date(transfer.date_send).toLocaleDateString('es-ES', options),  style: 'fechaDoc', absolutePosition: {  y: 40 }},
    { text: 'GUÍA DE TRASLADO', style: 'title2',bold:true , fontSize:13},
    { text: 'ORIGEN:', style: 'datos_person', bold:true ,fontSize:10, margin:[0,0,8,0] },
    {
        columns: [
            { text: `Sucursal:`, bold:true ,style: 'text',width: 45, },
            { text: `${transfer.sucursal_send.name}`, style: 'text',  },
            { text: `Fecha envió:`, bold:true ,style: 'text',width: 80, },
            { text:  moment(transfer.date_send).format('DD/MM/YYYY HH:mm:ss'), style: 'text',  },
        ]
    },
    { text: 'DESTINO:', style: 'datos_person', bold:true ,fontSize:10, margin:[0,5,0,0] },
    {
        columns: [
            { text: `Sucursal:`, bold:true ,style: 'text',width: 45, },
            { text: `${transfer.sucursal_received.name}`, style: 'text',  },
            { text: `Fecha recepción:`, bold:true ,style: 'text',width: 80, },
            { text: transfer.date_received ? moment(transfer.date_received).format('DD/MM/YYYY HH:mm:ss') : '-', style: 'text',  },
        ]
    },
    { text: 'DETALLE DE LOS PRODUCTOS:', style: 'datos_person',bold:true ,fontSize:10, margin:[0,5,0,0] },
    {
        style: 'tableExample',
        table: {
            widths: [55, '*', 50, 80],
            body: [
                [
                    {text:'CÓDIGO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'DETALLE', fontSize:8,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANT.',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true},
                    {text:'UND',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true},
                ]
            ]
        }
    },
    {
        margin: [0,10,0,0],
        style: 'tableExample',
        table: {
            widths: ['*', '*'],
            body: [
                [
                    {text:'OBSERVACIONES ENVIÓ', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'OBSERVACIONES RECEPCIÓN', fontSize:9,fillColor: '#eeeeee', bold:true}, 
                ],
                [
                    { text: `${transfer?.observations_send?? ''}`, style: 'text',fontSize:8  },
                    { text: `${transfer?.observations_received?? ''}`, style: 'text',fontSize:8  },
                ]
            ]
        }
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
            { text: `Entregue conforme`, bold:true,style: 'text',alignment: 'center' },
            { text: `Recibí conforme`, bold:true ,style: 'text', alignment: 'center' },
        ]
    },
    {
        margin: [0,-2,0,0],
        columns: [
            { text: `Responsable de almacén`,style: 'text',alignment: 'center' },
            { text: `Chofer` , style: 'text',alignment: 'center' },
        ]
    },
];

module.exports = {
    generatePdfReports,
    generateExcelReports,
    printTransferVoucher,
}