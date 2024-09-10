const { Op } = require("sequelize");
const { AccountsReceivable, AbonosAccountsReceivable } = require('../../database/config');
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
const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',hour: "numeric",
minute: "numeric",
second: "numeric", };
moment.locale('es'); 
const NumeroALetras = require("../../helpers/numeros-aletras");

const generatePdfReports = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2} = req.query;
        const accounts_receivables = await returnDataAccountReceivable(req.query);
        let dataPdf = dataPdfReturn(req.userAuth); //PDF 
        const decimal = await getNumberDecimal();
        let total_abonados = 0, total_restante=0,total_account = 0;
        accounts_receivables.forEach(account_receivable => {
            const tableData = [
                {text:account_receivable?.output.cod, fontSize:8}, 
                {text:account_receivable?.output?.type_registry, fontSize:8}, 
                {text:moment(account_receivable?.date_credit).format('DD/MM/YYYY HH:mm:ss'), fontSize:8}, 
                {text:Number(account_receivable?.monto_abonado).toFixed(decimal), fontSize:8}, 
                {text:Number(account_receivable?.monto_restante).toFixed(decimal), fontSize:8}, 
                {text:Number(account_receivable?.total).toFixed(decimal), fontSize:8}, 
                {text:account_receivable?.client?.full_names, fontSize:8}, 
                {text:account_receivable?.sucursal?.name, fontSize:8}, 
            ];
            total_abonados+=Number(account_receivable?.monto_abonado);
            total_restante+=Number(account_receivable?.monto_restante);
            total_account+=Number(account_receivable?.total);
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            { colSpan: 3,text:'' },
            {},
            {},
            {text: Number(total_abonados).toFixed(decimal),fontSize:9},
            {text: Number(total_restante).toFixed(decimal),fontSize:9},
            {text: Number(total_account).toFixed(decimal),fontSize:9},
            { colSpan: 2,text:''},
            {},
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
    { text: 'REPORTE DE CUENTAS POR COBRAR', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Reporte generados con los parámetros establecidos', alignment:'center',absolutePosition: {  y: 73 } },
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [50,80,80,55,55,55,'*',70],
            body: [
                [
                    {text:'VENTA', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO DE REGISTRO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA CREDITO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'MONTO ABONADO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'MONTO RESTANTE', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TOTAL', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CLIENTE', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'SUCURSAL', fontSize:8,fillColor: '#eeeeee', bold:true}, 
                ]
            ],
            layout: 'lightHorizontalLines'
        }
    }
];

const generateExcelReports = async (req = request, res = response) => {
  try {
        const accounts_receivables = await returnDataAccountReceivable(req.query);
        let accounts_receivables_data = [];
        if(accounts_receivables.length == 0) {
            accounts_receivables_data.push({
                VENTA : '',
                TIPO_DE_REGISTRO : '',
                FECHA_CREDITO : '',
                MONTO_ABONADO : '',
                MONTO_RESTANTE : '',
                TOTAL : '',
                CLIENTE : '',
                SUCURSAL : '', 
            });
        }
        accounts_receivables.forEach(account_receivable => {
            const tableData = {
                VENTA : account_receivable?.output.cod,
                TIPO_DE_REGISTRO : account_receivable?.output?.type_registry,
                FECHA_CREDITO : moment(account_receivable?.date_credit).format('DD/MM/YYYY HH:mm:ss'),
                MONTO_ABONADO :  Number(account_receivable?.monto_abonado),
                MONTO_RESTANTE : Number(account_receivable?.monto_restante),
                TOTAL :          Number(account_receivable?.total),
                CLIENTE : account_receivable?.client?.full_names,
                SUCURSAL : account_receivable?.sucursal?.name, 
            }
            accounts_receivables_data.push(tableData);
        });
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Cuentas por cobrar`);
        // Agregar encabezados
        const headers = Object.keys(accounts_receivables_data[0]);
        worksheet.addRow(headers);
        // Agregar datos
        accounts_receivables_data.forEach(data => {
            const row = [];
            headers.forEach(header => {
                row.push(data[header]);
            });
            worksheet.addRow(row);
        });
        worksheet.getColumn('A').width = 10; 
        worksheet.getColumn('B').width = 20; 
        worksheet.getColumn('C').width = 30; 
        worksheet.getColumn('D').width = 20; 
        worksheet.getColumn('E').width = 20; 
        worksheet.getColumn('F').width = 20; 
        worksheet.getColumn('G').width = 40; 
        worksheet.getColumn('H').width = 30; 
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=cuentas-por-cobrar.xlsx`);
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

const returnDataAccountReceivable = async (params) => {
    const {status_account, id_client, id_sucursal,type_registry,filterBy, date1, date2,orderNew} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"AccountsReceivable"."createdAt"');
    const optionsDb = {
        order: [orderNew],
        where: {
            [Op.and]: [
                id_client      ? { id_client      } : {},
                id_sucursal   ? { id_sucursal   } : {},
                status_account ? { status_account   } : {},
                { status: true },
                { createdAt: whereDate }
            ]
        },
        include: [ 
            { association: 'sucursal',attributes: ['name'] },
            { association: 'client', attributes: ['full_names']}, 
            { association: 'output',
                where: { [Op.and]: [
                    type_registry ? { type_registry } : {},
                ]} ,
                include:[  
                    { association: 'scale', attributes: ['name']},
                    { association: 'user', attributes: ['full_names','number_document']},
                ]
            },
        ]
    };
    return await AccountsReceivable.findAll(optionsDb);
}


const printAbonoAccountReceivableVoucher = async (req = request, res = response) =>{
    try {
        const { id_abono_account_receivable } = req.params;
        const abono_account_receivable = await AbonosAccountsReceivable.findByPk(id_abono_account_receivable,{
            include: [ 
                { association: 'accountsReceivable', include: [
                    { association: 'sucursal', include:{ association: 'company'}},
                    { association: 'output', include: [
                        { association: 'detailsOutput', 
                            include: [
                                {   association: 'product',
                                    include: [{ association:'unit'}]
                                }
                            ]
                        },
                        { association: 'client'},
                    ]}
                ]},
            ]
        });
        const decimal = await getNumberDecimal();
        let dataPdf = dataPdfReturnAbonoAccountReceivableVoucher(abono_account_receivable,abono_account_receivable.accountsReceivable,decimal); //PDF 
        let quantity_total = 0;
        let units = [];
        abono_account_receivable.accountsReceivable.output.detailsOutput.forEach(detail => {
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
                    text: `SUB TOTAL: ${Number(abono_account_receivable.accountsReceivable.output.sub_total).toFixed(decimal)}`, colSpan: 2,fontSize:8,
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
                    text: `DESCUENTO: ${Number(abono_account_receivable.accountsReceivable.output.discount).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                    fillColor: '#eeeeee',alignment:'right', 
                    bold:true,
                },
            ],
            [
                {
                    text:'SON: ' + NumeroALetras(Number(abono_account_receivable.accountsReceivable.output.total).toFixed(decimal)),
                    style: 'sonBs', fontSize:8, colSpan: 4, border:[true,false,true,true],
                },
                '',
                '',
                '',
                {   border:[true,false,true,true],
                    text: `TOTAL: ${Number(abono_account_receivable.accountsReceivable.output.total).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                    fillColor: '#eeeeee',alignment:'right', 
                    bold:true,
                },
            ]
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

const dataPdfReturnAbonoAccountReceivableVoucher = (abono_account_receivable,accountsReceivable,decimal) => [
    {
        image: 'data:image/png;base64,'+ fs.readFileSync(imagePath,'base64'),
        width: 60,
        absolutePosition: { x:30, y: 15 }
    },
    {   text: accountsReceivable.sucursal.name, style: 'text',
        absolutePosition: { x:97, y: 25 }
    },
    {   text: 'NIT:', bold:true, style: 'text',
        absolutePosition: { x:97, y: 35 }
    },
    {   text: `${accountsReceivable.sucursal.company.nit}`, style: 'text',
        absolutePosition: { x:120, y: 35 }
    },
    {   text: 'TELÉFONO:',bold:true, style: 'text',
        absolutePosition: { x:97, y: 45 }
    },
    {   text: `${accountsReceivable.sucursal.cellphone}`, style: 'text',
        absolutePosition: { x:155, y: 45 }
    },
    {   text: 'EMAIL:', bold:true, style: 'text',
        absolutePosition: { x:97, y: 55 }
    },
    {   text: `${accountsReceivable.sucursal.email}`, style: 'text',
        absolutePosition: { x:133, y: 55 }
    },
    { text: 'CUENTA: ' + accountsReceivable.cod, style: 'fechaDoc',
      absolutePosition: {  y: 30 }
    },
    { text: new Date(abono_account_receivable.date_abono).toLocaleDateString('es-ES', options),  style: 'fechaDoc', absolutePosition: {  y: 40 }},
    { text: 'COMPROBANTE ABONO', style: 'title',bold:true , fontSize:16},
    { text: 'RECIBÍ DE:', style: 'datos_person', bold:true ,fontSize:10 },
    {
        columns: [
            { text: `Nombre:`, bold:true ,style: 'text',width: 60, },
            { text: `${accountsReceivable.output?.client?.full_names ?? '-'}`, style: 'text',  },
            { text: `Nro. Nit / Ci:`, bold:true ,style: 'text',width: 85, },
            { text: `${accountsReceivable.output?.client?.number_document ?? '-'}`, style: 'text',  },
        ]
    },
    {
        margin: [0,3,0,0],
        columns: [
            { text: `La suma de:`, bold:true ,style: 'text',width: 60, },
            { text: `Bs. ${Number(abono_account_receivable.monto_abono).toFixed(decimal)} -  ${NumeroALetras(Number(abono_account_receivable.monto_abono).toFixed(decimal))}`, style: 'text',  },
            { text: `Por concepto de:`, bold:true, style: 'text',width: 85,  },
            { text: `Abono crédito ${accountsReceivable.cod} - Venta ${accountsReceivable.output.cod}, en fecha: ` + moment(abono_account_receivable.date_abono).format('DD/MM/YYYY HH:mm:ss'),  style: 'text',  },
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
    {
        margin: [0,3,0,0],
        columns: [
            { text: `P/${accountsReceivable.output.type_registry} NRO:`, bold:true ,style: 'text',width: 80, },
            { text: `${accountsReceivable.output.number_registry}`, style: 'text',  },
            { text: `A CUENTA:`, bold:true, style: 'text',width: 58,  },
            { text: `${Number(abono_account_receivable.total_abonado).toFixed(decimal)}`,  style: 'text',  },
            { text: `SALDO:`, bold:true, style: 'text',width: 70,  },
            { text: `${Number(abono_account_receivable.restante_credito).toFixed(decimal)}`,  style: 'text',  },
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
            { text: `${accountsReceivable.sucursal.name}`,style: 'text',alignment: 'center' },
            { text: `${accountsReceivable.output?.client?.full_names}` , style: 'text',alignment: 'center' },
        ]
    },
];


const printAccountReceivableVoucher = async (req = request, res = response) =>{
    try {
        const { id_account_receivable } = req.params;
        const account_receivable = await AccountsReceivable.findByPk(id_account_receivable,{
            include: [ 
                { association: 'sucursal', include:{ association: 'company'} },
                { association: 'client', attributes: ['full_names']},
                { association: 'output',
                    include:[  
                        { association: 'detailsOutput', 
                            include: [
                                {   association: 'product',
                                    include: [{ association:'unit'}]
                                }
                            ]
                        },
                    ]
                },
                { association: 'abonosAccountsReceivable', required:false,where: {status:true}, include:[  
                    { association: 'user', attributes: ['full_names','number_document']},
                ]},
            ]
        });
        const decimal = await getNumberDecimal();
        let dataPdf = dataPdfReturnAccountPayableVoucher(account_receivable,decimal); //PDF 
        let quantity_total = 0;
        let units = [];
        account_receivable.output.detailsOutput.forEach(detail => {
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
            dataPdf[16].table.body.push(tableData);
        });
        dataPdf[16].table.body.push(
            [
                {text:'',colSpan: 2, border:[true,false,false,false]},
                '',
                {text: quantity_total,  fontSize:8, alignment:'center'},
                {text: units.join(','), fontSize:8, alignment:'center'},
                {   border:[true,false,true,true],
                    text: `SUB TOTAL: ${Number(account_receivable.output.sub_total).toFixed(decimal)}`, colSpan: 2,fontSize:8,
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
                    text: `DESCUENTO: ${Number(account_receivable.output.discount).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                    fillColor: '#eeeeee',alignment:'right', 
                    bold:true,
                },
            ],
            [
                {
                    text:'SON: ' + NumeroALetras(Number(account_receivable.output.total).toFixed(decimal)),
                    style: 'sonBs', fontSize:8, colSpan: 4, border:[true,false,true,true],
                },
                '',
                '',
                '',
                {   border:[true,false,true,true],
                    text: `TOTAL: ${Number(account_receivable.output.total).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                    fillColor: '#eeeeee',alignment:'right', 
                    bold:true,
                },
            ]
        );
        account_receivable.abonosAccountsReceivable.forEach(abono => {
            const tableData = [
                {text:moment(abono.date_abono).format('DD/MM/YYYY HH:mm:ss'), fontSize:9}, 
                {text:Number(abono?.monto_abono).toFixed(decimal), fontSize:9,alignment: 'center'}, 
                {text:abono?.user.full_names, fontSize:8, alignment: 'length'}, 
                {text:Number(abono?.restante_credito).toFixed(decimal), fontSize:9, alignment: 'center'}, 
                {text:Number(abono?.total_abonado).toFixed(decimal), fontSize:9, alignment: 'center'},  
            ];
            dataPdf[18].table.body.push(tableData);
        });
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

const dataPdfReturnAccountPayableVoucher = (accountsReceivable,decimal) => [
    {
        image: 'data:image/png;base64,'+ fs.readFileSync(imagePath,'base64'),
        width: 60,
        absolutePosition: { x:30, y: 15 }
    },
    {   text: accountsReceivable.sucursal.name, style: 'text',
        absolutePosition: { x:97, y: 25 }
    },
    {   text: 'NIT:', bold:true, style: 'text',
        absolutePosition: { x:97, y: 35 }
    },
    {   text: `${accountsReceivable.sucursal.company.nit}`, style: 'text',
        absolutePosition: { x:120, y: 35 }
    },
    {   text: 'TELÉFONO:',bold:true, style: 'text',
        absolutePosition: { x:97, y: 45 }
    },
    {   text: `${accountsReceivable.sucursal.cellphone}`, style: 'text',
        absolutePosition: { x:155, y: 45 }
    },
    {   text: 'EMAIL:', bold:true, style: 'text',
        absolutePosition: { x:97, y: 55 }
    },
    {   text: `${accountsReceivable.sucursal.email}`, style: 'text',
        absolutePosition: { x:133, y: 55 }
    },
    { text: 'CUENTA: ' + accountsReceivable.cod, style: 'fechaDoc',
      absolutePosition: {  y: 30 }
    },
    { text: moment(accountsReceivable.date_credit).format('DD/MM/YYYY HH:mm:ss'),  style: 'fechaDoc', absolutePosition: {  y: 40 }},
    { text: `ESTADO DE CUENTA DE CREDITO ${accountsReceivable.cod}`, style: 'title',bold:true , fontSize:16},
    { text: 'DATOS:', style: 'datos_person', bold:true ,fontSize:10 },
    {
        columns: [
            { text: `Descripcion:`, bold:true ,style: 'text',width: 60, },
            { text: `${accountsReceivable.description ?? '-'}`, style: 'text',  },
            { text: `Cliente:`, bold:true ,style: 'text',width: 85, },
            { text: `${accountsReceivable.client?.number_document ?? ''} ${accountsReceivable?.client?.full_names}`, style: 'text',  },
        ]
    },
    {
        margin: [0,1,0,0],
        columns: [
            { text: `Fecha:`, bold:true ,style: 'text',width: 60, },
            { text:  moment(accountsReceivable.date_credit).format('DD/MM/YYYY HH:mm:ss'), style: 'text',  },
            { text: `Monto de crédito:`, bold:true, style: 'text',width: 85,  },
            { text: `${accountsReceivable.total}`,  fontSize:11, bold: true  },
        ]
    },
    {
        margin: [0,1,0,0],
        columns: [
            { text: `Estado:`, bold:true ,style: 'text' ,width: 60, },
            { text:  `CREDITO ${accountsReceivable.status_account}`, fontSize:11, bold: true  },
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
    { text: 'ABONOS:', style: 'datos_person',bold:true ,fontSize:10 },
    {
        style: 'tableExample',
        table: {
            widths: [90, 70, '*', 70,70],
            body: [
                [
                    {text:'FECHA, HORA ABONO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'MONTO ABONADO', fontSize:8,fillColor: '#eeeeee', bold:true}, 
                    {text:'ABONADO POR',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true},
                    {text:'RESTANTE HASTA FECHA',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true},
                    {text:'TOTAL ABONADO HASTA FECHA',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true}, 
                ]
            ]
        }
    },
    {
        margin: [0,3,0,0],
        columns: [
            { text: `TOTAL ABONADO:`, bold:true ,style: 'text',width: 120, },
            { text: `${Number(accountsReceivable.monto_abonado).toFixed(decimal)}`, fontSize:10,  },
            { text: `TOTAL RESTANTE:`, bold:true, style: 'text',width: 130,  },
            { text: `${Number(accountsReceivable.monto_restante).toFixed(decimal)}`,  fontSize:10,  },
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
            { text: `${accountsReceivable.sucursal.name}`,style: 'text',alignment: 'center' },
            { text: `${accountsReceivable.client?.full_names}` , style: 'text',alignment: 'center' },
        ]
    },
];

module.exports = {
    generatePdfReports,
    generateExcelReports,
    printAbonoAccountReceivableVoucher,
    printAccountReceivableVoucher
}