const { Op } = require("sequelize");
const { Kardex, sequelize } = require('../../database/config');
const PdfPrinter = require('pdfmake');
const fonts = require('../../helpers/generator-pdf/fonts');
const styles = require('../../helpers/generator-pdf/styles');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const { whereDateForType } = require("../../helpers/where_range");
const imagePath = path.join(__dirname, '../../../uploads/logo.png');
const ExcelJS = require('exceljs');
const { getNumberDecimal } = require("../../helpers/company");
moment.locale('es'); 


const generatePdfReports = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2} = req.query;
        const kardexes = await returnDataInput(req.query);
        let dataPdf = dataPdfReturn(req.userAuth); //PDF 
        kardexes.forEach(kardex => {
            const tableData = [
                {text:kardex?.type == 'INPUT' ? 'ENTRADA' : 'SALIDA', fontSize:8}, 
                {text:moment(kardex?.date).format('DD/MM/YYYY HH:mm:ss'), fontSize:8}, 
                {text:kardex?.detalle, fontSize:8}, 
                {text:kardex?.product.name, fontSize:8}, 
                {text:kardex?.product.unit.siglas, fontSize:8}, 
                {text:kardex?.quantity_inicial, fontSize:8}, 
                {text:kardex?.quantity_input, fontSize:8}, 
                {text:kardex?.quantity_output, fontSize:8}, 
                {text:kardex?.quantity_saldo, fontSize:8, },  
                {text:kardex?.sucursal.name, fontSize:8,}, 
                {text:kardex?.storage.name, fontSize:8,},
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
                    fontSize: 8,alignment: 'center', margin:[10,10,10,10]
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

const generatePdfReportsKardexFisico = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2} = req.query;
        const kardexes = await returnDataInputKardexFisico(req.query);
        let dataPdf = dataPdfReturnKardexFisicoVerticalOnlyReciclen(req.userAuth,kardexes); //PDF 
        kardexes.forEach(kardex => {
            const tableData = [
                {text:kardex?.product.cod, fontSize:8}, 
                {text:kardex?.product.name, fontSize:8}, 
                {text:kardex?.product.unit.siglas, fontSize:8}, 
                // {text:kardex?.quantity_inicial, fontSize:8}, 
                {text:kardex?.quantity_input, fontSize:8}, 
                {text:kardex?.quantity_output, fontSize:8}, 
                {text:kardex?.quantity_saldo, fontSize:8, },  
                // {text:kardex?.sucursal.name, fontSize:7,}, 
                {text:kardex?.storage.name, fontSize:8,},
            ];
            dataPdf[5].table.body.push(tableData);
        });
        const formatDate1 = filterBy == 'MONTH' ? 'MM' : filterBy == 'YEAR' ? 'YYYY' : 'DD-MM-YYYY'; 
        const formatDate2 = filterBy == 'MONTH' ? 'YYYY' : 'DD-MM-YYYY';
        let docDefinition = {
            content: dataPdf,

            // pageOrientation: 'landscape',
            footer: function(currentPage, pageCount) { return [
                {
                    text:`Fechas: ${moment(date1,formatDate1).format(formatDate1)} / ${moment(date2,formatDate2).format(formatDate2) != 'Fecha inválida' ? moment(date2,formatDate2).format(formatDate2) :'' }` + ' - Paginas: ' +currentPage.toString() + ' de ' + pageCount,
                    fontSize: 8,alignment: 'center', margin:[10,10,10,10]
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

const generatePdfReportsExistencia = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2} = req.query;
        const kardexes = await returnDataInput(req.query);
        const decimal = await getNumberDecimal();
        let totalFInput = 0, totalFOutput = 0, totalFSaldo = 0;
        let totalVInput = 0, totalVOutput = 0, totalVSaldo = 0;
        kardexes?.map((resp) => {
            const {cost_price,detallePrimary} = _returnDetailsPrimary(resp);
            resp.cost_price = cost_price; 
            resp.detallePrimary = detallePrimary; 
            totalFInput +=Number(resp.quantity_input);
            totalFOutput+=Number(resp.quantity_output);
            totalFSaldo +=Number(resp.quantity_saldo);

            totalVInput +=Number(resp.cost_u_input);
            totalVOutput+=Number(resp.cost_u_output);
            totalVSaldo +=Number(resp.cost_u_saldo);
          })
        let dataPdf = dataPdfReturnKardexExistencia(req.userAuth,kardexes); //PDF 
        kardexes.forEach(kardex => {
            const tableData = [
                {text:moment(kardex?.date).format('DD/MM/YYYY'), fontSize:8}, 
                {text:kardex?.document, fontSize:8}, 
                {
                    columns: [
                        { text: kardex?.detallePrimary, alignment: 'left' , fontSize:8},
                        { text: kardex?.detalle, alignment: 'right', fontSize:7 }
                    ]
                },
                {text:kardex?.quantity_input, fontSize:8 ,fillColor: '#DFF0D8'}, 
                {text:kardex?.quantity_output, fontSize:8,fillColor: '#F2DEDE'}, 
                {text:kardex?.quantity_saldo, fontSize:8,fillColor: '#D9EDF7'}, 
                {text:Number(kardex?.cost_u_inicial).toFixed(decimal), fontSize:8}, 
                {text:Number(kardex?.cost_u_input).toFixed(decimal), fontSize:8,  fillColor: '#DFF0D8'},  
                {text:Number(kardex?.cost_u_output).toFixed(decimal), fontSize:8,fillColor: '#F2DEDE'}, 
                {text:Number(kardex?.cost_u_saldo).toFixed(decimal), fontSize:8,fillColor: '#D9EDF7'}, 
                {text:kardex?.storage.name, fontSize:8,},
            ];
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([{text:' ', fontSize:8,colSpan:9},{},{},{},{},{},{},{},{},{},{}]);
        dataPdf[5].table.body.push([
            {colSpan:3, text:'Totales:',fontSize:8},{},{},
            {text:Number(totalFInput), fontSize:8,fillColor: '#DFF0D8'},
            {text:Number(totalFOutput), fontSize:8,fillColor: '#F2DEDE'},
            {text:Number(totalFSaldo), fontSize:8,fillColor: '#D9EDF7'},
            {},
            {text:Number(totalVInput).toFixed(decimal), fontSize:8,fillColor: '#DFF0D8'},
            {text:Number(totalVOutput).toFixed(decimal), fontSize:8,fillColor: '#F2DEDE'},
            {text:Number(totalVSaldo).toFixed(decimal), fontSize:8,fillColor: '#D9EDF7'},
            {}
        ]);
        const formatDate1 = filterBy == 'MONTH' ? 'MM' : filterBy == 'YEAR' ? 'YYYY' : 'DD-MM-YYYY'; 
        const formatDate2 = filterBy == 'MONTH' ? 'YYYY' : 'DD-MM-YYYY';
        let docDefinition = {
            content: dataPdf,
            pageOrientation: 'landscape',
            footer: function(currentPage, pageCount) { return [
                {
                    text:`Fechas: ${moment(date1,formatDate1).format(formatDate1)} / ${moment(date2,formatDate2).format(formatDate2) != 'Fecha inválida' ? moment(date2,formatDate2).format(formatDate2) :'' }` + ' - Paginas: ' +currentPage.toString() + ' de ' + pageCount,
                    fontSize: 8,alignment: 'center', margin:[10,10,10,10]
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

const _returnDetailsPrimary = (kardex) => {
    let detallePrimary = '';
    let cost_price ='';
    if(kardex.type == 'INPUT') {
        cost_price = `${kardex.cost_u_input}`;
        if(kardex.detalle.includes('CLASIFICACIÓN')) {
            detallePrimary = `${kardex.productClassified?.name ?? '-'}` 
        } else if(kardex.detalle.includes('TRASLADO')){
            detallePrimary = `${kardex.sucursalOriginDestination?.name ?? '-'}` 
        } else {
            detallePrimary = `${kardex.provider?.full_names ?? '-'}` 
        }
    } else {
        cost_price = `${kardex.price_u_inicial}`;
        if(kardex.detalle.includes('CLASIFICACIÓN')) {
            detallePrimary = `${kardex.productClassified?.name ?? '-'}` 
        } else if(kardex.detalle.includes('TRASLADO')){
            detallePrimary = `${kardex.sucursalOriginDestination?.name ?? '-'}` 
        } else {
            detallePrimary = `${kardex?.client?.full_names ?? '-'}`;
        }
    }
    return {cost_price,detallePrimary};
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
    { text: 'REPORTE DE KARDEX', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Reporte generados con los parámetros establecidos', alignment:'center',absolutePosition: {  y: 73 } },
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [40,60,80,'*',35,55,59,55,55,70,70],
            body: [
                [
                    {text:'TIPO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA KARDEX', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'DETALLE', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PRODUCTO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'UND', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'SALDO INICIAL', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANT ENTRADA', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANT SALIDA', fontSize:8,fillColor: '#eeeeee', bold:true}, 
                    {text:'CANT SALDO', fontSize:8,fillColor: '#eeeeee', bold:true}, 
                    {text:'SUCURSAL',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true}, 
                    {text:'ALMACÉN',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true}, 
                ]
            ],
            layout: 'lightHorizontalLines'
        }
    }
];

const dataPdfReturnKardexExistencia = (auth,kardex) => [
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
    { text: 'REPORTE DE KARDEX DE EXISTENCIA', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: `PRODUCTO: ${kardex[0].product.name}`, alignment:'center',absolutePosition: {  y: 73 } },
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
                headerRows: 2,
                widths: [45, 45, '*', 40, 40, 40, 50, 50, 50, 50, 70],
                body: [
                    [
                        { text: 'FECHA', fontSize: 8, fillColor: '#eeeeee', bold: true, rowSpan: 2 },
                        { text: 'N°', fontSize: 8, fillColor: '#eeeeee', bold: true, rowSpan: 2 },
                        { text: 'DETALLE', fontSize: 8, fillColor: '#eeeeee', bold: true, rowSpan: 2 },
                        { text: 'FISICO', fontSize: 8, fillColor: '#eeeeee', bold: true, colSpan: 3, alignment: 'center' },
                        {}, {}, // Empty cells for colSpan
                        { text: 'P.U.', fontSize: 8, fillColor: '#eeeeee', bold: true, rowSpan: 2, alignment: 'center' },
                        { text: 'VALORADO', fontSize: 8, fillColor: '#eeeeee', bold: true, colSpan: 3, alignment: 'center' },
                        {}, {}, // Empty cells for colSpan
                        { text: 'ALMACÉN', fontSize: 8, fillColor: '#eeeeee', bold: true, rowSpan: 2, alignment: 'center' }
                    ],
                    [
                        {}, // Empty cell due to rowSpan
                        {}, // Empty cell due to rowSpan
                        {}, // Empty cell due to rowSpan
                        { text: 'ENTRADA', fontSize: 8, fillColor: '#eeeeee', bold: true, alignment: 'center' },
                        { text: 'SALIDA', fontSize: 8, fillColor: '#eeeeee', bold: true, alignment: 'center' },
                        { text: 'SALDO', fontSize: 8, fillColor: '#eeeeee', bold: true, alignment: 'center' },
                        {}, // Empty cell due to rowSpan
                        { text: 'ENTRADA', fontSize: 8, fillColor: '#eeeeee', bold: true, alignment: 'center' },
                        { text: 'SALIDA', fontSize: 8, fillColor: '#eeeeee', bold: true, alignment: 'center' },
                        { text: 'SALDO', fontSize: 8, fillColor: '#eeeeee', bold: true, alignment: 'center' },
                        {} // Empty cell due to rowSpan
                    ],
                    // Add more rows here...
                ],
            layout: 'lightHorizontalLines'
        }
    },
];


const dataPdfReturnKardexFisicoVerticalOnlyReciclen = (auth,kardexes) => [
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
    { text: 'REPORTE DE KARDEX FÍSICO', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Detalle de los Productos:' + `${kardexes[0]?.sucursal.name}`, alignment:'center',absolutePosition: {  y: 73 } },
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 2,
            widths: [50,'*',35,55,55,55,70],
            body: [
                [
                    {text:'CÓDIGO', fontSize:8 ,fillColor: '#eeeeee', bold:true, rowSpan: 2}, 
                    {text:'DETALLE', fontSize:8 ,fillColor: '#eeeeee', bold:true, rowSpan: 2}, 
                    {text:'UNIDAD', fontSize:8 ,fillColor: '#eeeeee', bold:true, rowSpan: 2}, 
                    { text: 'FISICO', fontSize: 8, fillColor: '#eeeeee', bold: true, colSpan: 3, alignment: 'center' },
                    {}, {},
                    {text:'ALMACÉN',alignment: 'center', fontSize:7,fillColor: '#eeeeee', bold:true, rowSpan: 2}, 
                ],
                [
                    {},{},{},
                    {text:'COMPRA', fontSize:8 ,fillColor: '#eeeeee', bold:true, alignment: 'center'}, 
                    {text:'VENTA', fontSize:8,fillColor: '#eeeeee', bold:true, alignment: 'center'}, 
                    {text:'SALDO', fontSize:8,fillColor: '#eeeeee', bold:true, alignment: 'center'},
                    {}, 
                ]
            ],
            layout: 'lightHorizontalLines'
        }
    }
];

const generateExcelReports = async (req = request, res = response) => {
  try {
        const kardexes = await returnDataInput(req.query);
        const decimal = await getNumberDecimal();
        let kardex_data = [];
        if(kardexes.length == 0) {
            kardex_data.push({
                TIPO : '',
                FECHA_KARDEX : '',
                DETALLE : '',
                PRODUCTO : '',
                UND : '',

                CANT_SALDO_INICIAL : '',
                COSTO_U_INICIAL: '',
                COSTO_TOTAL_INICIAL : '',

                CANT_ENTRADA : '', 
                COSTO_U_ENTRADA : '',
                COSTO_TOTAL_ENTRADA : '', 

                CANT_SALIDA : '',
                COSTO_U_SALIDA : '',
                COSTO_TOTAL_SALIDA : '',  

                CANT_SALDO : '',
                COST_U_SALDO : '',
                COSTO_TOTAL_SALDO : '', 
                SUCURSAL : '',
                ALMACÉN : ''
            });
        }
        kardexes.forEach(kardex => {
            const tableData = {
                TIPO: kardex.type == 'INPUT' ? 'ENTRADA' : 'SALIDA',
                FECHA_KARDEX:moment(kardex?.date).format('DD/MM/YYYY HH:mm:ss'),
                DETALLE: kardex.detalle,
                PRODUCTO: kardex.product.name,
                UND: kardex.product.unit.siglas,
                CANT_SALDO_INICIAL: Number(kardex.quantity_inicial),
                COSTO_U_INICIAL: Number(kardex.cost_u_inicial).toFixed(decimal),
                COSTO_TOTAL_INICIAL: Number(kardex.cost_total_inicial).toFixed(decimal),
                CANT_ENTRADA: Number(kardex.quantity_input),
                COSTO_U_ENTRADA: Number(kardex.cost_u_input).toFixed(decimal),
                COSTO_TOTAL_ENTRADA: Number(kardex.cost_total_input).toFixed(decimal),
                CANT_SALIDA: Number(kardex.quantity_output),
                COSTO_U_SALIDA: Number(kardex.cost_u_output).toFixed(decimal),
                COSTO_TOTAL_SALIDA: Number(kardex.cost_total_output).toFixed(decimal),
                CANT_SALDO: Number(kardex.quantity_saldo),
                COST_U_SALDO: Number(kardex.cost_u_saldo).toFixed(decimal),
                COSTO_TOTAL_SALDO: Number(kardex.cost_total_saldo).toFixed(decimal),
                SUCURSAL: kardex.sucursal.name,
                ALMACÉN: kardex.storage.name,
            }
            kardex_data.push(tableData);
        });
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Kardex`);
        // Agregar encabezados
        const headers = Object.keys(kardex_data[0]);
        worksheet.addRow(headers);
        // Agregar datos
        kardex_data.forEach(data => {
            const row = [];
            headers.forEach(header => {
                row.push(data[header]);
            });
            worksheet.addRow(row);
        });
        worksheet.getColumn('A').width = 10; 
        worksheet.getColumn('B').width = 20; 
        worksheet.getColumn('C').width = 35; 
        worksheet.getColumn('D').width = 35; 
        worksheet.getColumn('E').width = 10; 
        worksheet.getColumn('F').width = 20; 
        worksheet.getColumn('G').width = 20; 
        worksheet.getColumn('H').width = 20; 
        worksheet.getColumn('I').width = 20; 
        worksheet.getColumn('J').width = 20; 
        worksheet.getColumn('K').width = 20; 
        worksheet.getColumn('L').width = 20; 
        worksheet.getColumn('M').width = 20; 
        worksheet.getColumn('N').width = 20; 
        worksheet.getColumn('O').width = 20; 
        worksheet.getColumn('P').width = 20; 
        worksheet.getColumn('Q').width = 20; 
        worksheet.getColumn('R').width = 30; 
        worksheet.getColumn('S').width = 30; 
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=kardex-report.xlsx`);
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

const generateExcelReportsKardexFisico = async (req = request, res = response) => {
    try {
          const kardexes = await returnDataInputKardexFisico(req.query);
          const decimal = await getNumberDecimal();
          let kardex_data = [];
          if(kardexes.length == 0) {
              kardex_data.push({
                  Código : '',
                  Detalle : '',
                  Unidad : '',
  
                  "Inv. Inicial" : '',
                  Entrada: '',
                  Salida : '',
  
                  Saldo : '', 
  
                  Sucursal : '',
                  Almacén : ''
              });
          }
          kardexes.forEach(kardex => {
              const tableData = {
                  Código: kardex.product.cod,
                  Detalle: kardex.product.name,
                  Unidad: kardex.product.unit.siglas,
                  "Inv. Inicial": Number(kardex.quantity_inicial),
                  Entrada: Number(kardex.quantity_input),
                  Salida: Number(kardex.quantity_output),
                  Saldo: Number(kardex.quantity_saldo),
                  Sucursal: kardex.sucursal.name,
                  Almacén: kardex.storage.name,
              }
              kardex_data.push(tableData);
          });
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet(`Kardex`);
          // Agregar encabezados
          const headers = Object.keys(kardex_data[0]);
          worksheet.addRow(headers);
          // Agregar datos
          kardex_data.forEach(data => {
              const row = [];
              headers.forEach(header => {
                  row.push(data[header]);
              });
              worksheet.addRow(row);
          });
          worksheet.getColumn('A').width = 15; 
          worksheet.getColumn('B').width = 40; 
          worksheet.getColumn('C').width = 10; 
          worksheet.getColumn('D').width = 20; 
          worksheet.getColumn('E').width = 20; 
          worksheet.getColumn('F').width = 20; 
          worksheet.getColumn('G').width = 20; 
          worksheet.getColumn('H').width = 30; 
          worksheet.getColumn('I').width = 30; 
          worksheet.getColumn('J').width = 30; 
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename=kardex-report.xlsx`);
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

const generateExcelReportsExistencia = async (req = request, res = response) => {
try {
        const kardexes = await returnDataInput(req.query);
        const decimal = await getNumberDecimal();
        let kardex_data = [];
        if(kardexes.length == 0) {
            kardex_data.push({
                FECHA : '',
                'N°' : '',
                DETALLE : '',
                SUB_DETALLE : '',
                ENTRADA : '',
                SALIDA : '',
                SALDO : '',
                'P.U.': '',
                ENTRADA : '',
                SALIDA : '', 
                SALDO : '',
                ALMACÉN : '', 
            });
        }
        kardexes.forEach(kardex => {
            const {cost_price,detallePrimary} = _returnDetailsPrimary(kardex);
            kardex.cost_price = cost_price; 
            kardex.detallePrimary = detallePrimary; 
            const tableData = {
                FECHA: moment(kardex?.date).format('DD/MM/YYYY'),
                'N°' :kardex?.document,
                DETALLE:  kardex?.detallePrimary,
                SUB_DETALLE: kardex?.detalle,
                ENTRADA_FISICO: kardex?.quantity_input,
                SALIDA_FISICO: kardex?.quantity_output,
                SALDO_FISICO: kardex?.quantity_saldo,
                'P.U.': Number(kardex?.cost_u_inicial ?? 0).toFixed(decimal),
                ENTRADA_VALORADO: Number(kardex?.cost_u_input ?? 0).toFixed(decimal),
                SALIDA_VALORADO: Number(kardex?.cost_u_output ?? 0).toFixed(decimal),
                SALDO_VALORADO: Number(kardex?.cost_u_saldo ?? 0).toFixed(decimal),
                ALMACÉN: kardex.storage.name,
            }
            kardex_data.push(tableData);
        });
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Kardex Existencia ${kardexes[0]?.product?.name ?? '-'}`);
        // Agregar encabezados
        const headers = Object.keys(kardex_data[0]);
        worksheet.addRow(headers);
        // Agregar datos
        kardex_data.forEach(data => {
            const row = [];
            headers.forEach(header => {
                row.push(data[header]);
            });
            worksheet.addRow(row);
        });
        worksheet.getColumn('A').width = 15; 
        worksheet.getColumn('B').width = 15; 
        worksheet.getColumn('C').width = 60; 
        worksheet.getColumn('D').width = 60; 
        worksheet.getColumn('E').width = 20; 
        worksheet.getColumn('F').width = 20; 
        worksheet.getColumn('G').width = 20; 
        worksheet.getColumn('H').width = 20; 
        worksheet.getColumn('I').width = 20; 
        worksheet.getColumn('J').width = 20; 
        worksheet.getColumn('K').width = 50; 
       
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=kardex-report.xlsx`);
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
const returnDataInput = async (params) => {
    const {id_sucursal, id_storage, id_provider, id_product, filterBy, date1, date2, type_kardex,orderNew} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"Kardex"."createdAt"');
    const optionsDb = {
        order: [orderNew],
        where: {
            [Op.and]: [
                id_sucursal ? { id_sucursal } : {},
                id_storage  ? { id_storage  } : {},
                id_provider ? { id_provider } : {},
                id_product  ? { id_product  } : {},
                type_kardex  ? { type:type_kardex  } : {},
                { createdAt: whereDate },
                { status: true },
            ]
        },
        include: [ 
            { association: 'provider', attributes: ['full_names','number_document','name_contact']},
            { association: 'sucursal', attributes: ['name','city']},
            { association: 'sucursalOriginDestination', attributes: ['name','city']},
            { association: 'storage', attributes: ['name']},
            { association: 'client'},
            { association: 'productClassified',  attributes: {exclude: ['id','id_category','id_unit','status','createdAt','updatedAt']}},
            { association: 'product',  attributes: {exclude: ['id','id_category','id_unit','status','createdAt','updatedAt']},
                include: [ {association: 'unit', attributes: ['name','siglas']}]
            },
        ]
    };
    return await Kardex.findAll(optionsDb);
}

const returnDataInputKardexFisico = async (params) => {
    const {id_sucursal, id_storage, id_provider, id_product, filterBy, date1, date2,orderNew} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"Kardex"."createdAt"');
    const optionsDb = {
        //order: [orderNew],
        attributes: [
            'id_product',
            [sequelize.literal('COALESCE(SUM(quantity_input), 0)'), 'quantity_input'],
            [sequelize.literal('COALESCE(SUM(quantity_output), 0)'), 'quantity_output'],
            [sequelize.literal('MIN(quantity_inicial) + COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0)'), 'quantity_saldo'],
            [sequelize.literal('MIN(quantity_inicial)'), 'quantity_inicial'],
        ],
        where: {
            [Op.and]: [
                id_sucursal ? { id_sucursal } : {},
                id_storage  ? { id_storage  } : {},
                id_provider ? { id_provider } : {},
                id_product  ? { id_product  } : {},
                { createdAt: whereDate },
                { status: true },
            ]
        },
        include: [ 
            { association: 'product',  attributes: {exclude: ['id','id_category','id_unit','status','createdAt','updatedAt']},
              include: [ {association: 'unit', attributes: ['name','siglas']}]
            },
            { association: 'storage', attributes: ['name']},
            { association: 'sucursal', attributes: ['name','city']},
        ],
        group: ['id_product', 'product.id', 'product.unit.id', 'storage.id','sucursal.id']
    };
    return await Kardex.findAll(optionsDb);
}

module.exports = {
    generatePdfReports,
    generateExcelReports,
    generatePdfReportsKardexFisico,
    generateExcelReportsKardexFisico,
    generatePdfReportsExistencia,
    generateExcelReportsExistencia
}