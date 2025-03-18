const { AccountsReceivable, AbonosAccountsReceivableMultiple} = require('../../../database/config');
const { Op } = require("sequelize");
const { getNumberDecimal } = require("../../../helpers/company");
const path = require('path');
const fs = require('fs');
const imagePath = path.join(__dirname, '../../../../uploads/logo.png');
const moment = require('moment');
moment.locale('es'); 
const NumeroALetras = require("../../../helpers/numeros-aletras");
const fonts = require('../../../helpers/generator-pdf/fonts');
const styles = require('../../../helpers/generator-pdf/styles');
const PdfPrinter = require('pdfmake');


const printAbonoMultipleAccountReceivableVoucher = async (req = request, res = response) =>{
    try {
        const { id_abono_account_receivable_multiple } = req.params;
        const abono_account_receivable = await AbonosAccountsReceivableMultiple.findByPk(id_abono_account_receivable_multiple,{
            include: [ 
                { association: 'client'},
                { association: 'sucursal'}
            ]
        });
        const accountsReceivables = await AccountsReceivable.findAll({order: [['id','ASC']], where: {id: {[Op.in]: abono_account_receivable.ids_account_receivables }}, 
            include: [ 
                { association: 'sucursal', include:{ association: 'company'}},
                { association: 'output', include: [
                        { association: 'detailsOutput', 
                            include: [
                                {   association: 'product',
                                    include: [{ association:'unit'}]
                                }
                            ]
                        },
                    ]
                },
                {association: 'abonosAccountsReceivable'}
            ]
        });
        const decimal = await getNumberDecimal();
        let dataPdf = dataPdfReturnAbonoAccountReceivableMultipleVoucher(abono_account_receivable,accountsReceivables[0],decimal); //PDF 
        const saldoTotal = {
            acuentaTotal: 0,
            saldoTotal: 0,
            payIn: abono_account_receivable.type_payment
        }
        accountsReceivables.forEach(accountsReceivable => {
            let quantity_total = 0;
            let units = [];
            let tableData = [];
            accountsReceivable.output.detailsOutput.forEach(detail => {
                quantity_total+= Number(detail?.quantity);
                if (!units.includes(detail?.product?.unit.siglas)) {
                    units.push(detail?.product?.unit.siglas);
                }
                tableData.push([
                    {text:detail?.product?.cod, fontSize:8}, 
                    {text:detail?.product?.name, fontSize:8}, 
                    {text:detail?.quantity, fontSize:8, alignment: 'center'}, 
                    {text:detail?.product?.unit?.siglas, fontSize:8, alignment: 'center'}, 
                    {text:Number(detail?.price).toFixed(decimal), fontSize:8, alignment: 'right'},  
                    {text:Number(detail?.total).toFixed(decimal), fontSize:8, alignment: 'right'}, 
                ]);

            });
            const footer = [
                [
                    {text:'',colSpan: 2, border:[false,false,false,false]},
                    '',
                    {text: quantity_total,  fontSize:8, alignment:'center'},
                    {text: units.join(','), fontSize:8, alignment:'center'},
                    {   border:[false,false,false,false],
                        text: ``, colSpan: 2,fontSize:8,
                    },
                ],
            ]
            const abono_in_pay = accountsReceivable.abonosAccountsReceivable.find(abono => 
                abono_account_receivable.dataValues.ids_abonos_receivables.includes(abono.id)
            );
            saldoTotal.acuentaTotal = Number(saldoTotal.acuentaTotal) + Number(abono_in_pay.monto_abono);
            saldoTotal.saldoTotal   = Number(saldoTotal.saldoTotal) + Number(abono_in_pay.restante_credito).toFixed(decimal);
            dataPdf.push(...addTableInputAbonosMultiple(tableData,footer,accountsReceivable,abono_in_pay,decimal));
        });
        dataPdf.push(...addFooterAbonosMultiple(abono_account_receivable,saldoTotal,decimal));
      
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
        const pathImage = path.join(__dirname, `../../../../uploads/none-img.jpg`);
        return res.sendFile(pathImage);
    }
}

const dataPdfReturnAbonoAccountReceivableMultipleVoucher = (abono_account_receivable,accountsReceivable,decimal) => [
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
    {   text: `${accountsReceivable?.sucursal?.cellphone ?? '-'}`, style: 'text',
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
    { text: moment(abono_account_receivable.date_abono).format('dddd, D [de] MMMM [de] YYYY, h:mm:ss a'),  style: 'fechaDoc', absolutePosition: {  y: 40 }},
    { text: 'COMPROBANTE ABONO', style: 'title',bold:true , fontSize:16},
    { text: 'RECIBÍ DE:', style: 'datos_person', bold:true ,fontSize:10 },
    {
        columns: [
            { text: `Nombre:`, bold:true ,style: 'text',width: 60, },
            { text: `${abono_account_receivable?.client?.full_names ?? '-'}`, style: 'text',  },
            { text: `Nro. Nit / Ci:`, bold:true ,style: 'text',width: 85, },
            { text: `${abono_account_receivable?.client?.number_document ?? '-'}`, style: 'text',  },
        ]
    },
    {
        margin: [0,3,0,0],
        columns: [
            { text: `La suma de:`, bold:true ,style: 'text',width: 60, },
            { text: `Bs. ${Number(abono_account_receivable.monto_abono).toFixed(decimal)} -  ${NumeroALetras(Number(abono_account_receivable.monto_abono).toFixed(decimal))}`, style: 'text',  },
            { text: `Por concepto de:`, bold:true, style: 'text',width: 85,  },
            { text: `${abono_account_receivable.comments ?? '-'}`,  style: 'text',  },
        ]
    },
];

const addTableInputAbonosMultiple = (tableData,footer,accountsReceivable,abono_in_pay,decimal) => {
    return [
        {
            margin: [0,8,0,0],
            alignment: 'right',
            columns: [
                { width: '25%', columns: [{ text: '' }]},
                {
                    width: '25%',
                    columns: [
                    { text: 'Venta Nº ', style: 'datos_person', bold: true, fontSize: 10, alignment: 'right', width: 55 },
                    { text: accountsReceivable.output.cod,     style: 'datos_person', fontSize: 10,  alignment: 'left'}
                    ]
                },
                {
                    width: '20%',
                    columns: [
                    { text: 'A cuenta:', style: 'datos_person', bold: true, fontSize: 10, alignment: 'right', width: 50 },
                    { text: Number(abono_in_pay.monto_abono).toFixed(decimal), style: 'datos_person', fontSize: 10,alignment: 'left' }
                    ]
                },
                {
                    width: '20%',
                    columns: [
                    { text: 'Saldo:',   style: 'datos_person', bold: true, fontSize: 10, alignment: 'right', width: 50 },
                    { text: Number(abono_in_pay.restante_credito).toFixed(decimal),     style: 'datos_person', fontSize: 10,alignment: 'left' }
                    ]
                }
            ],
            columnGap: 1
          },
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
                    ],
                    ...tableData,
                    ...footer
                ]
            }
        },
    ]
}

const addFooterAbonosMultiple = (abono_account_receivable,saldoTotal,decimal) => {
    return [
        {
            margin: [0,3,0,0],
            columns: [
                { text: `A cuenta:`, bold:true ,style: 'text',width: 80, },
                { text: `${Number(saldoTotal.acuentaTotal).toFixed(decimal)}`, style: 'text',  },
                { text: `Saldo Total:`, bold:true, style: 'text',width: 58,  },
                { text: `${Number(saldoTotal.saldoTotal).toFixed(decimal)}`,  style: 'text',  },
                { text: `Pago con:`, bold:true, style: 'text',width: 70,  },
                { text: `${saldoTotal.payIn}`,  style: 'text',  },
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
                { text: `${abono_account_receivable?.client?.full_names}` , style: 'text',alignment: 'center' },
                { text: `${abono_account_receivable.sucursal.name}`,style: 'text',alignment: 'center' },
            ]
        },
    ]
}


module.exports = {
    printAbonoMultipleAccountReceivableVoucher
}