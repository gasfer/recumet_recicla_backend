const { AccountsPayable, AbonosAccountsPayableMultiple, AbonosAccountsPayable} = require('../../../database/config');
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


const printAbonoMultipleAccountPayableVoucher = async (req = request, res = response) =>{
    try {
        const { id_abono_account_payable_multiple } = req.params;
        const abono_account_payable = await AbonosAccountsPayableMultiple.findByPk(id_abono_account_payable_multiple,{
            include: [ 
                { association: 'provider'},
                { association: 'sucursal'},
                { association: 'abonosMultipleDestination' },
                { association: 'abonosMultipleOrigin' },
            ]
        });
        const accountsPayables = await AccountsPayable.findAll({order: [['id','ASC']],where: {id: {[Op.in]: abono_account_payable.ids_account_payables }}, 
            include: [ 
                { association: 'sucursal', include:{ association: 'company'}},
                { association: 'input', include: [
                        { association: 'detailsInput', 
                            include: [
                                {   association: 'product',
                                    include: [{ association:'unit'}]
                                }
                            ]
                        },
                    ]
                },
                {
                    association: 'abonosAccountsPayable',
                },
            ]
        });
        const decimal = await getNumberDecimal();
        let dataPdf = dataPdfReturnAbonoAccountPayableMultipleVoucher(abono_account_payable,accountsPayables[0],decimal); //PDF 
        const saldoTotal = {
            acuentaTotal: 0,
            saldoTotal: 0,
            payIn: abono_account_payable.type_payment
        }
        accountsPayables.forEach(accountsPayable => {
            let quantity_total = 0;
            let units = [];
            let tableData = [];
            accountsPayable.input.detailsInput.forEach(detail => {
                quantity_total+= Number(detail?.quantity);
                if (!units.includes(detail?.product?.unit.siglas)) {
                    units.push(detail?.product?.unit.siglas);
                }
                tableData.push([
                    {text:detail?.product?.cod, fontSize:8}, 
                    {text:detail?.product?.name, fontSize:8}, 
                    {text:detail?.quantity, fontSize:8, alignment: 'center'}, 
                    {text:detail?.product?.unit?.siglas, fontSize:8, alignment: 'center'}, 
                    {text:Number(detail?.cost).toFixed(decimal), fontSize:8, alignment: 'right'},  
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
            const abono_in_pay = accountsPayable.abonosAccountsPayable.find(abono => 
                abono_account_payable.dataValues.ids_abonos_payables.includes(abono.id)
            );
            saldoTotal.acuentaTotal = Number(saldoTotal.acuentaTotal) + Number(abono_in_pay.monto_abono);
            saldoTotal.saldoTotal   = Number(saldoTotal.saldoTotal) + Number(abono_in_pay.restante_credito).toFixed(decimal);
            dataPdf.push(...addTableInputAbonosMultiple(tableData,footer,accountsPayable,abono_in_pay,decimal));
        });
        dataPdf.push(...addFooterAbonosMultiple(abono_account_payable,saldoTotal,decimal));
      
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

const dataPdfReturnAbonoAccountPayableMultipleVoucher = (abono_account_payable,accountsPayable,decimal) => [
    {
        image: 'data:image/png;base64,'+ fs.readFileSync(imagePath,'base64'),
        width: 60,
        absolutePosition: { x:30, y: 15 }
    },
    {   text: accountsPayable.sucursal.name, style: 'text',
        absolutePosition: { x:97, y: 25 }
    },
    {   text: 'NIT:', bold:true, style: 'text',
        absolutePosition: { x:97, y: 35 }
    },
    {   text: `${accountsPayable.sucursal.company.nit}`, style: 'text',
        absolutePosition: { x:120, y: 35 }
    },
    {   text: 'TELÉFONO:',bold:true, style: 'text',
        absolutePosition: { x:97, y: 45 }
    },
    {   text: `${accountsPayable?.sucursal?.cellphone ?? '-'}`, style: 'text',
        absolutePosition: { x:155, y: 45 }
    },
    {   text: 'EMAIL:', bold:true, style: 'text',
        absolutePosition: { x:97, y: 55 }
    },
    {   text: `${accountsPayable.sucursal.email}`, style: 'text',
        absolutePosition: { x:133, y: 55 }
    },
    { text: 'CUENTA: ' + accountsPayable.cod, style: 'fechaDoc', absolutePosition: {  y: 30 }
    },
    { text: moment(abono_account_payable.date_abono).format('dddd, D [de] MMMM [de] YYYY, h:mm:ss a'),  style: 'fechaDoc', absolutePosition: {  y: 40 }},
    { text: 'COMPROBANTE ABONO', style: 'title',bold:true , fontSize:16},
    { text: 'ENTREGUE A:', style: 'datos_person', bold:true ,fontSize:10 },
    {
        columns: [
            { text: `Nombre:`, bold:true ,style: 'text',width: 60, },
            { text: `${abono_account_payable?.provider?.full_names ?? '-'}`, style: 'text',  },
            { text: `Nro. Nit:`, bold:true ,style: 'text',width: 85, },
            { text: `${abono_account_payable?.provider?.number_document ?? '-'}`, style: 'text',  },
        ]
    },
    {
        margin: [0,3,0,0],
        columns: [
            { text: `La suma de:`, bold: true, style: 'text', width: 60 },
            { 
                stack: [
                    {
                        table: {
                            widths: ['*'],
                            body: [[
                                {
                                    text: `Bs. ${Number(abono_account_payable.monto_abono).toFixed(decimal)}`,
                                    style: 'text',
                                    fontSize: 10,
                                    margin: [1, 1, 1, 1],
                                    fillColor: '#eeeeee'
                                }
                            ]]
                        },
                        layout: {
                            hLineColor: () => 'black',
                            vLineColor: () => 'black',
                            hLineWidth: () => 1,
                            vLineWidth: () => 1
                        }
                    },
                    {
                        text: NumeroALetras(Number(abono_account_payable.monto_abono).toFixed(decimal)),
                        style: 'text',
                        fontSize: 9,
                        margin: [0, 0, 0, 0]
                    }
                ]
            },
            { text: `Por concepto de:`, bold:true, style: 'text',width: 85,  },
            { text: `${abono_account_payable.comments ?? '-'}`,  style: 'text',  },
        ]
    },
];

const addTableInputAbonosMultiple = (tableData, footer, accountsPayable, abono_in_pay, decimal) => {
    const quantity_total = tableData.reduce((sum, row) => sum + parseFloat(row[2]?.text || 0), 0);
    const totalImporte = tableData.reduce((sum, row) => sum + parseFloat(row[5]?.text || 0), 0);
    const units = [...new Set(tableData.map(row => row[3]?.text || '-'))];

    const unifiedTotalRow = [
        { text: '', colSpan: 2, border: [false, false, false, false] }, '',
        { text: quantity_total, alignment: 'center', fontSize: 9, bold: true },
        { text: units.join(','), alignment: 'center', fontSize: 9 },
        { text: 'TOTAL:', alignment: 'right', bold: true, fontSize: 9 },
        { text: totalImporte.toFixed(decimal), alignment: 'right', bold: true, fontSize: 9 }
    ];

    return [
        {
            margin: [0, 8, 0, 0],
            alignment: 'right',
            columnGap: 2,
            columns: [
                {
                    width: '25%',
                    columns: [
                        { text: `P/${accountsPayable.input.type_registry} NRO:`, bold: true, style: 'text', width: 75 },
                        {
                            table: {
                                widths: ['*'],
                                body: [[
                                    {
                                        text: `${accountsPayable.input.registry_number}`,
                                        style: 'text',
                                        fontSize: 10,
                                        alignment: 'center',
                                        margin: [0, 0, 0, 0],
                                        fillColor: '#eeeeee'
                                    }
                                ]]
                            },
                            layout: {
                                hLineColor: () => 'black',
                                vLineColor: () => 'black',
                                hLineWidth: () => 1,
                                vLineWidth: () => 1
                            }
                        }
                    ]
                },
                {
                    width: '25%',
                    columns: [
                        { text: 'Compra Nº', style: 'datos_person', bold: true, fontSize: 10, alignment: 'right', width: 60 },
                        { text: accountsPayable.input.cod, style: 'datos_person', fontSize: 10, alignment: 'left' }
                    ]
                },
                {
                    width: '25%',
                    columns: [
                        { text: 'A cuenta:', style: 'datos_person', bold: true, fontSize: 10, alignment: 'right', width: 60 },
                        {
                            table: {
                                widths: ['*'],
                                body: [[
                                    {
                                        text: Number(abono_in_pay.monto_abono).toFixed(decimal),
                                        alignment: 'center',
                                        fontSize: 10,
                                        margin: [0, 0, 0, 0],
                                        fillColor: '#eeeeee'
                                    }
                                ]]
                            },
                            layout: {
                                hLineColor: () => 'black',
                                vLineColor: () => 'black',
                                hLineWidth: () => 1,
                                vLineWidth: () => 1
                            }
                        }
                    ]
                },
                {
                    width: '25%',
                    columns: [
                        { text: 'Saldo:', style: 'datos_person', bold: true, fontSize: 10, alignment: 'right', width: 50 },
                        {
                            table: {
                                widths: ['*'],
                                body: [[
                                    {
                                        text: Number(abono_in_pay.restante_credito).toFixed(decimal),
                                        alignment: 'center',
                                        fontSize: 10,
                                        margin: [0, 0, 0, 0],
                                        fillColor: '#eeeeee'
                                    }
                                ]]
                            },
                            layout: {
                                hLineColor: () => 'black',
                                vLineColor: () => 'black',
                                hLineWidth: () => 1,
                                vLineWidth: () => 1
                            }
                        }
                    ]
                }
                
            ]
        },
        {
            style: 'tableExample',
            table: {
                widths: [55, '*', 50, 50, 50, 50],
                body: [
                    [
                        { text: 'CÓDIGO', fontSize: 8, fillColor: '#eeeeee', bold: true },
                        { text: 'DETALLE', fontSize: 8, fillColor: '#eeeeee', bold: true },
                        { text: 'CANT.', alignment: 'center', fontSize: 8, fillColor: '#eeeeee', bold: true },
                        { text: 'UND', alignment: 'center', fontSize: 8, fillColor: '#eeeeee', bold: true },
                        { text: 'P.U.', alignment: 'center', fontSize: 8, fillColor: '#eeeeee', bold: true },
                        { text: 'IMPORTE', alignment: 'center', fontSize: 8, fillColor: '#eeeeee', bold: true },
                    ],
                    ...tableData,
                    unifiedTotalRow
                ]
            }
        },
    ];
}

const addFooterAbonosMultiple = (abono_account_payable,saldoTotal,decimal) => {
    return [
        {
            margin: [0,3,0,0],
            columns: [
                { text: `A cuenta:`, bold:true ,style: 'text',width: 80 },
                {
                    table: {
                        widths: ['*'],
                        body: [[
                            {
                                text: Number(saldoTotal.acuentaTotal).toFixed(decimal),
                                style: 'text',
                                alignment: 'center',
                                margin: [0, 0, 0, 0],
                                fillColor: '#eeeeee'
                            }
                        ]]
                    },
                    layout: {
                        hLineColor: () => 'black',
                        vLineColor: () => 'black',
                        hLineWidth: () => 1,
                        vLineWidth: () => 1
                    }
                },
                { text: `Saldo Total:`, bold:true, style: 'text',width: 58 },
                {
                    table: {
                        widths: ['*'],
                        body: [[
                            {
                                text: Number(saldoTotal.saldoTotal).toFixed(decimal),
                                alignment: 'center',
                                style: 'text',
                                margin: [0, 0, 0, 0],
                                fillColor: '#eeeeee'
                            }
                        ]]
                    },
                    layout: {
                        hLineColor: () => 'black',
                        vLineColor: () => 'black',
                        hLineWidth: () => 1,
                        vLineWidth: () => 1
                    }
                },
                { text: `Pago con:`, bold:true, style: 'text',width: 70 },
                { text: `${saldoTotal.payIn}`,  style: 'text' },
            ]
        },
        {
            margin: [0, 3, 0, 0],
            columns: [
              { 
                  text: `ORIGEN:`,
                  bold: true,
                  style: 'text',
                  width: 70,
                  alignment: 'left'
              },
              {
                  table: {
                      widths: ['*'],
                      body: [[
                          {
                              text: abono_account_payable.type_payment != 'EFECTIVO'
                                ? `${abono_account_payable.abonosMultipleOrigin?.name ?? '-'} | Cuenta: ${abono_account_payable.account_origin ?? ''}`
                                : '-',
                              style: 'text',
                              fontSize: 10,       
                              alignment: 'left',
                              margin: [0,0,0,0] 
                          }
                      ]]
                  },
                  layout: 'noBorders', 
                  width: 200
              },
              { 
                  text: `DESTINO:`,
                  bold: true,
                  style: 'text',
                  width: 80,
                  alignment: 'left'
              },
              {
                  table: {
                      widths: ['*'],
                      body: [[
                          {
                              text: abono_account_payable.type_payment != 'EFECTIVO'
                                ? `${abono_account_payable.abonosMultipleDestination.name} | Cuenta: ${abono_account_payable.account_output}` 
                                : '-',
                              style: 'text',
                              fontSize: 10,       
                              alignment: 'left',
                              margin: [0,0,0,0]
                          }
                      ]]
                  },
                  layout: 'noBorders', 
                  width: 200
              }
            ]
        },
        {
            margin: [0,15,0,0],
            columns: [
                { text: 'TOTAL MONTO ABONADO:', bold: true, style: 'text', alignment: 'right', width: '80%' },
                {
                    table: {
                        widths: ['*'],
                        body: [[
                            {
                                text: Number(saldoTotal.acuentaTotal).toFixed(decimal),
                                alignment: 'center',
                                bold: true,
                                margin: [0, 0, 0, 0],
                                fillColor: '#eeeeee'
                            }
                        ]]
                    },
                    layout: {
                        hLineColor: () => 'black',
                        vLineColor: () => 'black',
                        hLineWidth: () => 1,
                        vLineWidth: () => 1
                    },
                    width: '20%'
                }
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
                { text: `${abono_account_payable?.provider?.full_names}` , style: 'text',alignment: 'center' },
                { text: `${abono_account_payable.sucursal.name}`,style: 'text',alignment: 'center' },
            ]
        }
    ];
};

module.exports = {
    printAbonoMultipleAccountPayableVoucher
}