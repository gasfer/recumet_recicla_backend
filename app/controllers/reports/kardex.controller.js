const { sendReportPdf } = require('../../services/pdf/report-pdf.service');
const { tabularReport } = require('../../helpers/generator-pdf/tabular-report.adapter');
const { Op } = require("sequelize");
const { sequelize, ViewKardex, Sucursal } = require("../../database/config");
const path = require("path");
const fs = require("fs");
const moment = require("moment");
const { whereDateForType } = require("../../helpers/where_range");
const ExcelJS = require("exceljs");
const { getNumberDecimal } = require("../../helpers/company");
const { enrichKardexHistory } = require("../../services/kardex-history-enrichment.service");
const { buildStandardReportHeader } = require('../../helpers/generator-pdf/voucher-template.helper');
moment.locale("es");

const { getReportLogoPath } = require('../../helpers/report-logo');
const imagePath = getReportLogoPath();

// -------------------- PDF REPORTS --------------------

const formatEuro = (value, decimal = 2) => {
    if (value === null || value === undefined) return "0";
    return Number(value).toLocaleString("de-DE", {
        minimumFractionDigits: decimal,
        maximumFractionDigits: decimal,
    });
};

const valuedText = (kardex, field, decimal = 2) => {
    if (kardex.valuation?.status !== 'VALUED') return 'SIN VALORAR';
    return formatEuro(kardex.valuation?.[field], decimal);
};

const responsibleName = (kardex) => kardex.responsible?.name || 'RESPONSABLE NO DISPONIBLE';

const generatePdfReports = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2 } = req.query;
        const kardexes = await returnDataKardex(req.query);
        await enrichKardexHistory(kardexes);
        const decimal = await getNumberDecimal();
        let dataPdf = dataPdfReturn(req.userAuth); //PDF
        kardexes.forEach((kardex) => {
            const tableData = [
                { text: kardex?.type == "INPUT" ? "ENTRADA" : "SALIDA", fontSize: 8 },
                { text: moment(kardex?.date).format("DD/MM/YYYY"), fontSize: 8 },
                { text: kardex?.detail, fontSize: 8 },
                { text: kardex?.product.name, fontSize: 8 },
                { text: kardex?.product.unit.siglas, fontSize: 8 },

                {
                    text: formatEuro(kardex?.quantity_input, decimal),
                    fontSize: 8,
                    alignment: "right",
                },
                {
                    text: formatEuro(kardex?.quantity_output, decimal),
                    fontSize: 8,
                    alignment: "right",
                },
                {
                    text: formatEuro(kardex?.saldo, decimal),
                    fontSize: 8,
                    alignment: "right",
                },

                { text: kardex?.sucursal.name, fontSize: 8 },
                { text: kardex?.storage.name, fontSize: 8 },
                { text: valuedText(kardex, 'applied_unit_cost', decimal), fontSize: 8, alignment: 'right' },
                { text: kardex.valuation?.status === 'VALUED' ? valuedText(kardex, kardex.type === 'INPUT' ? 'input_value' : 'output_value', decimal) : 'SIN VALORAR', fontSize: 8, alignment: 'right' },
                { text: responsibleName(kardex), fontSize: 8 },
            ];
            dataPdf[5].table.body.push(tableData);
        });
        const formatDate1 =
            filterBy == "MONTH" ? "MM" : filterBy == "YEAR" ? "YYYY" : "DD-MM-YYYY";
        const formatDate2 = filterBy == "MONTH" ? "YYYY" : "DD-MM-YYYY";
        const tables = dataPdf.filter(node => node?.table?.body?.length && node.table.headerRows > 0);
        const sections = tables.map(table => tabularReport(table.table, {}));
        await sendReportPdf(res, {
            title: 'REPORTE DE KARDEX', paper: 'A4', orientation: 'landscape', sections,
            company: await resolveReportCompany(req.query.id_sucursal),
            filters: ['Impreso por: ' + (req.userAuth?.full_names || ''), ...Object.entries(req.query).map(([key, value]) => key + ': ' + value)],
        }, 'generatePdfReports.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'No se pudo generar el PDF. Intente nuevamente.' });
    }
};
const isAllProductsKardexRequest = ({ category_types } = {}) => {
    if (!category_types) return true;
    if (Array.isArray(category_types)) {
        return category_types.every((categoryType) => !String(categoryType ?? '').trim());
    }
    return !String(category_types).trim();
};

const shouldIncludeKardexRowNumber = ({ category_types } = {}) => {
    if (isAllProductsKardexRequest({ category_types })) return true;
    const categoryTypes = (Array.isArray(category_types) ? category_types : [category_types])
        .map((categoryType) => String(categoryType ?? '').trim())
        .filter(Boolean);
    return categoryTypes.length === 1 && ['RAW_MATERIAL', 'FINISHED_PRODUCT'].includes(categoryTypes[0]);
};

//TODO:
const generatePdfReportsKardexFisico = async (
    req = request,
    res = response
) => {
    try {
        const { id_sucursal, id_storage, filterBy, date1, date2 } = req.query;
        const includeRowNumber = shouldIncludeKardexRowNumber(req.query);
        const decimal = await getNumberDecimal();
        const kardexes = await returnDataInputKardexFisico(req.query);

        // Calculate initial balances for the products
        const whereDate = whereDateForType(
            filterBy,
            date1,
            date2,
            '"ViewKardex"."date"'
        );

        if (kardexes && kardexes.length > 0) {
            const productIds = kardexes.map(k => k.id_product);
            const firstMovements = await ViewKardex.findAll({
                attributes: [
                    'id_product',
                    [sequelize.fn('MIN', sequelize.col('id')), 'min_id']
                ],
                where: {
                    [Op.and]: [
                        id_sucursal ? { id_sucursal } : {},
                        id_storage ? { id_storage } : {},
                        { id_product: { [Op.in]: productIds } },
                        { date: whereDate }
                    ]
                },
                group: ['id_product'],
                raw: true
            });
            const minIds = firstMovements.map(m => m.min_id).filter(Boolean);
            const initialBalances = minIds.length > 0 ? await ViewKardex.findAll({
                attributes: ['id_product', 'saldo_inicial'],
                where: {
                    id: { [Op.in]: minIds }
                },
                raw: true
            }) : [];
            const balanceMap = {};
            for (const bal of initialBalances) {
                balanceMap[bal.id_product] = bal.saldo_inicial;
            }
            for (const kardex of kardexes) {
                const quantity_inicial = Number(balanceMap[kardex.id_product] || 0);
                kardex.dataValues.quantity_inicial = quantity_inicial;
                kardex.dataValues.quantity_input = Number(kardex.dataValues.quantity_input) + quantity_inicial;
                kardex.dataValues.quantity_saldo = Number(kardex.dataValues.quantity_saldo) + quantity_inicial;
            }
        }

        // Apply showZeroSaldo filter to match what is visible in the frontend table
        const showZeroSaldo = req.query.showZeroSaldo === 'true';
        const filteredKardexes = showZeroSaldo
            ? kardexes
            : kardexes.filter(k => Number(k.dataValues.quantity_saldo) > 0);

        let dataPdf = dataPdfReturnKardexFisicoVerticalOnlyReciclen(
            req.userAuth,
            filteredKardexes,
            includeRowNumber,
            Math.max(22, String(Math.max(filteredKardexes.length, 1)).length * 5 + 10)
        ); //PDF

        const columnCount = includeRowNumber ? 7 : 6;
        const labelColumnSpan = includeRowNumber ? 4 : 3;

        let currentCategory = null;
        let categoryInput = 0;
        let categoryOutput = 0;
        let categorySaldo = 0;

        let totalInput = 0;
        let totalOutput = 0;
        let totalSaldo = 0;

        const addCategorySubtotalRow = (categoryName) => {
            const subtotalRow = [
                {
                    text: `TOTAL ${categoryName.toUpperCase()}`,
                    fontSize: 8,
                    bold: true,
                    fillColor: "#E2E8F0",
                    colSpan: labelColumnSpan,
                    margin: [5, 2, 5, 2]
                },
                ...Array(labelColumnSpan - 1).fill({}),
                {
                    text: formatEuro(categoryInput, decimal),
                    fontSize: 8,
                    bold: true,
                    fillColor: "#E2E8F0",
                    alignment: "right"
                },
                {
                    text: formatEuro(categoryOutput, decimal),
                    fontSize: 8,
                    bold: true,
                    fillColor: "#E2E8F0",
                    alignment: "right"
                },
                {
                    text: formatEuro(categorySaldo, decimal),
                    fontSize: 8,
                    bold: true,
                    fillColor: "#E2E8F0",
                    alignment: "right"
                }
            ];
            dataPdf[5].table.body.push(subtotalRow);
        };

        filteredKardexes.forEach((kardex, index) => {
            const categoryName = kardex.product.category.name;
            if (categoryName !== currentCategory) {
                if (currentCategory !== null) {
                    addCategorySubtotalRow(currentCategory);
                    // Add spacing row in pdf
                    dataPdf[5].table.body.push([
                        { text: "", colSpan: columnCount, border: [false, false, false, false] },
                        ...Array(columnCount - 1).fill({})
                    ]);
                }

                currentCategory = categoryName;
                categoryInput = 0;
                categoryOutput = 0;
                categorySaldo = 0;

                const categoryRow = [
                    {
                        text: categoryName.toUpperCase(),
                        fontSize: 9,
                        bold: true,
                        fillColor: "#2D3748",
                        color: "#ffffff",
                        colSpan: columnCount,
                        margin: [5, 2, 5, 2]
                    },
                    ...Array(columnCount - 1).fill({})
                ];
                dataPdf[5].table.body.push(categoryRow);
            }

            const tableData = [
                ...(includeRowNumber ? [{ text: index + 1, fontSize: 8, alignment: "center" }] : []),
                { text: kardex?.product.cod, fontSize: 8 },
                { text: kardex?.product.name, fontSize: 8 },
                { text: kardex?.product.unit.siglas, fontSize: 8 },

                {
                    text: formatEuro(kardex?.quantity_input, decimal),
                    fontSize: 8,
                    alignment: "right",
                },
                {
                    text: formatEuro(kardex?.quantity_output, decimal),
                    fontSize: 8,
                    alignment: "right",
                },
                {
                    text: formatEuro(kardex?.dataValues.quantity_saldo, decimal),
                    fontSize: 8,
                    alignment: "right",
                },
            ];

            categoryInput += Number(kardex.quantity_input);
            categoryOutput += Number(kardex.quantity_output);
            categorySaldo += Number(kardex.dataValues.quantity_saldo);

            totalInput += Number(kardex.quantity_input);
            totalOutput += Number(kardex.quantity_output);
            totalSaldo += Number(kardex.dataValues.quantity_saldo);

            dataPdf[5].table.body.push(tableData);
        });

        // Add last category subtotal row
        if (currentCategory !== null) {
            addCategorySubtotalRow(currentCategory);
        }

        // Add spacing and final totals row
        dataPdf[5].table.body.push([
            { text: "", colSpan: columnCount, border: [false, false, false, false] },
            ...Array(columnCount - 1).fill({})
        ]);

        const totalsRow = [
            {
                text: "TOTALES",
                fontSize: 9,
                bold: true,
                fillColor: "#eeeeee",
                colSpan: labelColumnSpan,
                margin: [5, 2, 5, 2]
            },
            ...Array(labelColumnSpan - 1).fill({}),
            {
                text: formatEuro(totalInput, decimal),
                fontSize: 9,
                bold: true,
                fillColor: "#eeeeee",
                alignment: "right"
            },
            {
                text: formatEuro(totalOutput, decimal),
                fontSize: 9,
                bold: true,
                fillColor: "#eeeeee",
                alignment: "right"
            },
            {
                text: formatEuro(totalSaldo, decimal),
                fontSize: 9,
                bold: true,
                fillColor: "#eeeeee",
                alignment: "right"
            }
        ];
        dataPdf[5].table.body.push(totalsRow);
        const formatDate1 =
            filterBy == "MONTH" ? "MM" : filterBy == "YEAR" ? "YYYY" : "DD-MM-YYYY";
        const formatDate2 = filterBy == "MONTH" ? "YYYY" : "DD-MM-YYYY";
        const tables = dataPdf.filter(node => node?.table?.body?.length && node.table.body[0].some(cell => String(cell?.text || cell || '').trim()));
        const sections = tables.map(table => tabularReport(table.table, {}));
        await sendReportPdf(res, {
            title: 'KARDEX FÍSICO', paper: 'A4', orientation: 'portrait', sections,
            company: await resolveReportCompany(req.query.id_sucursal),
            filters: ['Impreso por: ' + (req.userAuth?.full_names || ''), ...Object.entries(req.query).map(([key, value]) => key + ': ' + value)],
        }, 'generatePdfReportsKardexFisico.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'No se pudo generar el PDF. Intente nuevamente.' });
    }
};
//TODO:
const generatePdfReportsExistencia = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2 } = req.query;
        const kardexes = await returnDataKardex(req.query);
        await enrichKardexHistory(kardexes);
        const decimal = await getNumberDecimal();
        let totalFInput = 0,
            totalFOutput = 0,
            totalFSaldo = 0;
        let totalVInput = 0,
            totalVOutput = 0,
            totalVSaldo = 0;
        kardexes?.map((resp) => {
            resp.cost_price = resp.cost_unitario;
            resp.detallePrimary = resp.detail;
            totalFInput += Number(resp.quantity_input);
            totalFOutput += Number(resp.quantity_output);
            totalFSaldo += Number(resp.saldo);

            totalVInput += Number(resp.cost_input);
            totalVOutput += Number(resp.cost_output);
            totalVSaldo += Number(resp.cost_saldo);
        });
        let dataPdf = dataPdfReturnKardexExistencia(req.userAuth, kardexes); //PDF
        kardexes.forEach((kardex) => {
            const tableData = [
                { text: moment(kardex?.date).format("DD/MM/YYYY HH:mm"), fontSize: 8 },
                { text: kardex?.registry_number, fontSize: 8 },
                {
                    columns: [
                        { text: kardex?.detallePrimary, alignment: "left", fontSize: 8 },
                        { text: kardex?.sub_detail, alignment: "right", fontSize: 7 },
                    ],
                },

                {
                    text: formatEuro(kardex?.quantity_input, decimal),
                    fontSize: 8,
                    alignment: "right",
                    fillColor: "#DFF0D8",
                },
                {
                    text: formatEuro(kardex?.quantity_output, decimal),
                    fontSize: 8,
                    alignment: "right",
                    fillColor: "#F2DEDE",
                },
                {
                    text: formatEuro(kardex?.saldo, decimal),
                    fontSize: 8,
                    alignment: "right",
                    fillColor: "#D9EDF7",
                },

                {
                    text: formatEuro(kardex?.cost_unitario, decimal),
                    fontSize: 8,
                    alignment: "right",
                },

                {
                    text: formatEuro(kardex?.cost_input, decimal),
                    fontSize: 8,
                    alignment: "right",
                    fillColor: "#DFF0D8",
                },
                {
                    text: formatEuro(kardex?.cost_output, decimal),
                    fontSize: 8,
                    alignment: "right",
                    fillColor: "#F2DEDE",
                },
                {
                    text: formatEuro(kardex?.cost_saldo, decimal),
                    fontSize: 8,
                    alignment: "right",
                    fillColor: "#D9EDF7",
                },
            ];
            dataPdf[5].table.body.push(tableData);
        });

        dataPdf[5].table.body.push([
            { text: " ", fontSize: 8, colSpan: 9 },
            {},
            {},
            {},
            {},
            {},
            {},
            {},
            {},
            {},
        ]);
        dataPdf[5].table.body.push([
            { colSpan: 3, text: "Totales:", fontSize: 8, bold: true },
            {},
            {},
            {
                text: formatEuro(totalFInput, decimal),
                alignment: "right",
                fillColor: "#DFF0D8",
            },
            {
                text: formatEuro(totalFOutput, decimal),
                alignment: "right",
                fillColor: "#F2DEDE",
            },
            {
                text: formatEuro(totalFSaldo, decimal),
                alignment: "right",
                fillColor: "#D9EDF7",
            },
            {},
            {
                text: formatEuro(totalVInput, decimal),
                alignment: "right",
                fillColor: "#DFF0D8",
            },
            {
                text: formatEuro(totalVOutput, decimal),
                alignment: "right",
                fillColor: "#F2DEDE",
            },
            {
                text: formatEuro(totalVSaldo, decimal),
                alignment: "right",
                fillColor: "#D9EDF7",
            },
        ]);
        const formatDate1 =
            filterBy == "MONTH" ? "MM" : filterBy == "YEAR" ? "YYYY" : "DD-MM-YYYY";
        const formatDate2 = filterBy == "MONTH" ? "YYYY" : "DD-MM-YYYY";
        const tables = dataPdf.filter(node => node?.table?.body?.length && node.table.body[0].some(cell => String(cell?.text || cell || '').trim()));
        const sections = tables.map(table => tabularReport(table.table, {}));
        await sendReportPdf(res, {
            title: 'KARDEX DE EXISTENCIAS', paper: 'A4', orientation: 'landscape', sections,
            company: await resolveReportCompany(req.query.id_sucursal),
            filters: ['Impreso por: ' + (req.userAuth?.full_names || ''), ...Object.entries(req.query).map(([key, value]) => key + ': ' + value)],
        }, 'generatePdfReportsExistencia.pdf');
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, msg: 'No se pudo generar el PDF. Intente nuevamente.' });
    }
};

const resolveReportCompany = async idSucursal => {
    const id = Number(idSucursal);
    if (!Number.isInteger(id) || id <= 0) return { branchName: 'CASA MATRIZ' };
    const branch = await Sucursal.findByPk(id, { include: [{ association: 'company', attributes: ['nit', 'email'] }] });
    return branch ? { branchName: branch.name, city: branch.city, nit: branch.company?.nit, email: branch.email || branch.company?.email } : { branchName: 'CASA MATRIZ' };
};

const dataPdfReturn = (auth) => [
    ...buildStandardReportHeader({ title: 'REPORTE DE KARDEX', auth, details: 'Reporte generado con los parámetros establecidos' }),
    {
        style: "tableReport",
        absolutePosition: { x: 20, y: 95 },
        table: {
            headerRows: 1,
            widths: [35, 50, 65, "*", 30, 45, 45, 45, 50, 50, 50, 55, 65],
            body: [
                [
                    { text: "TIPO", fontSize: 8, fillColor: "#eeeeee", bold: true },
                    {
                        text: "FECHA KARDEX",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                    },
                    { text: "DETALLE", fontSize: 8, fillColor: "#eeeeee", bold: true },
                    { text: "PRODUCTO", fontSize: 8, fillColor: "#eeeeee", bold: true },
                    { text: "UND", fontSize: 8, fillColor: "#eeeeee", bold: true },
                    {
                        text: "CANT ENTRADA",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                    },
                    {
                        text: "CANT SALIDA",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                    },
                    { text: "CANT SALDO", fontSize: 8, fillColor: "#eeeeee", bold: true },
                    {
                        text: "SUCURSAL",
                        alignment: "center",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                    },
                    {
                        text: "ALMACÉN",
                        alignment: "center",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                    },
                    { text: "COSTO APLICADO BS.", fontSize: 8, fillColor: "#eeeeee", bold: true },
                    { text: "VALOR MOVIMIENTO BS.", fontSize: 8, fillColor: "#eeeeee", bold: true },
                    { text: "RESPONSABLE", fontSize: 8, fillColor: "#eeeeee", bold: true },
                ],
            ],
            layout: "lightHorizontalLines",
        },
    },
];
//TODO:
const dataPdfReturnKardexExistencia = (auth, kardex) => [
    ...buildStandardReportHeader({
        title: 'REPORTE DE KARDEX DE EXISTENCIA',
        auth,
        details: `PRODUCTO: ${kardex[0]?.product?.name || 'Sin producto'}`,
    }),
    {
        style: "tableReport",
        absolutePosition: { x: 20, y: 95 },
        table: {
            headerRows: 2,
            widths: [45, 45, "*", 55, 55, 55, 55, 60, 60, 60],
            body: [
                [
                    {
                        text: "FECHA",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        rowSpan: 2,
                    },
                    {
                        text: "N°",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        rowSpan: 2,
                    },
                    {
                        text: "DETALLE",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        rowSpan: 2,
                    },
                    {
                        text: "FISICO",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        colSpan: 3,
                        alignment: "center",
                    },
                    {},
                    {}, // Empty cells for colSpan
                    {
                        text: "P.U.",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        rowSpan: 2,
                        alignment: "center",
                    },
                    {
                        text: "VALORADO",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        colSpan: 3,
                        alignment: "center",
                    },
                    {},
                    {}, // Empty cells for colSpan
                    // { text: 'ALMACÉN', fontSize: 8, fillColor: '#eeeeee', bold: true, rowSpan: 2, alignment: 'center' }
                ],
                [
                    {}, // Empty cell due to rowSpan
                    {}, // Empty cell due to rowSpan
                    {}, // Empty cell due to rowSpan
                    {
                        text: "ENTRADA",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        alignment: "center",
                    },
                    {
                        text: "SALIDA",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        alignment: "center",
                    },
                    {
                        text: "SALDO",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        alignment: "center",
                    },
                    {}, // Empty cell due to rowSpan
                    {
                        text: "ENTRADA",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        alignment: "center",
                    },
                    {
                        text: "SALIDA",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        alignment: "center",
                    },
                    {
                        text: "SALDO",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        alignment: "center",
                    },
                    // {} // Empty cell due to rowSpan
                ],
                // Add more rows here...
            ],
            layout: "lightHorizontalLines",
        },
    },
];

const dataPdfReturnKardexFisicoVerticalOnlyReciclen = (auth, kardexes, includeRowNumber = false, rowNumberColumnWidth = 22) => [
    ...buildStandardReportHeader({
        title: 'REPORTE DE KARDEX FÍSICO',
        auth,
        details: `Detalle de los productos: ${kardexes[0]?.sucursal?.name || 'Todas las sucursales'}`,
    }),
    {
        style: "tableReport",
        absolutePosition: { x: 20, y: 95 },
        table: {
            headerRows: 2,
            widths: includeRowNumber
                ? [rowNumberColumnWidth, "auto", "*", "auto", "auto", "auto", "auto"]
                : ["auto", "*", "auto", "auto", "auto", "auto"],
            body: [
                [
                    ...(includeRowNumber ? [{
                        text: "N°",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        rowSpan: 2,
                        alignment: "center",
                    }] : []),
                    {
                        text: "CÓDIGO",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        rowSpan: 2,
                    },
                    {
                        text: "DETALLE",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        rowSpan: 2,
                    },
                    {
                        text: "UNIDAD",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        rowSpan: 2,
                    },
                    {
                        text: "FISICO",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        colSpan: 3,
                        alignment: "center",
                    },
                    {},
                    {},
                    // {text:'ALMACÉN',alignment: 'center', fontSize:7,fillColor: '#eeeeee', bold:true, rowSpan: 2},
                ],
                [
                    ...(includeRowNumber ? [{}] : []),
                    {},
                    {},
                    {},
                    {
                        text: "COMPRA",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        alignment: "center",
                    },
                    {
                        text: "VENTA",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        alignment: "center",
                    },
                    {
                        text: "SALDO",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                        alignment: "center",
                    },
                    // {},
                ],
            ],
            layout: "lightHorizontalLines",
        },
    },
];

// -------------------- EXCEL REPORTS --------------------
const generateExcelReports = async (req, res) => {
    try {
        const kardexes = await returnDataKardex(req.query);
        const decimal = await getNumberDecimal();

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Kardex");

        const headers = [
            "TIPO",
            "FECHA_KARDEX",
            "DETALLE",
            "PRODUCTO",
            "UND",
            "CANT_ENTRADA",
            "CANT_SALIDA",
            "CANT_SALDO",
            "COSTO_APLICADO_BS",
            "VALOR_MOVIMIENTO_BS",
            "ESTADO_VALORACION",
            "RESPONSABLE",
        ];
        worksheet.addRow(headers);

        kardexes.forEach((kardex) => {
            const row = worksheet.addRow([
                kardex.type === "INPUT" ? "ENTRADA" : "SALIDA",
                moment(kardex.date).format("DD/MM/YYYY HH:mm:ss"),
                kardex.detail,
                kardex.product.name,
                kardex.product.unit.siglas,
                Number(kardex.quantity_input),
                Number(kardex.quantity_output),
                Number(kardex.saldo),
                kardex.valuation?.status === 'VALUED' ? Number(kardex.valuation.applied_unit_cost) : 'SIN VALORAR',
                kardex.valuation?.status === 'VALUED'
                    ? Number(kardex.type === 'INPUT' ? kardex.valuation.input_value : kardex.valuation.output_value)
                    : 'SIN VALORAR',
                kardex.valuation?.status || 'UNVALUED',
                responsibleName(kardex),
            ]);

            [6, 7, 8, 9, 10].forEach(
                (i) => (row.getCell(i).numFmt = `#,##0.${"0".repeat(decimal)}`)
            );
        });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", "attachment; filename=kardex.xlsx");

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: "Error generando Excel" });
    }
};

const generateExcelReportsKardexFisico = async (req, res) => {
    try {
        const kardexes = await returnDataInputKardexFisico(req.query);
        const decimal = await getNumberDecimal();
        const { id_sucursal, id_storage, filterBy, date1, date2 } = req.query;
        const includeRowNumber = shouldIncludeKardexRowNumber(req.query);
        const labelColumnCount = includeRowNumber ? 4 : 3;
        const firstQuantityColumn = labelColumnCount + 1;
        const lastColumnLetter = includeRowNumber ? 'G' : 'F';

        // Calculate initial balances for the products
        const whereDate = whereDateForType(
            filterBy,
            date1,
            date2,
            '"ViewKardex"."date"'
        );

        if (kardexes && kardexes.length > 0) {
            const productIds = kardexes.map(k => k.id_product);
            const firstMovements = await ViewKardex.findAll({
                attributes: [
                    'id_product',
                    [sequelize.fn('MIN', sequelize.col('id')), 'min_id']
                ],
                where: {
                    [Op.and]: [
                        id_sucursal ? { id_sucursal } : {},
                        id_storage ? { id_storage } : {},
                        { id_product: { [Op.in]: productIds } },
                        { date: whereDate }
                    ]
                },
                group: ['id_product'],
                raw: true
            });
            const minIds = firstMovements.map(m => m.min_id).filter(Boolean);
            const initialBalances = minIds.length > 0 ? await ViewKardex.findAll({
                attributes: ['id_product', 'saldo_inicial'],
                where: {
                    id: { [Op.in]: minIds }
                },
                raw: true
            }) : [];
            const balanceMap = {};
            for (const bal of initialBalances) {
                balanceMap[bal.id_product] = bal.saldo_inicial;
            }
            for (const kardex of kardexes) {
                const quantity_inicial = Number(balanceMap[kardex.id_product] || 0);
                kardex.dataValues.quantity_inicial = quantity_inicial;
                kardex.dataValues.quantity_input = Number(kardex.dataValues.quantity_input) + quantity_inicial;
                kardex.dataValues.quantity_saldo = Number(kardex.dataValues.quantity_saldo) + quantity_inicial;
            }
        }

        // Apply showZeroSaldo filter to match what is visible in the frontend table
        const showZeroSaldo = req.query.showZeroSaldo === 'true';
        const filteredKardexes = showZeroSaldo
            ? kardexes
            : kardexes.filter(k => Number(k.dataValues.quantity_saldo) > 0);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Kardex Físico");
        const headers = [
            ...(includeRowNumber ? ["N°"] : []),
            "Código",
            "Detalle",
            "Unidad",
            "Entrada",
            "Salida",
            "Saldo",
        ];
        
        const headerRow = worksheet.addRow(headers);
        headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1A3FA8' } // Deep blue brand color
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
        headerRow.height = 24;

        let currentCategory = null;
        let categoryInput = 0;
        let categoryOutput = 0;
        let categorySaldo = 0;

        let totalInput = 0;
        let totalOutput = 0;
        let totalSaldo = 0;

        const addCategorySubtotalRow = (categoryName) => {
            const subtotalRow = worksheet.addRow([
                `TOTAL ${categoryName.toUpperCase()}`,
                ...Array(labelColumnCount - 1).fill(""),
                categoryInput,
                categoryOutput,
                categorySaldo
            ]);
            worksheet.mergeCells(`A${subtotalRow.number}:${String.fromCharCode(64 + labelColumnCount)}${subtotalRow.number}`);
            
            const subtotalCell = subtotalRow.getCell(1);
            subtotalCell.font = { name: 'Arial', size: 10, bold: true };
            subtotalCell.alignment = { vertical: 'middle', horizontal: 'left' };
            subtotalCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE2E8F0' } // Light slate/gray
            };
            
            [firstQuantityColumn, firstQuantityColumn + 1, firstQuantityColumn + 2].forEach((i) => {
                const cell = subtotalRow.getCell(i);
                cell.font = { name: 'Arial', size: 10, bold: true };
                cell.numFmt = `#,##0.${"0".repeat(decimal)}`;
                cell.alignment = { horizontal: 'right' };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE2E8F0' }
                };
            });
            subtotalRow.height = 20;
        };

        filteredKardexes.forEach((kardex, index) => {
            const categoryName = kardex.product.category.name;
            if (categoryName !== currentCategory) {
                if (currentCategory !== null) {
                    addCategorySubtotalRow(currentCategory);
                    worksheet.addRow([]);
                }
                
                currentCategory = categoryName;
                categoryInput = 0;
                categoryOutput = 0;
                categorySaldo = 0;
                
                const categoryRow = worksheet.addRow([categoryName.toUpperCase()]);
                worksheet.mergeCells(`A${categoryRow.number}:${lastColumnLetter}${categoryRow.number}`);
                const categoryCell = categoryRow.getCell(1);
                categoryCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
                categoryCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF2D3748' } // Dark gray category header
                };
                categoryCell.alignment = { vertical: 'middle', horizontal: 'left' };
                categoryRow.height = 24;
            }

            const row = worksheet.addRow([
                ...(includeRowNumber ? [index + 1] : []),
                kardex.product.cod,
                kardex.product.name,
                kardex.product.unit.siglas,
                Number(kardex.quantity_input),
                Number(kardex.quantity_output),
                Number(kardex.dataValues.quantity_saldo),
            ]);
            if (includeRowNumber) {
                row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            }
            
            categoryInput += Number(kardex.quantity_input);
            categoryOutput += Number(kardex.quantity_output);
            categorySaldo += Number(kardex.dataValues.quantity_saldo);

            totalInput += Number(kardex.quantity_input);
            totalOutput += Number(kardex.quantity_output);
            totalSaldo += Number(kardex.dataValues.quantity_saldo);

            [firstQuantityColumn, firstQuantityColumn + 1, firstQuantityColumn + 2].forEach((i) => {
                const cell = row.getCell(i);
                cell.numFmt = `#,##0.${"0".repeat(decimal)}`;
                cell.alignment = { horizontal: 'right' };
            });
        });

        // Add last category subtotal row
        if (currentCategory !== null) {
            addCategorySubtotalRow(currentCategory);
        }

        // Add spacing and totals row
        worksheet.addRow([]);
        const totalsRow = worksheet.addRow([
            "TOTALES",
            ...Array(labelColumnCount - 1).fill(""),
            totalInput,
            totalOutput,
            totalSaldo
        ]);
        worksheet.mergeCells(`A${totalsRow.number}:${String.fromCharCode(64 + labelColumnCount)}${totalsRow.number}`);
        
        const totalsLabelCell = totalsRow.getCell(1);
        totalsLabelCell.font = { name: 'Arial', size: 11, bold: true };
        totalsLabelCell.alignment = { vertical: 'middle', horizontal: 'left' };
        
        [firstQuantityColumn, firstQuantityColumn + 1, firstQuantityColumn + 2].forEach((i) => {
            const cell = totalsRow.getCell(i);
            cell.font = { name: 'Arial', size: 11, bold: true };
            cell.numFmt = `#,##0.${"0".repeat(decimal)}`;
            cell.alignment = { horizontal: 'right' };
        });
        totalsRow.height = 22;

        // Auto-fit column widths
        worksheet.columns.forEach((column, i) => {
            let maxLength = 10;
            column.eachCell({ includeEmpty: true }, (cell) => {
                if (cell.value) {
                    const str = String(cell.value);
                    if (str.length > maxLength) {
                        maxLength = str.length;
                    }
                }
            });
            column.width = i === 1 ? Math.min(maxLength + 2, 40) : maxLength + 2;
        });
        if (includeRowNumber) {
            worksheet.getColumn(1).width = Math.max(3, String(Math.max(filteredKardexes.length, 1)).length + 1);
        }

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            "attachment; filename=kardex-fisico.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: "Error generando Excel" });
    }
};

const generateExcelReportsExistencia = async (req, res) => {
    try {
        const kardexes = await returnDataKardex(req.query);
        const decimal = await getNumberDecimal();

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Kardex Existencia");
        const headers = [
            "FECHA",
            "N°",
            "DETALLE",
            "ENTRADA_FISICO",
            "SALIDA_FISICO",
            "SALDO_FISICO",
            "P.U.",
            "ENTRADA_VALORADO",
            "SALIDA_VALORADO",
            "SALDO_VALORADO",
        ];
        worksheet.addRow(headers);

        kardexes.forEach((kardex) => {
            const row = worksheet.addRow([
                moment(kardex.date).format("DD/MM/YYYY"),
                kardex.registry_number,
                kardex.detail,
                Number(kardex.quantity_input),
                Number(kardex.quantity_output),
                Number(kardex.saldo),
                Number(kardex.cost_unitario),
                Number(kardex.cost_input),
                Number(kardex.cost_output),
                Number(kardex.cost_saldo),
            ]);
            [4, 5, 6, 7, 8, 9, 10].forEach(
                (i) => (row.getCell(i).numFmt = `#,##0.${"0".repeat(decimal)}`)
            );
        });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            "attachment; filename=kardex-existencia.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: "Error generando Excel" });
    }
};

// -------------------- DATA QUERIES --------------------
const returnDataKardex = async ({
    id_sucursal,
    id_storage,
    id_product,
    filterBy,
    date1,
    date2,
    type_kardex,
    orderNew = ["date", "ASC"],
    include_zero = true,
}) => {
    const whereDate = whereDateForType(
        filterBy,
        date1,
        date2,
        '"ViewKardex"."date"'
    );
    const zeroFilter = include_zero
        ? {}
        : {
            [Op.or]: [
                { quantity_input: { [Op.ne]: 0 } },
                { quantity_output: { [Op.ne]: 0 } },
                { saldo: { [Op.ne]: 0 } },
                { cost_input: { [Op.ne]: 0 } },
                { cost_output: { [Op.ne]: 0 } },
                { cost_saldo: { [Op.ne]: 0 } },
            ],
        };

    return ViewKardex.findAll({
        order: [[...orderNew]],
        attributes: [
            "type",
            "date",
            "registry_number",
            "detail",
            "sub_detail",
            "quantity_input",
            "quantity_output",
            "saldo",
            "cost_unitario",
            "cost_input",
            "cost_output",
            "cost_saldo",
        ],
        where: {
            [Op.and]: [
                id_sucursal && { id_sucursal },
                id_storage && { id_storage },
                id_product && { id_product },
                type_kardex && { type: type_kardex },
                { date: whereDate },
                zeroFilter,
            ].filter(Boolean),
        },
        include: [
            { association: "sucursal", attributes: ["name"] },
            { association: "storage", attributes: ["name"] },
            { association: "product", include: ["unit"] },
        ],
    });
};

const returnDataInputKardexFisico = async ({
    id_sucursal,
    id_storage,
    id_product,
    filterBy,
    date1,
    date2,
    orderNew = ["id_product", "ASC"],
    include_zero = true,
    category_ids,
    category_types
}) => {
    const whereDate = whereDateForType(
        filterBy,
        date1,
        date2,
        '"ViewKardex"."date"'
    );

    const parseFilterValues = (value) => (Array.isArray(value) ? value : [value])
        .flatMap((item) => String(item ?? '').split(','))
        .map((item) => item.trim())
        .filter(Boolean);
    const isAllProductsModule = isAllProductsKardexRequest({ category_types });
    const categoryIdValues = isAllProductsModule
        ? parseFilterValues(category_ids)
        : (Array.isArray(category_ids) ? category_ids : (category_ids ? [category_ids] : []));
    const categoryIds = isAllProductsModule
        ? [...new Set(categoryIdValues.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
        : categoryIdValues;
    const categoryTypes = (Array.isArray(category_types) ? category_types : (category_types ? [category_types] : []))
        .map((categoryType) => String(categoryType ?? '').trim())
        .filter(Boolean);

    // Keep an invalid non-empty ID filter restrictive instead of silently exporting every category.
    const whereProduct = categoryIdValues.length
        ? { id_category: { [Op.in]: categoryIds } }
        : {};
    const whereCategory = categoryTypes.length
        ? { type: { [Op.in]: categoryTypes } }
        : {};

    return ViewKardex.findAll({
        order: [
            ['product', 'category', 'name', 'ASC'],
            orderNew
        ],
        attributes: [
            "id_product",
            [sequelize.fn("SUM", sequelize.col("quantity_input")), "quantity_input"],
            [
                sequelize.fn("SUM", sequelize.col("quantity_output")),
                "quantity_output",
            ],
            [
                sequelize.literal("SUM(quantity_input) - SUM(quantity_output)"),
                "quantity_saldo",
            ],
        ],
        where: {
            [Op.and]: [
                id_sucursal && { id_sucursal },
                id_storage && { id_storage },
                id_product && { id_product },
                { date: whereDate },
            ].filter(Boolean),
        },
        include: [
            { association: "product", where: whereProduct, include: ["unit", { association: "category", where: whereCategory }] },
            { association: "storage", attributes: ["name"] },
            { association: "sucursal", attributes: ["name"] },
        ],
        group: [
            "id_product",
            "product.id",
            "product.unit.id",
            "product.category.id",
            "storage.id",
            "sucursal.id",
        ],
        having: include_zero
            ? undefined
            : sequelize.literal(
                "SUM(quantity_input) <> 0 OR SUM(quantity_output) <> 0"
            ),
    });
};

// -------------------- EXPORT --------------------
module.exports = {
    generatePdfReports,
    generateExcelReports,
    generatePdfReportsKardexFisico,
    generateExcelReportsKardexFisico,
    generatePdfReportsExistencia,
    generateExcelReportsExistencia,
};
