const { Op } = require("sequelize");
const { AccountsReceivable, AbonosAccountsReceivable,viewAbonosAccountReceivablesAll } = require('../../database/config');
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
const NumeroALetras = require("../../helpers/numeros-aletras");

const generatePdfReports = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2} = req.query;
        const accounts_receivables = await returnDataAccountReceivable(req.query);
        let dataPdf = dataPdfReturn(req.userAuth,accounts_receivables[0]?.sucursal?.name ?? '-'); //PDF 
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
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de cuentas por cobrar' });
    }
}

const dataPdfReturn = (auth,sucursal) => [
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
            widths: [50,80,80,55,55,55,'*'],
            body: [
                [
                    {text:'VENTA', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO DE REGISTRO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA CREDITO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'MONTO ABONADO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'MONTO RESTANTE', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TOTAL', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CLIENTE', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
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
    const whereDate = whereDateForType(filterBy,date1, date2, '"output"."date_output"');
    const orderList = (orderNew && Array.isArray(orderNew) && orderNew.length > 0 && orderNew[0])
        ? [orderNew]
        : [['id', 'DESC']];
    const optionsDb = {
        order: orderList,
        where: {
            [Op.and]: [
                id_client      ? { id_client      } : {},
                id_sucursal   ? { id_sucursal   } : {},
                status_account ? { status_account   } : {},
                { status: true },
            ]
        },
        include: [ 
            { association: 'sucursal',attributes: ['name'] },
            { association: 'client', attributes: ['full_names']}, 
            { association: 'output',
                where: { [Op.and]: [
                    type_registry ? { type_registry } : {},
                    { date_output: whereDate }
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


const generatePdfReportsAbonosAll = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2} = req.query;
        const accounts_receivables_abonos_all = await returnDataAccountReceivableAbonos(req.query);
        let dataPdf = dataPdfReturnAbonosAll(req.userAuth,accounts_receivables_abonos_all[0]?.sucursal?.name ?? '-'); //PDF 
        const decimal = await getNumberDecimal();
        let total_abonados = 0;
        accounts_receivables_abonos_all.forEach(account_receivable_abono => {
            const tableData = [
                {text:moment(account_receivable_abono?.date_abono).format('DD/MM/YYYY HH:mm:ss'), fontSize:8}, 
                {text:account_receivable_abono?.codes_output?.join(' \n '), fontSize:8}, 
                {text:account_receivable_abono?.client?.full_names, fontSize:8}, 
                {text:account_receivable_abono?.type_payment, fontSize:8}, 
                {text:Number(account_receivable_abono?.monto_abono).toFixed(decimal), fontSize:8}, 
                {text:account_receivable_abono?.comments, fontSize:8}, 
            ];
            total_abonados+=Number(account_receivable_abono?.monto_abono);
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            { colSpan: 4,text:'' },
            {},
            {},
            {},
            {text: Number(total_abonados).toFixed(decimal),fontSize:9},
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
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de abonos' });
    }
}

const generateExcelReportsAbonosAll = async (req = request, res = response) => {
    try {
          const accounts_receivable_abonos = await returnDataAccountReceivableAbonos(req.query);
          const decimal = await getNumberDecimal();
          let accounts_receivable_data = [];
          if(accounts_receivable_abonos.length == 0) {
            accounts_receivable_data.push({
                FECHA: '',
                VENTAS: '',
                CLIENTE: '',
                TIPO: '',
                PAGO: '',
                CONCEPTO: '',
              });
          }
          accounts_receivable_abonos.forEach(account_payable => {
              const tableData = {
                FECHA : moment(account_payable?.date_abono).format('DD/MM/YYYY HH:mm:ss'),
                VENTAS : account_payable?.codes_output?.join(' \n '),
                CLIENTE : account_payable.client?.full_names,
                TIPO : account_payable?.type_payment,
                PAGO : Number(account_payable?.monto_abono).toFixed(decimal),
                CONCEPTO :  account_payable.comments,
              }
              accounts_receivable_data.push(tableData);
          });
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet(`Cuentas por pagar`);
          // Agregar encabezados
          const headers = Object.keys(accounts_receivable_data[0]);
          worksheet.addRow(headers);
          // Agregar datos
          accounts_receivable_data.forEach(data => {
              const row = [];
              headers.forEach(header => {
                  row.push(data[header]);
              });
              worksheet.addRow(row);
          });
          worksheet.getColumn('B').alignment = { wrapText: true };
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

const dataPdfReturnAbonosAll = (auth,sucursal) => [
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
    { text: 'PAGOS REALIZADOS', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Reporte generados con los parámetros establecidos, SUCURSAL: '+sucursal, alignment:'center',absolutePosition: {  y: 73 } },
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [50,80,200,80,80,'*'],
            body: [
                [
                    {text:'FECHA', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'VENTAS', fontSize:8 ,fillColor: '#eeeeee', bold:true},
                    {text:'CLIENTE', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PAGO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CONCEPTO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                ]
            ],
            layout: 'lightHorizontalLines'
        }
    }
];

const returnDataAccountReceivableAbonos = async (params) => {
    const {id_provider,query, id_sucursal, filterBy, date1, date2,orderNew} = params;
    let {type} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"viewAbonosAccountReceivablesAll"."date_abono"');
    const where = {
        [Op.and]: [
            id_sucursal   ? { id_sucursal   } : {},
            id_provider   ? { id_provider   } : {},
            { date_abono: whereDate },
            type == 'codes_output' ?   {codes_output: {
                [Op.contains]: [query]
              } }: {}
        ]
    }
    if( type == 'codes_output') type = null;
    const optionsDb = {
        order: [orderNew],
        where,
        include: [ 
            { association: 'sucursal',attributes: ['name'] },
            { association: 'user',attributes: ['full_names'] },
            { association: 'client',attributes: ['full_names'] },
        ]
    };
    return await viewAbonosAccountReceivablesAll.findAll(optionsDb);
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
        const detailTableNode = dataPdf.find(node => node?.table?.widths?.length === 6) || dataPdf[4];
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
                    fillColor: '#eeeeee'
                },                  
                {text: units.join(','), fontSize:8, alignment:'center'},
                {
                    border: [true, false, true, true],
                    text: `SUB TOTAL: ${Number(abono_account_receivable.accountsReceivable.output.sub_total).toLocaleString('es-BO', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}`,
                    colSpan: 2,
                    fontSize: 8,
                    fillColor: '#eeeeee',
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
                {
                    border: [true, false, true, true],
                    text: `TOTAL: ${Number(abono_account_receivable.accountsReceivable.output.total).toLocaleString('es-BO', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}`,
                    colSpan: 2,
                    fontSize: 8,
                    fillColor: '#eeeeee',
                    alignment: 'right',
                    bold: true
                  }
                  
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
        return res.status(500).json({ ok: false, msg: 'Error al generar el comprobante de abono' });
    }
}

const dataPdfReturnAbonoAccountReceivableVoucher = (abono_account_receivable, accountsReceivable, decimal) => [
    buildHeader({
        title: 'COMPROBANTE ABONO',
        codePrefix: 'CUENTA',
        codeValue: accountsReceivable.cod,
        dateLabel: 'Fecha',
        dateValue: moment(abono_account_receivable.date_abono).format('DD/MM/YYYY HH:mm:ss'),
        company: {
            branchName: accountsReceivable.sucursal?.name,
            nit: accountsReceivable.sucursal?.company?.nit,
            phone: accountsReceivable.sucursal?.cellphone,
            email: accountsReceivable.sucursal?.email,
        },
        logoWidth: 55,
    }),
    buildHr([0, 1, 0, 4]),
    buildInfoPanel([
        {
            title: 'RECIBÍ DE (CLIENTE)',
            rows: [
                { label: 'Nombre:', value: accountsReceivable.output?.client?.full_names || '-', labelWidth: 60 },
                { label: 'Nro. Nit/CI:', value: accountsReceivable.output?.client?.number_document || '-', labelWidth: 60 },
                { label: 'Monto abono:', value: `Bs. ${Number(abono_account_receivable.monto_abono).toFixed(decimal)} (${NumeroALetras(Number(abono_account_receivable.monto_abono).toFixed(decimal))})`, labelWidth: 80 },
                { label: 'Concepto:', value: `Abono crédito ${accountsReceivable.cod} - Venta ${accountsReceivable.output?.cod || ''}`, labelWidth: 60 },
            ]
        }
    ]),
    buildSectionTitle('DETALLE DE PRODUCTOS'),
    buildDetailTable({
        widths: [55, '*', 50, 50, 50, 50],
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
    {
        margin: [0, 3, 0, 0],
        columns: [
            { text: `P/${accountsReceivable.output.type_registry} NRO:`, bold: true, style: 'text', width: 80 },
            { text: `${accountsReceivable.output.number_registry}`, style: 'text' },
            { text: `A CUENTA:`, bold: true, style: 'text', width: 65 },
            { text: `Bs. ${Number(accountsReceivable.monto_abonado).toFixed(decimal)}`, style: 'text' },
            { text: `SALDO:`, bold: true, style: 'text', width: 55 },
            { text: `Bs. ${Number(accountsReceivable.monto_restante).toFixed(decimal)}`, style: 'text' },
        ]
    },
    buildClosingSection({
        signatures: [
            { role: 'Recibí conforme', name: accountsReceivable.sucursal?.name || '' },
            { role: 'Entregue conforme', name: accountsReceivable.output?.client?.full_names || '' },
        ],
        margin: [0, 10, 0, 0],
        signatureSpace: 35,
    }),
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
        const detailTableNode = dataPdf.find(node => node?.table?.widths?.length === 6) || dataPdf[4]; // Tabla de detalles de productos
        const abonosTableNode = dataPdf.find(node => node?.table?.widths?.length === 5) || dataPdf[6]; // Tabla de abonos registrados
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
            detailTableNode.table.body.push(tableData);
        });
        detailTableNode.table.body.push(
            [
                {text:'',colSpan: 2, border:[true,false,false,false]},
                '',
                {text: quantity_total,  fontSize:8, alignment:'center', bold: true, fillColor: '#dde3ea'},
                {text: units.join(','), fontSize:8, alignment:'center'},
                {   border:[true,false,true,true],
                    text: `SUB TOTAL: ${Number(account_receivable.output.sub_total).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                    fillColor: '#dde3ea',alignment:'right', 
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
                    fillColor: '#dde3ea',alignment:'right', 
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
                    fillColor: '#dde3ea',alignment:'right', 
                    bold:true,
                },
            ]
        );
        account_receivable.abonosAccountsReceivable.forEach(abono => {
            const tableData = [
                {text:moment(abono.date_abono).format('DD/MM/YYYY HH:mm:ss'), fontSize:8, alignment: 'center'}, 
                {text:Number(abono?.monto_abono).toFixed(decimal), fontSize:8, alignment: 'right'}, 
                {text:abono?.user?.full_names || '-', fontSize:8}, 
                {text:Number(abono?.restante_credito).toFixed(decimal), fontSize:8, alignment: 'right'}, 
                {text:Number(abono?.total_abonado).toFixed(decimal), fontSize:8, alignment: 'right'},  
            ];
            abonosTableNode.table.body.push(tableData);
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
        return res.status(500).json({ ok: false, msg: 'Error al generar el estado de cuenta por cobrar' });
    }
}

const dataPdfReturnAccountPayableVoucher = (accountsReceivable, decimal) => [
    buildHeader({
        title: 'ESTADO DE CUENTA DE CRÉDITO',
        codePrefix: 'CUENTA',
        codeValue: accountsReceivable.cod,
        dateLabel: 'Fecha',
        dateValue: moment(accountsReceivable.date_credit).format('DD/MM/YYYY HH:mm:ss'),
        company: {
            branchName: accountsReceivable.sucursal?.name,
            nit: accountsReceivable.sucursal?.company?.nit,
            phone: accountsReceivable.sucursal?.cellphone,
            email: accountsReceivable.sucursal?.email,
        },
        logoWidth: 55,
    }),
    buildHr([0, 1, 0, 4]),
    buildInfoPanel([
        {
            title: 'DATOS DE CRÉDITO',
            rows: [
                { label: 'Cliente:', value: `${accountsReceivable.client?.number_document ?? ''} ${accountsReceivable.client?.full_names || '-'}`, labelWidth: 70 },
                { label: 'Descripción:', value: accountsReceivable.description || '-', labelWidth: 70 },
                { label: 'Monto crédito:', value: `Bs. ${Number(accountsReceivable.total).toFixed(decimal)}`, labelWidth: 70 },
                { label: 'Estado:', value: `CRÉDITO ${accountsReceivable.status_account}`, labelWidth: 70 },
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
    buildSectionTitle('ABONOS REGISTRADOS'),
    buildDetailTable({
        widths: [100, 80, '*', 80, 80],
        headers: [
            { text: 'FECHA, HORA ABONO', alignment: 'center' },
            { text: 'MONTO ABONADO', alignment: 'center' },
            { text: 'ABONADO POR' },
            { text: 'RESTANTE', alignment: 'center' },
            { text: 'TOTAL ABONADO', alignment: 'center' },
        ],
        rows: [],
    }),
    {
        margin: [0, 3, 0, 0],
        columns: [
            { text: 'TOTAL ABONADO:', bold: true, style: 'text', width: 110 },
            { text: `Bs. ${Number(accountsReceivable.monto_abonado).toFixed(decimal)}`, bold: true, style: 'text', width: 100 },
            { text: 'TOTAL RESTANTE:', bold: true, style: 'text', width: 110 },
            { text: `Bs. ${Number(accountsReceivable.monto_restante).toFixed(decimal)}`, bold: true, style: 'text' },
        ]
    },
    buildClosingSection({
        signatures: [
            { role: 'Sucursal', name: accountsReceivable.sucursal?.name || '' },
            { role: 'Cliente', name: accountsReceivable.client?.full_names || '' },
        ],
        margin: [0, 15, 0, 0],
        signatureSpace: 35,
    }),
];

module.exports = {
    generatePdfReports,
    generateExcelReports,
    printAbonoAccountReceivableVoucher,
    printAccountReceivableVoucher,
    generatePdfReportsAbonosAll,
    generateExcelReportsAbonosAll,
    dataPdfReturnAbonoAccountReceivableVoucher,
    dataPdfReturnAccountPayableVoucher,
}