const { buildFinancialVoucher } = require('../../helpers/generator-pdf/financial-voucher.document');
const { sendReportPdf } = require('../../services/pdf/report-pdf.service');
const { tabularReport } = require('../../helpers/generator-pdf/tabular-report.adapter');
const { Op } = require("sequelize");
const { AccountsReceivable, AbonosAccountsReceivable,viewAbonosAccountReceivablesAll } = require('../../database/config');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const { whereDateForType } = require("../../helpers/where_range");
const { getReportLogoPath } = require('../../helpers/report-logo');
const imagePath = getReportLogoPath();
const ExcelJS = require('exceljs');
const { getNumberDecimal } = require("../../helpers/company");
const { buildStandardReportHeader } = require('../../helpers/generator-pdf/voucher-template.helper');
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
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE CUENTAS POR COBRAR', paper: 'A4', orientation: 'landscape',
            company: { branchName: accounts_receivables[0]?.sucursal?.name || 'CASA MATRIZ', city: accounts_receivables[0]?.sucursal?.city, nit: accounts_receivables[0]?.sucursal?.company?.nit, email: accounts_receivables[0]?.sucursal?.email || accounts_receivables[0]?.sucursal?.company?.email },
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'accounts_receivable-generatePdfReports.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de cuentas por cobrar' });
    }
}

const dataPdfReturn = (auth,sucursal) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE CUENTAS POR COBRAR', auth, details: `Reporte generado con los parámetros establecidos · Sucursal: ${sucursal}` }),
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
            { association: 'sucursal',attributes: ['name', 'city', 'email'], include: [{ association: 'company', attributes: ['nit', 'email'] }] },
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
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE ABONOS CUENTAS POR COBRAR', paper: 'A4', orientation: 'landscape',
            company: { branchName: accounts_receivables_abonos_all[0]?.sucursal?.name || 'CASA MATRIZ', city: accounts_receivables_abonos_all[0]?.sucursal?.city, nit: accounts_receivables_abonos_all[0]?.sucursal?.company?.nit, email: accounts_receivables_abonos_all[0]?.sucursal?.email || accounts_receivables_abonos_all[0]?.sucursal?.company?.email },
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'accounts_receivable-generatePdfReportsAbonosAll.pdf');
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
    ...buildStandardReportHeader({ title: 'PAGOS REALIZADOS', auth, details: `Reporte generado con los parámetros establecidos · Sucursal: ${sucursal}` }),
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
            { association: 'sucursal',attributes: ['name', 'city', 'email'], include: [{ association: 'company', attributes: ['nit', 'email'] }] },
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
        await sendReportPdf(res, buildFinancialVoucher(abono_account_receivable.accountsReceivable, { payable: false, decimal, payment: abono_account_receivable }), 'abono-receivable-' + abono_account_receivable.id + '.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el comprobante de abono' });
    }
}



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
        await sendReportPdf(res, buildFinancialVoucher(account_receivable, { payable: false, decimal }), 'cuenta-receivable-' + account_receivable.id + '.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el estado de cuenta por cobrar' });
    }
}

module.exports = {
    generatePdfReports,
    generateExcelReports,
    printAbonoAccountReceivableVoucher,
    printAccountReceivableVoucher,
    generatePdfReportsAbonosAll,
    generateExcelReportsAbonosAll,

}
