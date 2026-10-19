const { buildTransferDocument } = require('../../helpers/generator-pdf/transfer-voucher.document');
const { sendReportPdf } = require('../../services/pdf/report-pdf.service');
const { tabularReport } = require('../../helpers/generator-pdf/tabular-report.adapter');
const { Op } = require("sequelize");
const { Transfers, TransferReviewNote, Sucursal } = require('../../database/config');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const { whereDateForType } = require("../../helpers/where_range");
const { getReportLogoPath } = require('../../helpers/report-logo');
const { getNumberDecimal } = require('../../helpers/company');
const imagePath = getReportLogoPath();
const ExcelJS = require('exceljs');
const { response } = require("express");
const { buildTransferVoucherSummary } = require('../../helpers/transfer-reception');
const { decimalAdd, formatDecimalEsBo } = require('../../helpers/number-formatter');
const { buildStandardReportHeader } = require('../../helpers/generator-pdf/voucher-template.helper');
const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',hour: "numeric",
minute: "numeric",
second: "numeric", };

const roundQuantity = (value) => formatDecimalEsBo(value || 0, 4);

moment.locale('es'); 

const generatePdfReports = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2} = req.query;
        const transfers = await returnDataTransfer(req.query);
        let dataPdf = dataPdfReturn(req.userAuth); //PDF 
        let total = 0;
        transfers.forEach(transfer => {
            total += Number(transfer.quantity_product);
            const tableData = [
                {text:transfer?.cod, fontSize:9}, 
                {text:moment(transfer?.date_send).format('DD/MM/YYYY HH:mm:ss'), fontSize:9}, 
                {text:transfer?.date_received ? moment(transfer?.date_received).format('DD/MM/YYYY HH:mm:ss') : '', fontSize:9}, 
                {text:transfer?.observations_send, fontSize:8}, 
                {text:transfer?.observations_received, fontSize:8}, 
                {text:transfer?.sucursal_send.name, fontSize:9}, 
                {text:transfer?.sucursal_received.name, fontSize:9}, 
                {text:transfer?.status == 'PENDING' ? 'PENDIENTE' : 'RECEPCIONADO', fontSize:9}, 
            ];
            dataPdf[5].table.body.push(tableData);
        });
        const formatDate1 = filterBy == 'MONTH' ? 'MM' : filterBy == 'YEAR' ? 'YYYY' : 'DD-MM-YYYY'; 
        const formatDate2 = filterBy == 'MONTH' ? 'YYYY' : 'DD-MM-YYYY';
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE TRASLADOS', paper: 'A4', orientation: 'landscape',
            company: await resolveReportCompany(req.query.id_sucursal_send),
            filters: ['Período: ' + [date1, date2].filter(Boolean).join(' / '), 'Impreso por: ' + (req.userAuth?.full_names || '')],
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'transfers-generatePdfReports.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de traslados' });
    }
}

const resolveReportCompany = async idSucursal => {
    const id = Number(idSucursal);
    if (!Number.isInteger(id) || id <= 0) return { branchName: 'CASA MATRIZ' };
    const branch = await Sucursal.findByPk(id, { include: [{ association: 'company', attributes: ['nit', 'email'] }] });
    return branch ? { branchName: branch.name, city: branch.city, nit: branch.company?.nit, email: branch.email || branch.company?.email } : { branchName: 'CASA MATRIZ' };
};

const dataPdfReturn = (auth) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE TRASLADOS', auth, details: 'Reporte generado con los parámetros establecidos' }),
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [55,55,55,'*','*',80,80,68],
            body: [
                [
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA ENVIÓ', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'FECHA RECEPCIÓN', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'OBSERVACIÓN ENVIÓ', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'OBSERVACIÓN RECEPCIÓN', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'SUCURSAL ENVIÓ', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'SUCURSAL RECEPCIÓN', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'ESTADO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                ]
            ]   ,
            layout: 'lightHorizontalLines'
        }
    }
];

const generateExcelReports = async (req = request, res = response) => {
  try {
    const transfers = await returnDataTransfer(req.query);
    let transfers_data = [];
    if (transfers.length == 0) {
    transfers_data.push({
        CÓDIGO: '',
        FECHA_ENVIÓ: '',
        FECHA_RECEPCIÓN: '',
        OBSERVACIÓN_ENVIÓ: '',
        OBSERVACIÓN_RECEPCIÓN: '',
        SUCURSAL_ENVIÓ: '',
        SUCURSAL_RECEPCIÓN: '',
        ESTADO: '',
      });
    }
    transfers.forEach(transfer => {
      const tableData = {
        CÓDIGO: transfer.cod,
        FECHA_ENVIÓ: moment(transfer.date_send).format('DD/MM/YYYY HH:mm:ss') ,
        FECHA_RECEPCIÓN: transfer?.date_received ? moment(transfer?.date_received).format('DD/MM/YYYY HH:mm:ss') : '',
        OBSERVACIÓN_ENVIÓ: transfer?.observations_send,
        OBSERVACIÓN_RECEPCIÓN: transfer?.observations_received,
        SUCURSAL_ENVIÓ: transfer?.sucursal_send.name,
        SUCURSAL_RECEPCIÓN: transfer?.sucursal_received?.name,
        ESTADO: transfer?.status == 'PENDING' ? 'PENDIENTE' : 'RECEPCIONADO',
      }
      transfers_data.push(tableData);
    });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Traslados`);
    // Agregar encabezados
    const headers = Object.keys(transfers_data[0]);
    worksheet.addRow(headers);
    // Agregar datos
    transfers_data.forEach(data => {
      const row = [];
      headers.forEach(header => {
        row.push(data[header]);
      });
      worksheet.addRow(row);
    });
    worksheet.getColumn('A').width = 15; 
    worksheet.getColumn('B').width = 20; 
    worksheet.getColumn('C').width = 20; 
    worksheet.getColumn('D').width = 60; 
    worksheet.getColumn('E').width = 60; 
    worksheet.getColumn('F').width = 40; 
    worksheet.getColumn('G').width = 40; 
    worksheet.getColumn('H').width = 25; 
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=traslados-report.xlsx`);
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

const returnDataTransfer = async (params) => {
    const {id_sucursal_send, id_storage_send,id_storage_received, id_user_send,id_user_received, id_sucursal_received, status, filterBy, date1, date2,orderNew} = params;
    const whereDate = whereDateForType(filterBy,date1, date2, '"Transfers"."date_send"');
    const orderList = (orderNew && Array.isArray(orderNew) && orderNew.length > 0 && orderNew[0])
        ? [orderNew]
        : [['date_send', 'DESC']];
    const optionsDb = {
        order: orderList,
        where: {
            [Op.and]: [
                id_sucursal_send     ? { id_sucursal_send } : {},
                id_storage_send      ? { id_storage_send  } : {},
                id_sucursal_received ? { id_sucursal_received  } : {},
                id_storage_received  ? { id_storage_received   } : {},
                id_user_send         ? { id_user_send   } : {},
                id_user_received     ? { id_user_received   } : {},
                status               ? { status } : {},
                { date_send: whereDate }
            ]
        },
        include: [
            {association: 'sucursal_send', attributes: ['name', 'city', 'email', 'cellphone'], include: [{ association: 'company', attributes: ['nit', 'email'] }]},
            {association: 'sucursal_received', attributes: ['name']},
            {association: 'storage_send', attributes: ['name']},
            {association: 'storage_received', attributes: ['name']},
            {association: 'user_send', attributes: ['full_names']},
            {association: 'user_received', attributes: ['full_names']},
        ]
    };
    return await Transfers.findAll(optionsDb);
}

const transferVoucherIncludes = [
    {association: 'sucursal_send', attributes: ['name', 'city', 'email', 'cellphone'], include: [{ association: 'company', attributes: ['nit', 'email'] }]},
    {association: 'sucursal_received', attributes: ['name']},
    {association: 'storage_send', attributes: ['name']},
    {association: 'storage_received', attributes: ['name']},
    {association: 'user_send', attributes: ['full_names']},
    {association: 'user_received', attributes: ['full_names']},
    {association: 'scale', attributes: ['name']},
    { association: 'detailsTransfers', include: [
        { association: 'product', attributes: ['cod', 'name'], include: [{ association: 'unit', attributes: ['name', 'siglas'] }] },
    ] },
];

const printTransferVoucher = async (req = request, res = response) =>{
    try {
        const { id_transfer } = req.params;
        const transfer = await Transfers.findByPk(id_transfer, { include: transferVoucherIncludes });
        if (!transfer) return res.status(404).json({ ok: false, errors: [{ msg: 'El traslado no existe.' }] });

        const decimal = await getNumberDecimal();
        await sendReportPdf(res, buildTransferDocument(transfer, undefined, [], decimal), `guia-traslado-${transfer.cod}.pdf`);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo generar la Guía de traslado.' }] });
    }
}

const printTransferReceptionVoucher = async (req = request, res = response) => {
    try {
        const { id_transfer } = req.params;
        const transfer = await Transfers.findByPk(id_transfer, { include: transferVoucherIncludes });
        if (!transfer) return res.status(404).json({ ok: false, errors: [{ msg: 'El traslado no existe.' }] });
        if (transfer.status !== 'RECEIVED') return res.status(409).json({ ok: false, errors: [{ msg: 'La Guía de recepción sólo está disponible para traslados recibidos.' }] });

        const reviewNotes = await TransferReviewNote.findAll({
            where: { id_transfer: transfer.id },
            include: [
                { association: 'registeredProduct', attributes: ['cod', 'name'] },
                { association: 'assignedUser', attributes: ['full_names'] },
                { association: 'details', include: [
                    { association: 'product', attributes: ['cod', 'name'] },
                    { association: 'resolutionActions', include: [{ association: 'movementLinks' }] },
                ] },
            ],
        });
        const voucherSummary = buildTransferVoucherSummary(transfer.detailsTransfers, transfer.status, reviewNotes);
        const decimal = await getNumberDecimal();
        await sendReportPdf(res, buildTransferDocument(transfer, voucherSummary, reviewNotes, decimal), `guia-recepcion-${transfer.cod}.pdf`);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo generar la Guía de recepción.' }] });
    }
};

module.exports = {
    generatePdfReports,
    generateExcelReports,
    printTransferVoucher,
    printTransferReceptionVoucher,
}
