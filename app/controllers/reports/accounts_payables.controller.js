const { buildFinancialVoucher } = require('../../helpers/generator-pdf/financial-voucher.document');
const { sendReportPdf } = require('../../services/pdf/report-pdf.service');
const { tabularReport } = require('../../helpers/generator-pdf/tabular-report.adapter');
const { Op } = require("sequelize");
const { AccountsPayable, AbonosAccountsPayable ,ViewAbonosAccountPayableAll} = require('../../database/config');
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
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE CUENTAS POR PAGAR', paper: 'A4', orientation: 'landscape',
            company: { branchName: accounts_payables[0]?.sucursal?.name || 'CASA MATRIZ', city: accounts_payables[0]?.sucursal?.city, nit: accounts_payables[0]?.sucursal?.company?.nit, email: accounts_payables[0]?.sucursal?.email || accounts_payables[0]?.sucursal?.company?.email },
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'accounts_payables-generatePdfReports.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de cuentas por pagar' });
    }
}

const dataPdfReturn = (auth,sucursal) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE CUENTAS POR PAGAR', auth, details: `Reporte generado con los parámetros establecidos · Sucursal: ${sucursal}` }),
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
            { association: 'sucursal',attributes: ['name', 'city', 'email'], include: [{ association: 'company', attributes: ['nit', 'email'] }] },
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
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE ABONOS CUENTAS POR PAGAR', paper: 'A4', orientation: 'landscape',
            company: { branchName: accounts_payables_abonos_all[0]?.sucursal?.name || 'CASA MATRIZ', city: accounts_payables_abonos_all[0]?.sucursal?.city, nit: accounts_payables_abonos_all[0]?.sucursal?.company?.nit, email: accounts_payables_abonos_all[0]?.sucursal?.email || accounts_payables_abonos_all[0]?.sucursal?.company?.email },
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'accounts_payables-generatePdfReportsAbonosAll.pdf');
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
            { association: 'sucursal',attributes: ['name', 'city', 'email'], include: [{ association: 'company', attributes: ['nit', 'email'] }] },
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
        await sendReportPdf(res, buildFinancialVoucher(abono_account_payable.accountsPayable, { payable: true, decimal, payment: abono_account_payable }), 'abono-payable-' + abono_account_payable.id + '.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el comprobante de abono' });
    }
}



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
        await sendReportPdf(res, buildFinancialVoucher(account_payable, { payable: true, decimal }), 'cuenta-payable-' + account_payable.id + '.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el estado de cuenta por pagar' });
    }
}

module.exports = {
    generatePdfReports,
    generateExcelReports,
    printAbonoAccountPayableVoucher,
    printAccountPayableVoucher,
    generatePdfReportsAbonosAll,
    generateExcelReportsAbonosAll,

}
