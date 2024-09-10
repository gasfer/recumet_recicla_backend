const { Op } = require("sequelize");
const { Output, DetailsOutput, sequelize } = require('../../database/config');
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

const generatePdfReports = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2} = req.query;
        const decimal = await getNumberDecimal();
        const outputs = await returnDataOutput(req.query);
        let dataPdf = dataPdfReturn(req.userAuth); //PDF 
        let total = 0;
        outputs.forEach(output => {
            total += Number(output.total);
            const tableData = [
                {text:output?.cod, fontSize:9}, 
                {text:moment(output?.createdAt).format('DD/MM/YYYY HH:mm:ss'), fontSize:9}, 
                {text:output?.type_registry, fontSize:9}, 
                {text:output?.number_registry, fontSize:9}, 
                {text:output?.client?.full_names, fontSize:8}, 
                {text:output?.user?.full_names, fontSize:8}, 
                {text:output?.comments, fontSize:9}, 
                {text:output?.type_output, fontSize:9}, 
                {text:Number(output?.sub_total).toFixed(decimal), fontSize:9, alignment: 'right'},  
                {text:Number(output.discount).toFixed(decimal), fontSize:9, alignment: 'right'}, 
                {text:Number(output.total).toFixed(decimal), fontSize:9, alignment: 'right'},
            ];
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            {colSpan: 8, text:`TOTAL: ${NumeroALetras(total)}`},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
            {text:''},
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
    {   text: `${auth?.full_names} / ${auth.number_document}`, style: 'fechaDoc',
        absolutePosition: {  y: 27 }
    },
    { text: 'REPORTE DE VENTAS TOTALIZADOS', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Reporte generados con los parámetros establecidos', alignment:'center',absolutePosition: {  y: 73 } },
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [60,70,50,55,'*',80,'*',45,60,55,60],
            body: [
                [
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA VENTA', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO DOC.', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'NRO. DOC.', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CLIENTE', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'POR USUARIO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'COMENTARIOS', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO', fontSize:9,fillColor: '#eeeeee', bold:true}, 
                    {text:'SUBTOTAL', fontSize:9,fillColor: '#eeeeee', bold:true}, 
                    {text:'DESCUENTO',alignment: 'center', fontSize:9,fillColor: '#eeeeee', bold:true}, 
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
    let output_data = [];
    if (outputs.length == 0) {
      output_data.push({
        CÓDIGO: '',
        FECHA_VENTA: '',
        TIPO_DOCUMENTO: '',
        NRO_DOCUMENTO: '',
        FECHA_DOCUMENTO: '',
        CLIENTE: '',
        USUARIO: '',
        COMENTARIOS: '',
        TIPO: '',
        SUBTOTAL: '',
        DESCUENTO: '',
        TOTAL: '',
      });
    }
    outputs.forEach(output => {
      const tableData = {
        CÓDIGO: output.cod,
        FECHA_VENTA: moment(output?.createdAt).format('DD/MM/YYYY HH:mm:ss'),
        TIPO_DOCUMENTO: output.type_registry,
        NRO_DOCUMENTO: output.registry_number,
        FECHA_DOCUMENTO: moment(output?.date_voucher).format('DD/MM/YYYY HH:mm:ss'),
        CLIENTE: output?.client?.full_names ?? '',
        USUARIO: output.user.full_names,
        COMENTARIOS: output.comments,
        TIPO: output.type_output,
        SUBTOTAL: Number(output.sub_total),
        DESCUENTO: Number(output.discount),
        TOTAL: Number(output.total),
      }
      output_data.push(tableData);
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
    worksheet.getColumn('D').width = 25; 
    worksheet.getColumn('E').width = 20; 
    worksheet.getColumn('F').width = 50; 
    worksheet.getColumn('G').width = 50; 
    worksheet.getColumn('H').width = 50; 
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
    const whereDate = whereDateForType(filterBy,date1, date2, '"Output"."createdAt"');
    const optionsDb = {
        order: [orderNew],
        where: {
            [Op.and]: [
                id_sucursal   ? { id_sucursal   } : {},
                id_storage    ? { id_storage  } : {},
                type_pay      ? { type_output:type_pay } : {},
                type_registry ? { type_registry } : {},
                id_client   ? { id_client   } : {},
                { status },
                { createdAt: whereDate }
            ]
        },
        include: [ 
            { association: 'client' },
            { association: 'sucursal',attributes: ['name'] },
            { association: 'storage',attributes: ['name'] },
            { association: 'scale', attributes: ['name']},
            { association: 'user', attributes: ['full_names','number_document']},
            { association: 'bank'},
        ]
    };
    return await Output.findAll(optionsDb);
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
    { text: 'REPORTE DE VENTAS DETALLADAS', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Reporte generados con los parámetros establecidos', alignment:'center',absolutePosition: {  y: 73 } },
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
    const whereDate = whereDateForType(filterBy,date1, date2, '"output"."createdAt"');
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
                            { createdAt: whereDate }
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
        let dataPdf = dataPdfReturnOutputVoucher(output,output.sucursal,decimal); //PDF 
        let quantity_total = 0;
        let units = [];
        output.detailsOutput.forEach(detail => {
            quantity_total+= Number(detail?.quantity);
            if (!units.includes(detail?.product?.unit.siglas)) {
                units.push(detail?.product?.unit.siglas);
            }
            const tableData = [
                {text:detail?.product?.cod, fontSize:8}, 
                {text:detail?.product?.name, fontSize:8}, 
                {text:detail?.quantity, fontSize:8, alignment: 'center'}, 
                {text:detail?.product?.unit?.siglas, fontSize:8, alignment: 'center'}, 
                {text:Number(detail?.price).toFixed(decimal), fontSize:8, alignment: 'right'},  
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
                    text: `SUB TOTAL: ${Number(output.sub_total).toFixed(decimal)}`, colSpan: 2,fontSize:8,
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
                    text: `DESCUENTO: ${Number(output.discount).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                    fillColor: '#eeeeee',alignment:'right', 
                    bold:true,
                },
            ],
            [
                {
                    text:'SON: ' + NumeroALetras(Number(output.total).toFixed(decimal)),
                    style: 'sonBs', fontSize:8, colSpan: 4, border:[true,false,true,true],
                },
                '',
                '',
                '',
                {   border:[true,false,true,true],
                    text: `TOTAL: ${Number(output.total).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                    fillColor: '#eeeeee',alignment:'right', 
                    bold:true,
                },
            ]
        );
        if(output.type_output === 'CREDITO') {
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
                        text: `A CUENTA: ${Number(output?.accounts_receivable?.monto_abonado).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                        fillColor: '#eeeeee',alignment:'right', 
                        bold:true,
                    },
                ],
                [
                    {
                        text:'SON: ' + NumeroALetras(Number(output?.accounts_receivable?.monto_restante).toFixed(decimal)),
                        style: 'sonBs', fontSize:8, colSpan: 4, border:[true,false,true,true],
                    },
                    '',
                    '',
                    '',
                    {   border:[true,false,true,true],
                        text: `SALDO: ${Number(output?.accounts_receivable?.monto_restante).toFixed(decimal)}`, colSpan: 2,fontSize:8,
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

const dataPdfReturnOutputVoucher = (output,sucursal,decimal) => [
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
    { text: 'VENTA: ' + output.cod, style: 'fechaDoc',
      absolutePosition: {  y: 30 }
    },
    { text: new Date(output.createdAt).toLocaleDateString('es-ES', options),  style: 'fechaDoc', absolutePosition: {  y: 40 }},
    { text: output.voucher === 'MENOR' ? 'NOTA DE VENTA' : 'NOTA DE DESPACHO', style: 'title',bold:true , fontSize:12},
    { text: 'DATOS CLIENTE:', style: 'datos_person', bold:true ,fontSize:9 },
    {
        columns: [
            { text: `Nombre:`, bold:true ,style: 'text',width: 45, },
            { text: `${output?.client?.full_names ?? '-'}`, style: 'text',  },
            { text: `Nro. Nit:`, bold:true ,style: 'text',width: 50, },
            { text: `${output?.client?.number_document ?? '-'}`, style: 'text',  },
        ]
    },
    {
        margin: [0,3,0,0],
        columns: [
            { text: `Teléfono:`, bold:true ,style: 'text',width: 45, },
            { text: `${output?.client?.cellphone ?? '-'}`, style: 'text',  },
            { text: `Dirección:`, bold:true, style: 'text',width: 50,  },
            { text: `${output?.client?.direction ?? '-'}`,  style: 'text',  },
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
    output?.comments ? {   
        margin: [0,3,0,0],
        columns: [
            { text: 'OBSERVACIONES:', bold:true ,style: 'text',width: 90, },
            { text: `${output?.comments ?? ''}`, style: 'text',fontSize:8  },
        ]
    }: {},
    {
        style: 'tableExample',
        table: {
            widths: ['*', '*', '*'],
            body: [
                [
                    
                    {text:`P/${output.type_registry} NRO:`, fontSize:8 ,fillColor: '#eeeeee', bold:true,border: [true, false, true, true]}, 
                    {text:'BALANZA.', fontSize:8,fillColor: '#eeeeee', bold:true,border: [true, false, true, true]}, 
                    {text:'TIPO DE VENTA.',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true,border: [true, false, true, true]},
                ],
                [
                    {text:output?.number_registry, fontSize:8}, 
                    {text:output?.scale.name, fontSize:8}, 
                    {text:`${output.type_output === 'CONTADO' ? 'AL CONTADO': 'A CREDITO'}`, fontSize:8}, 
                ]
            ]
        }
    },
    {
        margin: [0,3,0,0],
        columns: [
            { text: `FORMA DE PAGO:`, bold:true ,style: 'text',width: output.type_payment != 'EFECTIVO' ?65 : 100, },
            { text: `${output.type_payment}`, style: 'text',  },
            output.type_payment != 'EFECTIVO' ? { text: `CUENTA:`, bold:true, style: 'text',width: 53}: {},
            output.type_payment != 'EFECTIVO' ? { text: `${output?.account_output}`,  style: 'text'}: {}, 
            output.type_payment != 'EFECTIVO' ? { text: `BANCO:`, bold:true, style: 'text',width: 80}: {},
            output.type_payment != 'EFECTIVO' ? { text: `${output?.bank?.name ?? '-'}`,  style: 'text'}:{},
        ]
    },
    output.voucher != 'MENOR' ? {
        style: 'tableExample',
        table: {
            margin: [0,5,0,0],
            widths: ['*', '*', '*', '*'],
            body: [
                [
                    {text:'ORIGEN.', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'DESTINO.', fontSize:8,fillColor: '#eeeeee', bold:true}, 
                    {text:'EMPRESA.' ,  colSpan: 2,alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true},
                    ''
                ],
                [
                    {text:output.outputBig.origin, fontSize:8}, 
                    {text:output.outputBig.destination, fontSize:8}, 
                    {text:output.outputBig.chauffeur.trasport_company.name ,  colSpan: 2, fontSize:8,alignment: 'center' }, 
                    ''
                ],
                [
                    output.voucher == 'MAYOR. EXTERIOR' ? {
                    text:'AGENCIA PORT.', fontSize:8 ,fillColor: '#eeeeee', bold:true}
                    : {text: '', border: [false, false, false, false]}, 
                    output.voucher == 'MAYOR. EXTERIOR' ? 
                    {text:'TRANS. MARITI.', fontSize:8 ,fillColor: '#eeeeee', bold:true} 
                    : {text: '', border: [false, false, false, false]},
                    {text:'CHOFER.',  fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PLACA.', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                ],
                [
                    output.voucher == 'MAYOR. EXTERIOR' ?
                    {text:output.outputBig.agencia,fontSize:8}
                    : {text: '', border: [false, false, false, false]},
                    output.voucher == 'MAYOR. EXTERIOR' ? 
                    {text:output.outputBig.trans_mariti,fontSize:8}
                    :  {text: '', border: [false, false, false, false]},
                    {text:output.outputBig.chauffeur.full_names, fontSize:8}, 
                    {text:output.outputBig.cargo_truck.placa, fontSize:8},
                ]
            ]
        }
    } : {},
    output.voucher == 'MAYOR. EXTERIOR' ? {
        style: 'tableExample',
        table: {
            widths: ['*', '*', '*','*'],
            body: [
                [
                    {text:'Nº FACTURA.', fontSize:8 ,fillColor: '#eeeeee', bold:true,border: [true, false, true, true]}, 
                    {text:'Nº PRECINTO', fontSize:8,fillColor: '#eeeeee', bold:true,border: [true, false, true, true]}, 
                    {text:'Nº CONTENEDOR',fontSize:8,fillColor: '#eeeeee', bold:true,border: [true, false, true, true]},
                    {text:'TIPO DE CONTE.',fontSize:8,fillColor: '#eeeeee', bold:true,border: [true, false, true, true]},
                ],
                [
                    {text:output?.outputBig.number_factura, fontSize:8}, 
                    {text:output?.outputBig.number_precinto, fontSize:8}, 
                    {text:output?.outputBig.number_container, fontSize:8}, 
                    {text:output?.outputBig.type_container, fontSize:8}, 
                ]
            ]
        }
    } : {},
    output?.outputBig?.poliza_seguro ? {
        style: 'tableExample',
        table: {
            widths: ['*'],
            body: [
                [
                    {text:'PÓLIZA DE SEGURO', fontSize:8 ,fillColor: '#eeeeee', bold:true,border: [true, false, true, true]}, 
                ],
                [
                    {text:output?.outputBig.number_factura, fontSize:8}, 
                ]
            ]
        }
    } : {},
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
            { text: `Responsable de almacén` , style: 'text',alignment: 'center' },
            { text: `Cliente`,style: 'text',alignment: 'center' },
        ]
    },
];

module.exports = {
    generatePdfReports,
    generateExcelReports,
    generatePdfDetailsReports,
    generateExcelDetailsReports,
    printOutputVoucher
}