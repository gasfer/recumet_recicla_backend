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
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de ventas' });
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
        let dataPdf = dataPdfReturnOutputVoucher(output,output.sucursal,decimal); //PDF 
        const detailTableNode = dataPdf.find(node => node?.table?.widths?.length === 6) || dataPdf[4];
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
                {
                    border: [true, false, true, true],
                    text: `SUB TOTAL: ${Number(output.sub_total).toLocaleString('es-BO', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}`,
                    colSpan: 2,
                    fontSize: 8,
                    fillColor: '#dde3ea',
                    alignment: 'right',
                    bold: true
                }
            ],
            [
                {text:'',colSpan: 4, border:[true,false,false,false]},
                '',
                '',
                '',
                {   border:[true,false,true,true],
                    text: `DESCUENTO: ${Number(output.discount).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                    fillColor: '#dde3ea',alignment:'right', 
                    bold:true,
                },
            ],
            [
                {
                    text:'SON: ' + NumeroALetras(Number(output.total).toFixed(decimal)),
                    style: 'SonBs', fontSize:8, colSpan: 4, border:[true,false,true,true],
                },
                '',
                '',
                '',
                {
                    border: [true, false, true, true],
                    text: `TOTAL: ${Number(output.total).toLocaleString('es-BO', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}`,
                    colSpan: 2,
                    fontSize: 8,
                    fillColor: '#dde3ea',
                    alignment: 'right',
                    bold: true
                  }
            ]
        );
        if (output.type_output != 'VENTA' && output.type_output != 'OTRO') {
            const tableAccountsNode = dataPdf.find(node => node && node.table && node.table.widths && node.table.widths.length === 5);
            if (tableAccountsNode && output.accounts_receivable) {
                output.accounts_receivable.forEach(account => {
                    const tableData = [
                        {text:account?.cod, fontSize:8}, 
                        {text:moment(account?.date_credit).format('DD/MM/YYYY HH:mm:ss'), fontSize:8}, 
                        {text:account?.description, fontSize:8}, 
                        {text:Number(account?.total).toFixed(decimal), fontSize:8}, 
                        {text:Number(account?.monto_restante).toFixed(decimal), fontSize:8}, 
                    ];
                    tableAccountsNode.table.body.push(tableData);
                });
            }
        }
        if (output.status == 'ANULADO') {
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
        return res.status(500).json({ ok: false, msg: 'Error al generar el comprobante de venta' });
    }
}

const dataPdfReturnOutputVoucher = (output, sucursal, decimal) => [
    buildHeader({
        title: output.voucher === 'MENOR' ? 'NOTA DE VENTA' : 'NOTA DE DESPACHO',
        codePrefix: 'VENTA',
        codeValue: output.cod,
        dateLabel: 'Fecha',
        dateValue: moment(output.date_output).format('DD/MM/YYYY HH:mm:ss'),
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
            title: 'DATOS CLIENTE',
            rows: [
                { label: 'Nombre:', value: output?.client?.full_names || '-', labelWidth: 50 },
                { label: 'Nro. Nit:', value: output?.client?.number_document || '-', labelWidth: 50 },
                { label: 'Teléfono:', value: output?.client?.cellphone || '-', labelWidth: 50 },
                { label: 'Dirección:', value: output?.client?.direction || '-', labelWidth: 50 },
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
    output?.comments ? {   
        margin: [0, 3, 0, 0],
        columns: [
            { text: 'OBSERVACIONES:', bold: true, style: 'text', width: 90 },
            { text: `${output?.comments ?? ''}`, style: 'text', fontSize: 8 },
        ]
    } : { text: '' },
    {
        style: 'tableExample',
        table: {
            widths: ['*', '*', '*'],
            body: [
                [
                    { text: `P/${output.type_registry} NRO:`, fontSize: 8, fillColor: '#dde3ea', bold: true, border: [true, false, true, true] }, 
                    { text: 'BALANZA', fontSize: 8, fillColor: '#dde3ea', bold: true, border: [true, false, true, true] }, 
                    { text: 'TIPO DE VENTA', alignment: 'center', fontSize: 8, fillColor: '#dde3ea', bold: true, border: [true, false, true, true] },
                ],
                [
                    { text: output?.number_registry || '', fontSize: 8 }, 
                    { text: output?.scale?.name || '', fontSize: 8 }, 
                    { text: `${output.type_output === 'CONTADO' ? 'AL CONTADO' : 'A CREDITO'}`, fontSize: 8, alignment: 'center' }, 
                ]
            ]
        }
    },
    {
        margin: [0, 3, 0, 0],
        columns: [
            { text: `FORMA DE PAGO:`, bold: true, style: 'text', width: output.type_payment != 'EFECTIVO' ? 90 : 110 },
            { text: `${output.type_payment}`, style: 'text' },
            output.type_payment != 'EFECTIVO' ? { text: `CUENTA:`, bold: true, style: 'text', width: 53 } : {},
            output.type_payment != 'EFECTIVO' ? { text: `${output?.account_output}`, style: 'text' } : {}, 
            output.type_payment != 'EFECTIVO' ? { text: `BANCO:`, bold: true, style: 'text', width: 50 } : {},
            output.type_payment != 'EFECTIVO' ? { text: `${output?.bank?.name ?? '-'}`, style: 'text' } : {},
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
                    {text:output?.outputBig.number_contenedor, fontSize:8}, 
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
    buildClosingSection({
        signatures: [
            { role: 'Recibí conforme', name: 'Responsable de almacén' },
            { role: 'Entregue conforme', name: 'Cliente' },
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
    printOutputVoucher,
    dataPdfReturnOutputVoucher,
}