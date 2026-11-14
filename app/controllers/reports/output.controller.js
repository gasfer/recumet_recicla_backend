const { buildOperationVoucher } = require('../../helpers/generator-pdf/operation-voucher.document');
const { sendReportPdf } = require('../../services/pdf/report-pdf.service');
const { tabularReport } = require('../../helpers/generator-pdf/tabular-report.adapter');
const { Output, DetailsOutput, Sucursal, Storage, Client, sequelize } = require('../../database/config');
const moment = require('moment');
const NumeroALetras = require("../../helpers/numeros-aletras");
const { response } = require("express");
const { getNumberDecimal } = require("../../helpers/company");
const { buildStandardReportHeader } = require('../../helpers/generator-pdf/voucher-template.helper');
const { buildOutputSearch, buildOutputWhere, outputOrder, sortOutputQuantities } = require('../../services/output-report-query.service');
const { excelNumberMask, formatDecimalEsBo, exactAdd } = require('../../helpers/number-formatter');
const { buildOutputReportExcel } = require('../../services/output-report-excel.service');
const { isKilogramUnit } = require('../../helpers/kilogram-units');
moment.locale('es'); 

const quantitySummaryByUnit = (rows, decimal) => {
    const totals = new Map();
    rows.forEach(row => {
        const unit = String(row.product?.unit?.siglas || 'SIN UNIDAD').trim().toUpperCase();
        totals.set(unit, exactAdd(totals.get(unit) || '0', row.dataValues?.suma_quantity || 0));
    });
    return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right, 'es'))
        .map(([unit, quantity]) => `${unit}: ${formatDecimalEsBo(Number(quantity), decimal)}`).join(' · ');
};

async function outputReportContext(params = {}, auth = {}) {
    const company = await resolveReportCompany(params.id_sucursal);
    if (!params.id_sucursal) company.branchName = 'Todas las sucursales';
    const filters = [];
    let period = params.date1 || 'Todos';
    if (params.filterBy === 'MONTH' && params.date1 && params.date2) {
        period = moment(`${params.date2}-${params.date1}-01`, 'YYYY-MM-DD').locale('es').format('MMMM [de] YYYY');
    } else if (params.filterBy === 'RANGE') {
        period = [params.date1, params.date2].filter(Boolean).join(' al ') || 'Todos';
    } else if (params.filterBy === 'YEAR') {
        period = params.date1 || 'Todos';
    }
    filters.push(`Período: ${period}`);
    filters.push(`Estado: ${params.status ? (params.status === 'INACTIVE' ? 'Anulados' : 'Activos') : 'Todos'}`);
    if (params.id_sucursal) filters.push(`Sucursal: ${company.branchName}`);
    if (params.id_storage) {
        const storage = await Storage.findByPk(params.id_storage, { attributes: ['name'] });
        filters.push(`Almacén: ${storage?.name || `ID ${params.id_storage}`}`);
    }
    if (params.id_client) {
        const client = await Client.findByPk(params.id_client, { attributes: ['full_names'] });
        filters.push(`Cliente: ${client?.full_names || `ID ${params.id_client}`}`);
    }
    if (params.type_registry) filters.push(`Tipo de documento: ${params.type_registry}`);
    if (params.type_output) filters.push(`Tipo de venta: ${params.type_output}`);
    if (params.type_pay) filters.push(`Condición de pago: ${params.type_pay}`);
    if (params.type && params.query) filters.push(`Búsqueda (${params.type}): ${params.query}`);
    if (auth.full_names) filters.push(`Emitido por: ${auth.full_names}`);
    return { company, filters };
}

const generatePdfReports = async (req = request, res = response) => {
    try {
        const decimal = await getNumberDecimal();
        const outputs = await returnDataOutput(req.query);
        const context = await outputReportContext(req.query, req.userAuth);
        let dataPdf = dataPdfReturn(req.userAuth); //PDF 
        let total = '0';
        let total_quantity = '0';
        outputs.forEach(output => {
            total = exactAdd(total, output.total || 0);
            total_quantity = exactAdd(total_quantity, output.total_quantity || 0);
            const tableData = [
                {text:String(dataPdf[5].table.body.length), fontSize:9, alignment: 'center'},
                {text:output?.cod, fontSize:9}, 
                {text:moment(output?.date_output).format('DD/MM/YYYY HH:mm:ss'), fontSize:9}, 
                {text:output?.type_registry, fontSize:9}, 
                {text:output?.number_registry, fontSize:9}, 
                {text:output?.client?.full_names, fontSize:8}, 
                {text:output?.voucher, fontSize:9},
                {text:output?.type_output, fontSize:9},
                {text:output?.type_payment, fontSize:9},
                {
                    text: (output.detailsOutput || [])
                        .map(detail => {
                            const productName = detail.product?.name || '';
                            const quantity = detail.quantity;
                            const unit = detail.product?.unit?.siglas || '';
                            return `${productName} [${quantity} ${unit}]`;
                        })
                        .join(', '), 
                    fontSize: 9,
                }, 
                {text:output?.comments, fontSize:9}, 
                {text:formatDecimalEsBo(Number(output?.total_quantity), decimal), fontSize:9, alignment: 'right'},  
                {text:formatDecimalEsBo(Number(output.total), decimal), fontSize:9, alignment: 'right'},
            ];
            dataPdf[5].table.body.push(tableData);
        });
        if (outputs.length) dataPdf[5].table.body.push([
            {colSpan: 11, text:`TOTAL GENERAL: ${NumeroALetras(Number(total))}`,fontSize:10,},
            {text:''}, {text:''}, {text:''}, {text:''}, {text:''},
            {text:''}, {text:''}, {text:''}, {text:''}, {text:''},
            {text:`${formatDecimalEsBo(Number(total_quantity), decimal)} kg`, bold: true, fontSize:10, alignment: 'right'},
            {text: `Bs. ${formatDecimalEsBo(Number(total), decimal)}`, bold: true, fontSize:10, alignment: 'right'}
        ]);
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE VENTAS', paper: 'A4', orientation: 'landscape',
            reportTheme: 'recumet',
            company: context.company,
            filters: context.filters,
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'output-generatePdfReports.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el reporte PDF de ventas' });
    }
}

const dataPdfReturn = (auth) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE VENTAS', auth, details: 'Reporte generado con los parámetros establecidos' }),
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [26,48,70,43,48,75,55,52,52,'*','*',50,56],
            body: [
                [
                    {text:'N.º', fontSize:9,fillColor: '#eeeeee', bold:true},
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
        {text:'FECHA DE VENTA', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'TIPO DE DOCUMENTO', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'N.º DE DOCUMENTO', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'CLIENTE', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'TIPO DE VENTA', fontSize:9,fillColor: '#eeeeee', bold:true},
                    {text:'CONDICIÓN DE PAGO', fontSize:9,fillColor: '#eeeeee', bold:true},
                    {text:'MEDIO DE PAGO', fontSize:9,fillColor: '#eeeeee', bold:true},
                    {text:'DETALLE', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'OBSERVACIONES', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'CANTIDAD (KG)',alignment: 'center', fontSize:9,fillColor: '#eeeeee', bold:true},
                    {text:'TOTAL Bs',alignment: 'center', fontSize:9,fillColor: '#eeeeee', bold:true},
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
    const context = await outputReportContext(req.query, req.userAuth);
    const numberFormat = excelNumberMask(decimal);
    const data = outputs.map((output, index) => [
      index + 1,
      String(output.cod ?? ''),
      output.date_output ? new Date(output.date_output) : null,
      String(output.type_registry ?? ''),
      String(output.number_registry ?? ''),
      String(output.client?.full_names ?? ''),
      String(output.voucher ?? ''),
      String(output.type_output ?? ''),
      String(output.type_payment ?? ''),
      (output.detailsOutput || []).map(detail => `${detail.product?.name ?? ''} [${detail.quantity} ${detail.product?.unit?.siglas ?? ''}]`).join('\n'),
      String(output.comments ?? ''),
      Number(output.total_quantity ?? 0),
      Number(output.total ?? 0),
    ]);
    const totals = outputs.length ? {
      total_quantity: Number(outputs.reduce((sum, output) => exactAdd(sum, output.total_quantity || 0), '0')),
      total: Number(outputs.reduce((sum, output) => exactAdd(sum, output.total || 0), '0')),
    } : {};
    const workbook = buildOutputReportExcel({
      title: 'REPORTE DE VENTAS', sheetName: 'Ventas', filters: context.filters, company: context.company,
      rows: data, decimal, totals,
      columns: [
        { key: 'row_number', header: 'N.º', width: 8 },
        { key: 'cod', header: 'Código', width: 16 },
        { key: 'date_output', header: 'Fecha de venta', width: 22, numberFormat: 'dd/mm/yyyy hh:mm:ss' },
        { key: 'type_registry', header: 'Tipo de documento', width: 20 },
        { key: 'number_registry', header: 'N.º de documento', width: 20 },
        { key: 'client', header: 'Cliente', width: 34 },
        { key: 'voucher', header: 'Tipo de venta', width: 22 },
        { key: 'type_output', header: 'Condición de pago', width: 18 },
        { key: 'type_payment', header: 'Medio de pago', width: 18 },
        { key: 'details', header: 'Detalle', width: 56 },
        { key: 'comments', header: 'Observaciones', width: 36 },
        { key: 'total_quantity', header: 'Cantidad (KG)', width: 18, numberFormat },
        { key: 'total', header: 'Total Bs', width: 18, numberFormat },
      ],
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=ventas-report.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      ok: false,
      errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
  });
  };
}

const returnDataOutput = async (params) => {
    const where = buildOutputWhere(params);
    const search = buildOutputSearch(params);
    const { order, sortByTotalQuantity } = outputOrder(params);
    const includes = [
        { association: 'client' },
        { association: 'sucursal',attributes: ['name', 'city', 'email'], include: [{ association: 'company', attributes: ['nit', 'email'] }] },
        { association: 'storage',attributes: ['name'] },
        { association: 'scale', attributes: ['name']},
        { association: 'user', attributes: ['full_names','number_document']},
        { association: 'bank'},
        {
            association: 'detailsOutput',
            attributes: ['quantity'],
            include: [{ association: 'product', attributes: ['cod', 'name'], include: [{ association: 'unit', attributes: ['name', 'siglas'] }] }]
        }
    ];
    if (search?.association) {
        const searchInclude = includes.find(include => include.association === search.association);
        if (searchInclude) {
            searchInclude.where = search.condition;
            searchInclude.required = true;
        }
    }
    const optionsDb = {
        order,
        where,
        include: includes,
    };
    const outputs = await Output.findAll(optionsDb);
    for (const output of outputs) {
        output.total_quantity = (output.detailsOutput || [])
            .filter(item => isKilogramUnit(item.product?.unit?.siglas))
            .reduce((sum, item) => exactAdd(sum, item.quantity || 0), '0');
    }
    return sortOutputQuantities(outputs, sortByTotalQuantity);
}

const generatePdfDetailsReports = async (req = request, res = response) => {
    try {
        const decimal = await getNumberDecimal();
        const detailsOutput = await returnDataDetailsOutput(req.query);
        const context = await outputReportContext(req.query, req.userAuth);
        let dataPdf = dataDetailsPdfReturn(req.userAuth); //PDF 
        let total = '0';
        detailsOutput.forEach((detail, index) => {
            total = exactAdd(total, detail.dataValues.suma_total || 0);
            const tableData = [
                {text:String(index + 1), fontSize:9, alignment: 'center'},
                {text:detail?.product.cod, fontSize:9}, 
                {text:detail?.product.name, fontSize:9}, 
                {text:detail?.product.unit?.siglas || '', fontSize:9},
                {text:formatDecimalEsBo(Number(detail?.price), decimal), fontSize:9, alignment: 'right'},  
                {text:formatDecimalEsBo(Number(detail?.dataValues.suma_quantity), decimal), fontSize:9, alignment: 'right'}, 
                {text:formatDecimalEsBo(Number(detail?.dataValues.suma_total), decimal), fontSize:9, alignment: 'right'},
            ];
            dataPdf[5].table.body.push(tableData);
        });
        if (detailsOutput.length) dataPdf[5].table.body.push([
            {text:'TOTALES POR UNIDAD', colSpan: 4, bold:true},
            {text:''}, {text:''}, {text:''}, {text:''},
            {text:quantitySummaryByUnit(detailsOutput, decimal), bold: true, fontSize:9, alignment: 'right'},
            {text: `${formatDecimalEsBo(Number(total), decimal)}`, bold: true, fontSize:10, alignment: 'right'}
        ]);
        const document = tabularReport(dataPdf[5].table, {
            title: 'REPORTE DE VENTAS DETALLADAS', paper: 'A4', orientation: 'landscape',
            reportTheme: 'recumet',
            company: context.company,
            filters: context.filters,
            date: new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        });
        await sendReportPdf(res, document, 'output-generatePdfDetailsReports.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'No se pudo generar el PDF. Intente nuevamente.' });
    }
}

const resolveReportCompany = async idSucursal => {
    const id = Number(idSucursal);
    if (!Number.isInteger(id) || id <= 0) return { branchName: 'CASA MATRIZ' };
    const branch = await Sucursal.findByPk(id, { include: [{ association: 'company', attributes: ['nit', 'email'] }] });
    return branch ? { branchName: branch.name, city: branch.city, nit: branch.company?.nit, email: branch.email || branch.company?.email } : { branchName: 'CASA MATRIZ' };
};

const dataDetailsPdfReturn = (auth) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE VENTAS DETALLADAS', auth, details: 'Reporte generado con los parámetros establecidos' }),
    {
        style: 'tableReport',
        absolutePosition: { x:20, y: 95 },
        table: {
            headerRows: 1,
            widths: [30,55,'*',45,70,72,80],
            body: [
                [
                    {text:'N.º', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'CÓDIGO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'PRODUCTO', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'UNIDAD', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'PRECIO UNITARIO Bs', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                    {text:'CANTIDAD', fontSize:9 ,fillColor: '#eeeeee', bold:true}, 
                    {text:'IMPORTE Bs', fontSize:9 ,fillColor: '#eeeeee', bold:true},
                ]
            ]   ,
            layout: 'lightHorizontalLines'
        }
    }
];

const generateExcelDetailsReports = async (req = request, res = response) => {
    try {
        const detailsOutput = await returnDataDetailsOutput(req.query)
        const decimal = await getNumberDecimal();
        const context = await outputReportContext(req.query, req.userAuth);
        const numberFormat = excelNumberMask(decimal);
        const data = detailsOutput.map((detail, index) => [
            index + 1,
            String(detail.product?.cod ?? ''),
            String(detail.product?.name ?? ''),
            String(detail.product?.unit?.siglas ?? ''),
            Number(detail.price ?? 0),
            Number(detail.dataValues.suma_quantity ?? 0),
            Number(detail.dataValues.suma_total ?? 0),
        ]);
        const totalAmount = detailsOutput.reduce((sum, detail) => exactAdd(sum, detail.dataValues.suma_total || 0), '0');
        const totals = detailsOutput.length ? {
            label: 'TOTALES POR UNIDAD',
            suma_quantity: quantitySummaryByUnit(detailsOutput, decimal),
            suma_total: Number(totalAmount),
        } : {};
        const workbook = buildOutputReportExcel({
            title: 'REPORTE DE VENTAS DETALLADAS', sheetName: 'Ventas detalle', filters: context.filters, company: context.company,
            rows: data, decimal, totals,
            columns: [
                { key: 'row_number', header: 'N.º', width: 8 },
                { key: 'cod', header: 'Código', width: 20 },
                { key: 'product', header: 'Producto', width: 56 },
                { key: 'unit', header: 'Unidad', width: 12 },
                { key: 'price', header: 'Precio unitario Bs', width: 22, numberFormat },
                { key: 'suma_quantity', header: 'Cantidad', width: 20, numberFormat },
                { key: 'suma_total', header: 'Importe Bs', width: 22, numberFormat },
            ],
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=ventas-detalle-report.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        ok: false,
        errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
    });
    };
}

const returnDataDetailsOutput = async (params) => {
    const where = buildOutputWhere(params, '"output"."date_output"');
    const search = buildOutputSearch(params);
    const outputInclude = { association: 'output', attributes: [], where };
    if (search?.association) {
        outputInclude.include = [{ association: search.association, attributes: [], where: search.condition, required: true }];
    }
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
                include: [{ association: 'unit', attributes: ['id', 'name', 'siglas'] }],
            },
            outputInclude
        ],
        group: [ 'id_product','product.id','product->unit.id','price']
    };
    const rows = await DetailsOutput.findAll(optionsDb);
    return rows.sort((left, right) => {
        const codeOrder = String(left.product?.cod || '').localeCompare(String(right.product?.cod || ''), 'es', { numeric: true });
        return codeOrder || Number(left.price || 0) - Number(right.price || 0);
    });
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
        const document = buildOperationVoucher(output, { kind: 'sale', decimal, format: req.query.format });
        await sendReportPdf(res, document, 'boleta-venta-' + id_output + '.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'Error al generar el comprobante de venta' });
    }
}

module.exports = {
    generatePdfReports,
    generateExcelReports,
    generatePdfDetailsReports,
    generateExcelDetailsReports,
    printOutputVoucher,

}
