const { Op } = require("sequelize");
const { AccountsPayable, AbonosAccountsPayable ,ViewAbonosAccountPayableAll} = require('../../database/config');
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
        const accounts_payables = await returnDataAccountPayable(req.query);
        let dataPdf = dataPdfReturn(req.userAuth,accounts_payables[0]?.sucursal?.name ?? '-'); //PDF 
        const decimal = await getNumberDecimal();
        let total_abonados = 0, total_restante=0,total_account = 0;
        accounts_payables.forEach(account_payable => {
            const tableData = [
                {text:account_payable?.input.cod, fontSize:8}, 
                {text:account_payable?.provider?.full_names, fontSize:8}, 
                {text:moment(account_payable?.input.date_voucher).format('DD/MM/YYYY HH:mm:ss'), fontSize:8}, 
                {text:account_payable?.input?.type_registry, fontSize:8}, 
                {text:account_payable?.input?.registry_number, fontSize:8}, 
                {text:Number(account_payable?.monto_abonado).toFixed(decimal), fontSize:8}, 
                {text:Number(account_payable?.monto_restante).toFixed(decimal), fontSize:8}, 
                {text:Number(account_payable?.total).toFixed(decimal), fontSize:8}, 
            ];
            total_abonados+=Number(account_payable?.monto_abonado);
            total_restante+=Number(account_payable?.monto_restante);
            total_account+=Number(account_payable?.total);
            dataPdf[5].table.body.push(tableData);
        });
        dataPdf[5].table.body.push([
            { colSpan: 5,text:'' },
            {},
            {},
            {},
            {},
            {text: Number(total_abonados).toFixed(decimal),fontSize:9},
            {text: Number(total_restante).toFixed(decimal),fontSize:9},
            {text: Number(total_account).toFixed(decimal),fontSize:9},
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
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de cuentas por pagar' });
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
    { text: 'REPORTE DE CUENTAS POR PAGAR', alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Reporte generados con los parámetros establecidos, SUCURSAL: '+sucursal, alignment:'center',absolutePosition: {  y: 73 } },
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [50,'*',80,80,55,55,55,55],
            body: [
                [
                    {text:'COMPRA', fontSize:8 ,fillColor: '#eeeeee', bold:true},
                    {text:'PROVEEDOR', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA REGISTRO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO DE REGISTRO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'NUMERO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'A CUENTA', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'SALDO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TOTAL', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                ]
            ],
            layout: 'lightHorizontalLines'
        }
    }
];

const generateExcelReports = async (req = request, res = response) => {
  try {
        const accounts_payables = await returnDataAccountPayable(req.query);
        const decimal = await getNumberDecimal();
        let accounts_payables_data = [];
        if(accounts_payables.length == 0) {
            accounts_payables_data.push({
                COMPRA : '',
                PROVEEDOR : '',
                FECHA_REGISTRO : '',
                TIPO_DE_REGISTRO : '',
                NUMERO : '',
                A_CUENTA : '',
                SALDO : '',
                TOTAL : '',
                SUCURSAL : '', 
            });
        }
        accounts_payables.forEach(account_payable => {
            const tableData = {
                COMPRA : account_payable?.input.cod,
                PROVEEDOR : account_payable?.provider?.full_names,
                FECHA_REGISTRO : moment(account_payable?.input?.date_voucher).format('DD/MM/YYYY HH:mm:ss'),
                TIPO_DE_REGISTRO : account_payable?.input?.type_registry,
                NUMERO : account_payable?.input?.registry_number,
                A_CUENTA :  Number(account_payable?.monto_abonado).toFixed(decimal),
                SALDO : Number(account_payable?.monto_restante).toFixed(decimal),
                TOTAL :   Number(account_payable?.total).toFixed(decimal),
                SUCURSAL : account_payable?.sucursal?.name, 
            }
            accounts_payables_data.push(tableData);
        });
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Cuentas por pagar`);
        // Agregar encabezados
        const headers = Object.keys(accounts_payables_data[0]);
        worksheet.addRow(headers);
        // Agregar datos
        accounts_payables_data.forEach(data => {
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
        res.setHeader('Content-Disposition', `attachment; filename=cuentas-por-pagar.xlsx`);
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

const returnDataAccountPayable = async (params) => {
    const {status_account, id_provider, id_sucursal,type_registry,filterBy, date1, date2,orderNew} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"input"."date_voucher"');
    const orderList = (orderNew && Array.isArray(orderNew) && orderNew.length > 0 && orderNew[0])
        ? [orderNew]
        : [['id', 'DESC']];
    const optionsDb = {
        order: orderList,
        where: {
            [Op.and]: [
                id_provider    ? { id_provider   } : {},
                id_sucursal   ? { id_sucursal   } : {},
                status_account ? { status_account   } : {},
                { status: true },
            ]
        },
        include: [ 
            { association: 'sucursal',attributes: ['name'] },
            { association: 'provider', attributes: ['full_names']},
            { association: 'input',
                where: { [Op.and]: [
                    type_registry ? { type_registry } : {},
                    { date_voucher: whereDate }
                ]} ,
                include:[  
                    { association: 'scale', attributes: ['name']},
                    { association: 'user', attributes: ['full_names','number_document']},
                ]
            },
        ]
    };
    return await AccountsPayable.findAll(optionsDb);
}

const generatePdfReportsAbonosAll = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2} = req.query;
        const accounts_payables_abonos_all = await returnDataAccountPayableAbonos(req.query);
        let dataPdf = dataPdfReturnAbonosAll(req.userAuth,accounts_payables_abonos_all[0]?.sucursal?.name ?? '-'); //PDF 
        const decimal = await getNumberDecimal();
        let total_abonados = 0;
        accounts_payables_abonos_all.forEach(account_payable_abono => {
            const tableData = [
                {text:moment(account_payable_abono?.date_abono).format('DD/MM/YYYY HH:mm:ss'), fontSize:8}, 
                {text:account_payable_abono?.codes_input?.join(' \n '), fontSize:8}, 
                {text:account_payable_abono?.provider?.full_names, fontSize:8}, 
                {text:account_payable_abono?.type_payment, fontSize:8}, 
                {text:Number(account_payable_abono?.monto_abono).toFixed(decimal), fontSize:8}, 
                {text:account_payable_abono?.comments, fontSize:8}, 
            ];
            total_abonados+=Number(account_payable_abono?.monto_abono);
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
          const accounts_payables_abonos = await returnDataAccountPayableAbonos(req.query);
          const decimal = await getNumberDecimal();
          let accounts_payables_data = [];
          if(accounts_payables_abonos.length == 0) {
              accounts_payables_data.push({
                FECHA: '',
                COMPRAS: '',
                PROVEEDOR: '',
                TIPO: '',
                PAGO: '',
                CONCEPTO: '',
              });
          }
          accounts_payables_abonos.forEach(account_payable => {
              const tableData = {
                FECHA : moment(account_payable?.date_abono).format('DD/MM/YYYY HH:mm:ss'),
                COMPRAS : account_payable?.codes_input?.join(' \n '),
                PROVEEDOR : account_payable.provider?.full_names,
                TIPO : account_payable?.type_payment,
                PAGO : Number(account_payable?.monto_abono).toFixed(decimal),
                CONCEPTO :  account_payable.comments,
              }
              accounts_payables_data.push(tableData);
          });
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet(`Cuentas por pagar`);
          // Agregar encabezados
          const headers = Object.keys(accounts_payables_data[0]);
          worksheet.addRow(headers);
          // Agregar datos
          accounts_payables_data.forEach(data => {
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
          res.setHeader('Content-Disposition', `attachment; filename=cuentas-por-pagar.xlsx`);
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
                    {text:'COMPRAS', fontSize:8 ,fillColor: '#eeeeee', bold:true},
                    {text:'PROVEEDOR', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PAGO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'CONCEPTO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                ]
            ],
            layout: 'lightHorizontalLines'
        }
    }
];

const returnDataAccountPayableAbonos = async (params) => {
    const {id_provider,query, id_sucursal, filterBy, date1, date2,orderNew} = params;
    let {type} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"ViewAbonosAccountPayableAll"."date_abono"');
    const where = {
        [Op.and]: [
            id_sucursal   ? { id_sucursal   } : {},
            id_provider   ? { id_provider   } : {},
            { date_abono: whereDate },
            type == 'codes_input' ?   {codes_input: {
                [Op.contains]: [query]
              } }: {}
        ]
    }
    if( type == 'codes_input') type = null;
    const optionsDb = {
        order: [orderNew],
        where,
        include: [ 
            { association: 'sucursal',attributes: ['name'] },
            { association: 'user',attributes: ['full_names'] },
            { association: 'provider',attributes: ['full_names'] },
        ]
    };
    return await ViewAbonosAccountPayableAll.findAll(optionsDb);
}

const printAbonoAccountPayableVoucher = async (req = request, res = response) =>{
    try {
        const { id_abono_account_payable } = req.params;
        const abono_account_payable = await AbonosAccountsPayable.findByPk(id_abono_account_payable,{
            include: [ 
                { association: 'accountsPayable', include: [
                    { association: 'sucursal', include:{ association: 'company'}},
                    { association: 'input', include: [
                        { association: 'detailsInput', 
                            include: [
                                {   association: 'product',
                                    include: [{ association:'unit'}]
                                }
                            ]
                        },
                        { association: 'provider'},
                        
                    ]}
                ]},
                { association: 'bankOrigin' },
                { association: 'bankDestination' },
            ]
        });
        const decimal = await getNumberDecimal();
        let dataPdf = dataPdfReturnAbonoAccountPayableVoucher(abono_account_payable,abono_account_payable.accountsPayable,decimal); //PDF 
        const detailTableNode = dataPdf.find(node => node?.table?.widths?.length === 6) || dataPdf[4];
        let quantity_total = 0;
        let units = [];
        abono_account_payable.accountsPayable.input.detailsInput.forEach(detail => {
            quantity_total+= Number(detail?.quantity);
            if (!units.includes(detail?.product?.unit.siglas)) {
                units.push(detail?.product?.unit.siglas);
            }
            const tableData = [
                {text:detail?.product?.cod, fontSize:8}, 
                {text:detail?.product?.name, fontSize:8}, 
                {text:detail?.quantity, fontSize:8, alignment: 'center'}, 
                {text:detail?.product?.unit?.siglas, fontSize:8, alignment: 'center'}, 
                {text:Number(detail?.cost).toFixed(decimal), fontSize:8, alignment: 'right'},  
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
                    text: `SUB TOTAL: ${Number(abono_account_payable.accountsPayable.input.sumas).toLocaleString('es-BO', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}`,
                    colSpan: 2,
                    fontSize: 8,
                    fillColor: '#eeeeee',
                    alignment: 'right',
                    bold: true
                },                  
            ],
            [
                {text:'',colSpan: 4, border:[true,false,false,false]},
                '',
                '',
                '',
                {   border:[true,false,true,true],
                    text: `DESCUENTO: ${Number(abono_account_payable.accountsPayable.input.discount).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                    fillColor: '#eeeeee',alignment:'right', 
                    bold:true,
                },
            ],
            [
                {
                    text:'SON: ' + NumeroALetras(Number(abono_account_payable.accountsPayable.input.total).toFixed(decimal)),
                    style: 'sonBs', fontSize:8, colSpan: 4, border:[true,false,true,true],
                },
                '',
                '',
                '',
                {
                    border: [true, false, true, true],
                    text: `TOTAL: ${Number(abono_account_payable.accountsPayable.input.total).toLocaleString('es-BO', {
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

const dataPdfReturnAbonoAccountPayableVoucher = (abono_account_payable, accountsPayable, decimal) => [
    buildHeader({
        title: 'COMPROBANTE ABONO',
        codePrefix: 'CUENTA',
        codeValue: accountsPayable.cod,
        dateLabel: 'Fecha',
        dateValue: moment(abono_account_payable.date_abono).format('DD/MM/YYYY HH:mm:ss'),
        company: {
            branchName: accountsPayable.sucursal?.name,
            nit: accountsPayable.sucursal?.company?.nit,
            phone: accountsPayable.sucursal?.cellphone,
            email: accountsPayable.sucursal?.email,
        },
        logoWidth: 55,
    }),
    buildHr([0, 1, 0, 4]),
    buildInfoPanel([
        {
            title: 'ENTREGUE A (PROVEEDOR)',
            rows: [
                { label: 'Nombre:', value: accountsPayable.input?.provider?.full_names || '-', labelWidth: 60 },
                { label: 'Nro. Nit:', value: accountsPayable.input?.provider?.number_document || '-', labelWidth: 60 },
                { label: 'Monto abono:', value: `Bs. ${Number(abono_account_payable.monto_abono).toFixed(decimal)} (${NumeroALetras(Number(abono_account_payable.monto_abono).toFixed(2))})`, labelWidth: 80 },
                { label: 'Concepto:', value: `Abono crédito ${accountsPayable.cod} - Compra ${accountsPayable.input?.cod || ''}`, labelWidth: 60 },
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
        margin: [0,3,0,0],
        columns: [
            { text: `P/${accountsPayable.input.type_registry} NRO:`, bold:true, style: 'text', width: 95, alignment: 'left'  },
            { 
                width: 75,
                table: {
                  widths: ['*'],
                  body: [[
                    {
                      text: `${accountsPayable.input.registry_number}`,
                      bold: true,
                      style: 'text',
                      fontSize: 10,
                      fillColor: '#eeeeee',
                      alignment: 'left',
                      margin: [0,0,0,0]
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
            { text: `A CUENTA:`, bold:true, style: 'text', width: 60, alignment: 'left'  },
            { 
                width: 75,
                table: {
                  widths: ['*'],
                  body: [[
                    {
                      text: `${Number(accountsPayable.monto_abonado).toLocaleString('es-BO', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}`,
                      style: 'text',
                      fontSize: 10,
                      fillColor: '#eeeeee',
                      alignment: 'left',
                      margin: [0,0,0,0]
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
            { text: `SALDO:`, bold:true, style: 'text', width: 45, alignment: 'left' },
            { 
                width: 75,
                table: {
                  widths: ['*'],
                  body: [[
                    {
                      text: `${Number(accountsPayable.monto_restante).toLocaleString('es-BO', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}`,
                      style: 'text',
                      fontSize: 10,
                      fillColor: '#eeeeee',
                      alignment: 'left',
                      margin: [0,0,0,0]
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
      margin: [0, 3, 0, 0],
      stack: [
        abono_account_payable.type_payment != 'EFECTIVO' ? {
          columns: [
            { text: 'ORIGEN:', bold: true, style: 'text', width: 60 },
            { text: `${abono_account_payable.bankOrigin?.name ?? '-'} | Cuenta: ${abono_account_payable.account_origin ?? ''}`, style: 'text', fontSize: 9 }
          ],
          margin: [0, 2, 0, 0]
        } : null,
        abono_account_payable.type_payment != 'EFECTIVO' ? {
          columns: [
            { text: 'DESTINO:', bold: true, style: 'text', width: 60 },
            { text: `${abono_account_payable.bankDestination?.name ?? '-'} | Cuenta: ${abono_account_payable.account_output ?? ''}`, style: 'text', fontSize: 9 }
          ],
          margin: [0, 2, 0, 0]
        } : null,
        ((abono_account_payable.type_payment == 'TRANSFERENCIA' || abono_account_payable.type_payment == 'QR') && abono_account_payable.number_transaction) ? {
          columns: [
            { text: 'TRANS. NRO:', bold: true, style: 'text', width: 75 },
            { text: `${abono_account_payable.number_transaction}`, style: 'text', fontSize: 9 }
          ],
          margin: [0, 2, 0, 0]
        } : null
      ].filter(x => x !== null)
    },
    buildClosingSection({
        signatures: [
            { role: 'Recibí conforme', name: accountsPayable.input?.provider?.full_names || '' },
            { role: 'Entregue conforme', name: accountsPayable.sucursal?.name || '' },
        ],
        margin: [0, 10, 0, 0],
        signatureSpace: 35,
    }),
];



const printAccountPayableVoucher = async (req = request, res = response) =>{
    try {
        const { id_account_payable } = req.params;
        const account_payable = await AccountsPayable.findByPk(id_account_payable,{
            include: [ 
                { association: 'sucursal', include:{ association: 'company'} },
                { association: 'provider', attributes: ['full_names']},
                { association: 'input',
                    include:[  
                        { association: 'detailsInput', 
                            include: [
                                {   association: 'product',
                                    include: [{ association:'unit'}]
                                }
                            ]
                        },
                    ]
                },
                { association: 'abonosAccountsPayable', required:false,where: {status:true}, include:[  
                    { association: 'user', attributes: ['full_names','number_document']},
                ]},
            ]
        });
        const decimal = await getNumberDecimal();
        let dataPdf = dataPdfReturnAccountPayableVoucher(account_payable,decimal); //PDF 
        const detailTableNode = dataPdf.find(node => node?.table?.widths?.length === 6) || dataPdf[3]; // Tabla de detalles de productos
        const abonosTableNode = dataPdf.find(node => node?.table?.widths?.length === 5) || dataPdf[4]; // Tabla de abonos registrados
        let quantity_total = 0;
        let units = [];
        account_payable.input.detailsInput.forEach(detail => {
            quantity_total+= Number(detail?.quantity);
            if (!units.includes(detail?.product?.unit.siglas)) {
                units.push(detail?.product?.unit.siglas);
            }
            const tableData = [
                {text:detail?.product?.cod, fontSize:8}, 
                {text:detail?.product?.name, fontSize:8}, 
                {text:detail?.quantity, fontSize:8, alignment: 'right'}, 
                {text:detail?.product?.unit?.siglas, fontSize:8, alignment: 'center'}, 
                {text:Number(detail?.cost).toFixed(decimal), fontSize:8, alignment: 'right'},  
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
                    fillColor: '#eeeeee',
                },
                {text: units.join(','), fontSize:8, alignment:'center'},
                {
                    border: [true, false, true, true],
                    text: `SUB TOTAL: ${Number(account_payable.input.sumas).toLocaleString('es-BO', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`,
                    colSpan: 2,
                    fontSize: 8,
                    fillColor: '#eeeeee',
                    alignment: 'right',
                    bold: true,
                  }
            ],
            [
                {text:'',colSpan: 4, border:[true,false,false,false]},
                '',
                '',
                '',
                {   border:[true,false,true,true],
                    text: `DESCUENTO: ${Number(account_payable.input.discount).toFixed(decimal)}`, colSpan: 2,fontSize:8,
                    fillColor: '#dde3ea',alignment:'right', 
                    bold:true,
                },
            ],
            [
                {
                    text:'SON: ' + NumeroALetras(Number(account_payable.input.total).toFixed(decimal)),
                    style: 'SonBs', fontSize:8, colSpan: 4, border:[true,false,true,true],
                },
                '',
                '',
                '',
                {
                    border: [true, false, true, true],
                    text: `TOTAL: ${Number(account_payable.input.total).toLocaleString('es-BO', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`,
                    colSpan: 2,
                    fontSize: 8,
                    fillColor: '#dde3ea',
                    alignment: 'right',
                    bold: true,
                  }
            ]
        );
        account_payable.abonosAccountsPayable.forEach(abono => {
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
        return res.status(500).json({ ok: false, msg: 'Error al generar el estado de cuenta por pagar' });
    }
}

const dataPdfReturnAccountPayableVoucher = (accountsPayable, decimal) => [
    buildHeader({
        title: `ESTADO DE CUENTA DE CRÉDITO`,
        codePrefix: 'CUENTA',
        codeValue: accountsPayable.cod,
        dateLabel: 'Fecha',
        dateValue: moment(accountsPayable.date_credit).format('DD/MM/YYYY HH:mm:ss'),
        company: {
            branchName: accountsPayable.sucursal?.name,
            nit: accountsPayable.sucursal?.company?.nit,
            phone: accountsPayable.sucursal?.cellphone,
            email: accountsPayable.sucursal?.email,
        },
        logoWidth: 55,
    }),
    buildHr([0, 1, 0, 4]),
    buildInfoPanel([
        {
            title: 'DATOS DE CRÉDITO',
            rows: [
                { label: 'Proveedor:', value: `${accountsPayable.provider?.number_document ?? ''} ${accountsPayable?.provider?.full_names || '-'}`, labelWidth: 70 },
                { label: 'Descripción:', value: accountsPayable.description || '-', labelWidth: 70 },
                { label: 'Monto crédito:', value: `Bs. ${Number(accountsPayable.total).toFixed(decimal)}`, labelWidth: 70 },
                { label: 'Estado:', value: `CRÉDITO ${accountsPayable.status_account}`, labelWidth: 70 },
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
            { text: `Bs. ${Number(accountsPayable.monto_abonado).toFixed(decimal)}`, bold: true, style: 'text', width: 100 },
            { text: 'TOTAL RESTANTE:', bold: true, style: 'text', width: 110 },
            { text: `Bs. ${Number(accountsPayable.monto_restante).toFixed(decimal)}`, bold: true, style: 'text' },
        ]
    },
    buildClosingSection({
        signatures: [
            { role: 'Proveedor', name: accountsPayable.provider?.full_names || '' },
            { role: 'Sucursal', name: accountsPayable.sucursal?.name || '' },
        ],
        margin: [0, 15, 0, 0],
        signatureSpace: 35,
    }),
];

module.exports = {
    generatePdfReports,
    generateExcelReports,
    printAbonoAccountPayableVoucher,
    printAccountPayableVoucher,
    generatePdfReportsAbonosAll,
    generateExcelReportsAbonosAll,
    dataPdfReturnAbonoAccountPayableVoucher,
    dataPdfReturnAccountPayableVoucher,
}