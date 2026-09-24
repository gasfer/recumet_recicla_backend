const { Op } = require("sequelize");
const { Transfers, TransferReviewNote } = require('../../database/config');
const PdfPrinter = require('pdfmake');
const fonts = require('../../helpers/generator-pdf/fonts');
const styles = require('../../helpers/generator-pdf/styles');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const { whereDateForType } = require("../../helpers/where_range");
const imagePath = path.join(__dirname, '../../../uploads/logo.png');
const ExcelJS = require('exceljs');
const { response } = require("express");
const { buildTransferVoucherSummary } = require('../../helpers/transfer-reception');
const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',hour: "numeric",
minute: "numeric",
second: "numeric", };

const roundQuantity = (value) => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;

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
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de traslados' });
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
    { text: `REPORTE DE TRASLADOS`, alignment:'center', style: 'title', absolutePosition: {  y: 58 }},
    { text: 'Reporte generados con los parámetros establecidos', alignment:'center',absolutePosition: {  y: 73 } },
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
            {association: 'sucursal_send', attributes: ['name']},
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
    {association: 'sucursal_send', attributes: ['name']},
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

const HALF_LETTER_PORTRAIT = {
    pageSize: { width: 396, height: 612 },
    pageOrientation: 'portrait',
    pageMargins: [18, 18, 18, 18],
};

const HALF_LETTER_LANDSCAPE = {
    pageSize: { width: 396, height: 612 },
    pageOrientation: 'landscape',
    pageMargins: [18, 18, 18, 18],
};

const sendVoucherPdf = (res, dataPdf, filename, documentOptions = HALF_LETTER_PORTRAIT) => {
    const docDefinition = {
        content: dataPdf,
        pageOrientation: 'landscape',
        styles,
        ...documentOptions,
    };
    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks = [];

    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => {
        res.setHeader('Content-Type', 'application/pdf;');
        res.setHeader('Content-disposition', `filename=${filename}.pdf`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.send(Buffer.concat(chunks));
    });
    pdfDoc.end();
};

const printTransferVoucher = async (req = request, res = response) =>{
    try {
        const { id_transfer } = req.params;
        const transfer = await Transfers.findByPk(id_transfer, { include: transferVoucherIncludes });
        if (!transfer) return res.status(404).json({ ok: false, errors: [{ msg: 'El traslado no existe.' }] });

        const dataPdf = dataPdfReturnTransferVoucher(transfer);
        transfer.detailsTransfers.forEach((detail) => {
            const tableData = [
                { text: detail?.product?.cod, fontSize: 8 },
                { text: detail?.product?.name, fontSize: 8 },
                { text: detail?.product?.unit?.siglas, fontSize: 8, alignment: 'center' },
                { text: roundQuantity(detail?.quantity), fontSize: 8, alignment: 'center' },
            ];
            dataPdf[9].table.body.push(tableData);
        });
        dataPdf[9].table.body.push(
            [
                { text: 'PESOS TOTALES', colSpan: 2, fontSize: 8, bold: true, alignment: 'right' },
                '',
                { text: [...new Set(transfer.detailsTransfers.map((detail) => detail?.product?.unit?.siglas).filter(Boolean))].join(','), fontSize: 8, bold: true, alignment: 'center' },
                { text: roundQuantity(transfer.detailsTransfers.reduce((total, detail) => total + Number(detail.quantity || 0), 0)), fontSize: 8, bold: true, alignment: 'center' },
            ],
        );
        sendVoucherPdf(res, dataPdf, `guia-traslado-${transfer.cod}`, HALF_LETTER_PORTRAIT);
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
        const dataPdf = dataPdfReturnReceptionVoucher(transfer);

        voucherSummary.rows.forEach((row, index) => {
            const detail = transfer.detailsTransfers[index];
            dataPdf[9].table.body.push([
                { text: `${detail?.product?.cod || ''} - ${detail?.product?.name || ''}`, fontSize: 7 },
                { text: detail?.product?.unit?.siglas, fontSize: 7, alignment: 'center' },
                { text: row.sent, fontSize: 7, alignment: 'center' },
                { text: row.received, fontSize: 7, alignment: 'center' },
                { text: row.normal, fontSize: 7, alignment: 'center' },
                { text: row.blocked, fontSize: 7, alignment: 'center' },
                { text: row.differencePercentage, fontSize: 7, alignment: 'center' },
                { text: row.status, fontSize: 7, alignment: 'center' },
                { text: row.observation, fontSize: 7, alignment: 'center' },
            ]);
        });
        dataPdf[9].table.body.push([
            { text: 'PESOS TOTALES', fontSize: 8, bold: true, alignment: 'right' },
            { text: voucherSummary.units.join(','), fontSize: 8, bold: true, alignment: 'center' },
            { text: voucherSummary.totals.sent, fontSize: 8, bold: true, alignment: 'center' },
            { text: voucherSummary.totals.received, fontSize: 8, bold: true, alignment: 'center' },
            { text: voucherSummary.totals.normal, fontSize: 8, bold: true, alignment: 'center' },
            { text: voucherSummary.totals.blocked, fontSize: 8, bold: true, alignment: 'center' },
            { text: voucherSummary.totals.differencePercentage, fontSize: 8, bold: true, alignment: 'center' },
            { text: voucherSummary.totals.accountedTotal, fontSize: 8, bold: true, alignment: 'center' },
            { text: '', fontSize: 8, bold: true },
        ]);

        const reconciliationRows = reviewNotes.flatMap((note) => note.details.map((detail) => [
            { text: `${detail.product.cod} - ${detail.product.name}`, fontSize: 6 },
            { text: note.type === 'EXCEDENTE_PARA_REVISION' ? 'EXCEDENTE' : 'FALTANTE', fontSize: 6, alignment: 'center' },
            { text: roundQuantity(detail.quantity_difference), fontSize: 6, alignment: 'center' },
            { text: roundQuantity(detail.quantity_resolved || 0), fontSize: 6, alignment: 'center' },
            { text: note.reconciliation_status, fontSize: 6, alignment: 'center' },
            { text: note.assignedUser?.full_names || 'SIN ASIGNAR', fontSize: 6 },
            { text: note.type === 'EXCEDENTE_PARA_REVISION'
                ? `${detail.product.cod} - ${detail.product.name}`
                : note.registeredProduct ? `${note.registeredProduct.cod} - ${note.registeredProduct.name}` : '-', fontSize: 6 },
            { text: detail.resolutionActions.flatMap((action) => action.movementLinks.map((link) => `#${link.id_kardex_movement}`)).join(', ') || '-', fontSize: 6 },
        ]));
        if (reconciliationRows.length > 0) {
            const totalExcess = reviewNotes.filter((note) => note.type === 'EXCEDENTE_PARA_REVISION').reduce((total, note) => total + note.details.reduce((sum, detail) => sum + Number(detail.quantity_difference), 0), 0);
            const totalShortage = reviewNotes.filter((note) => note.type === 'FALTANTE_PARA_REVISION').reduce((total, note) => total + note.details.reduce((sum, detail) => sum + Number(detail.quantity_difference), 0), 0);
            dataPdf.splice(10, 0, createReconciliationTable(reconciliationRows, totalExcess, totalShortage));
        }
        sendVoucherPdf(res, dataPdf, `guia-recepcion-${transfer.cod}`, HALF_LETTER_LANDSCAPE);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo generar la Guía de recepción.' }] });
    }
};

const createReconciliationTable = (rows, totalExcess, totalShortage) => ({
    pageBreak: rows.length > 12 ? 'before' : undefined,
    margin: [0, 4, 0, 0],
    table: { headerRows: 2, dontBreakRows: true, widths: ['*', 38, 32, 32, 42, 54, '*', 34], body: [
        [{ text: 'CONCILIACIÓN DE DIFERENCIAS REGISTRADAS', colSpan: 8, bold: true, fontSize: 6, fillColor: '#eeeeee' }, '', '', '', '', '', '', ''],
        [{ text: 'PRODUCTO ORIGEN', bold: true, fontSize: 6 }, { text: 'TIPO', bold: true, fontSize: 6 }, { text: 'KG REG.', bold: true, fontSize: 6 }, { text: 'KG CONC.', bold: true, fontSize: 6 }, { text: 'ESTADO', bold: true, fontSize: 6 }, { text: 'RESPONSABLE', bold: true, fontSize: 6 }, { text: 'PRODUCTO DESTINO', bold: true, fontSize: 6 }, { text: 'KARDEX', bold: true, fontSize: 6 }],
        ...rows,
        [{ text: 'TOTALES', bold: true, fontSize: 6 }, { text: `EXC: ${roundQuantity(totalExcess)}`, bold: true, fontSize: 6 }, { text: `FAL: ${roundQuantity(totalShortage)}`, bold: true, fontSize: 6 }, '', '', '', '', ''],
    ] },
});

const dataPdfReturnTransferVoucher = (transfer) => [
    {
        image: 'data:image/png;base64,'+ fs.readFileSync(imagePath,'base64'),
        width: 60,
        absolutePosition: { x:30, y: 15 }
    },
    { text: 'TRASLADO: ' + transfer.cod, style: 'fechaDoc',
      absolutePosition: {  y: 30 }
    },
    { text: new Date(transfer.date_send).toLocaleDateString('es-ES', options),  style: 'fechaDoc', absolutePosition: {  y: 40 }},
    { text: 'GUÍA DE TRASLADO', style: 'title2',bold:true , fontSize:13},
    { text: 'ORIGEN:', style: 'datos_person', bold:true ,fontSize:10, margin:[0,0,8,0] },
    {
        columns: [
            { text: `Sucursal:`, bold:true ,style: 'text',width: 45, },
            { text: `${transfer.sucursal_send.name}`, style: 'text',  },
            { text: `Fecha envió:`, bold:true ,style: 'text',width: 80, },
            { text:  moment(transfer.date_send).format('DD/MM/YYYY HH:mm:ss'), style: 'text',  },
        ]
    },
    { text: 'DESTINO:', style: 'datos_person', bold:true ,fontSize:10, margin:[0,5,0,0] },
    {
        columns: [
            { text: `Sucursal:`, bold:true ,style: 'text',width: 45, },
            { text: `${transfer.sucursal_received.name}`, style: 'text',  },
        ]
    },
    { text: 'DETALLE DE LOS PRODUCTOS:', style: 'datos_person',bold:true ,fontSize:10, margin:[0,5,0,0] },
    {
        style: 'tableExample',
        table: {
            widths: [45, '*', 40, 85],
            body: [
                [
                    {text:'CÓDIGO', fontSize:8 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'DETALLE', fontSize:8,fillColor: '#eeeeee', bold:true}, 
                    {text:'UND',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true},
                    {text:'CANT. ENVIADO',alignment: 'center', fontSize:8,fillColor: '#eeeeee', bold:true},
                ]
            ]
        }
    },
    createVoucherClosingSection(transfer),
];

const createVoucherClosingSection = (transfer, includeReceptionObservations = false) => ({
    unbreakable: true,
    stack: [
        {
            margin: [0, 10, 0, 0],
            style: 'tableExample',
            table: {
                widths: includeReceptionObservations ? ['*', '*'] : ['*'],
                body: includeReceptionObservations
                    ? [
                        [
                            { text: 'OBSERVACIONES ENVÍO', fontSize: 9, fillColor: '#eeeeee', bold: true },
                            { text: 'OBSERVACIONES RECEPCIÓN', fontSize: 9, fillColor: '#eeeeee', bold: true },
                        ],
                        [
                            { text: `${transfer?.observations_send ?? ''}`, style: 'text', fontSize: 8 },
                            { text: `${transfer?.observations_received ?? ''}`, style: 'text', fontSize: 8 },
                        ],
                    ]
                    : [
                        [{ text: 'OBSERVACIONES ENVÍO', fontSize: 9, fillColor: '#eeeeee', bold: true }],
                        [{ text: `${transfer?.observations_send ?? ''}`, style: 'text', fontSize: 8 }],
                    ],
            },
        },
        {
            margin: [0, 3, 0, 0],
            columns: [
                { text: `P/${transfer.type_registry} NRO:`, bold: true, style: 'text', width: includeReceptionObservations ? 95 : 65 },
                { text: `${transfer.registry_number}`, style: 'text' },
                { text: 'BALANZA:', bold: true, style: 'text', width: 58 },
                { text: `${transfer?.scale?.name}`, style: 'text' },
            ],
        },
        {
            margin: [0, includeReceptionObservations ? 10 : 40, 0, 0],
            columns: [
                { text: '-----------------------------------------', bold: true, style: 'text', alignment: 'center' },
                { text: '-----------------------------------------', bold: true, style: 'text', alignment: 'center' },
            ],
        },
        {
            margin: [0, -5, 0, 0],
            columns: [
                { text: 'Entregue conforme', bold: true, style: 'text', alignment: 'center' },
                { text: 'Recibí conforme', bold: true, style: 'text', alignment: 'center' },
            ],
        },
        {
            margin: [0, -2, 0, 0],
            columns: [
                { text: 'Responsable de almacén', style: 'text', alignment: 'center' },
                { text: 'Chofer', style: 'text', alignment: 'center' },
            ],
        },
    ],
});

const dataPdfReturnReceptionVoucher = (transfer) => {
    const dataPdf = dataPdfReturnTransferVoucher(transfer);
    dataPdf[0] = {
        ...dataPdf[0],
        width: 50,
        absolutePosition: { x: 18, y: 12 },
    };
    dataPdf[1] = {
        text: `RECEPCIÓN: ${transfer.cod}`,
        style: 'fechaDocDetails',
        absolutePosition: { y: 16 },
    };
    dataPdf[2] = {
        text: moment(transfer.date_received).format('DD/MM/YYYY HH:mm:ss'),
        style: 'fechaDocDetails',
        absolutePosition: { y: 25 },
    };
    dataPdf[3] = {
        text: 'GUÍA DE RECEPCIÓN',
        style: 'title2',
        bold: true,
        fontSize: 11,
        margin: [0, 32, 0, 8],
    };
    dataPdf[5] = {
        columnGap: 8,
        columns: [
            {
                width: '55%',
                fontSize: 7,
                text: [
                    { text: 'Sucursal: ', bold: true },
                    { text: transfer.sucursal_send.name },
                ],
            },
            {
                width: '45%',
                fontSize: 7,
                text: [
                    { text: 'Fecha envío: ', bold: true },
                    { text: moment(transfer.date_send).format('DD/MM/YYYY HH:mm:ss') },
                ],
            },
        ],
    };
    dataPdf[7] = {
        columnGap: 8,
        columns: [
            {
                width: '55%',
                fontSize: 7,
                text: [
                    { text: 'Sucursal: ', bold: true },
                    { text: transfer.sucursal_received.name },
                ],
            },
            {
                width: '45%',
                fontSize: 7,
                text: [
                    { text: 'Fecha recepción: ', bold: true },
                    { text: moment(transfer.date_received).format('DD/MM/YYYY HH:mm:ss') },
                ],
            },
        ],
    };
    dataPdf[9].table.widths = ['*', 18, 36, 36, 38, 42, 34, 44, 36];
    dataPdf[9].table.headerRows = 1;
    dataPdf[9].table.dontBreakRows = true;
    dataPdf[9].table.body[0] = [
        { text: 'DETALLE', fontSize: 6, fillColor: '#eeeeee', bold: true },
        { text: 'UND', alignment: 'center', fontSize: 6, fillColor: '#eeeeee', bold: true },
        { text: 'ENVIADO', alignment: 'center', fontSize: 6, fillColor: '#eeeeee', bold: true },
        { text: 'RECIBIDO', alignment: 'center', fontSize: 6, fillColor: '#eeeeee', bold: true },
        { text: 'NORMAL', alignment: 'center', fontSize: 6, fillColor: '#eeeeee', bold: true },
        { text: 'BLOQUEADO', alignment: 'center', fontSize: 6, fillColor: '#eeeeee', bold: true },
        { text: 'DIF. %', alignment: 'center', fontSize: 6, fillColor: '#eeeeee', bold: true },
        { text: 'ESTADO', alignment: 'center', fontSize: 6, fillColor: '#eeeeee', bold: true },
        { text: 'OBS.', alignment: 'center', fontSize: 6, fillColor: '#eeeeee', bold: true },
    ];
    dataPdf[10] = createVoucherClosingSection(transfer, true);
    return dataPdf;
};

module.exports = {
    generatePdfReports,
    generateExcelReports,
    printTransferVoucher,
    printTransferReceptionVoucher,
}
