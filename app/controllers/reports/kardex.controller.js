const { Op } = require("sequelize");
const { sequelize, ViewKardex } = require("../../database/config");
const PdfPrinter = require("pdfmake");
const fonts = require("../../helpers/generator-pdf/fonts");
const styles = require("../../helpers/generator-pdf/styles");
const path = require("path");
const fs = require("fs");
const moment = require("moment");
const { whereDateForType } = require("../../helpers/where_range");
const ExcelJS = require("exceljs");
const { getNumberDecimal } = require("../../helpers/company");
moment.locale("es");

const imagePath = path.join(__dirname, "../../../uploads/logo.png");

// -------------------- PDF REPORTS --------------------

const formatEuro = (value, decimal = 2) => {
    if (value === null || value === undefined) return "0";
    return Number(value).toLocaleString("de-DE", {
        minimumFractionDigits: decimal,
        maximumFractionDigits: decimal,
    });
};

const generatePdfReports = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2 } = req.query;
        const kardexes = await returnDataKardex(req.query);
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
            ];
            dataPdf[5].table.body.push(tableData);
        });
        const formatDate1 =
            filterBy == "MONTH" ? "MM" : filterBy == "YEAR" ? "YYYY" : "DD-MM-YYYY";
        const formatDate2 = filterBy == "MONTH" ? "YYYY" : "DD-MM-YYYY";
        let docDefinition = {
            content: dataPdf,
            pageOrientation: "landscape",
            footer: function (currentPage, pageCount) {
                return [
                    {
                        text:
                            `Fechas: ${moment(date1, formatDate1).format(formatDate1)} / ${moment(date2, formatDate2).format(formatDate2) !=
                                "Fecha inválida"
                                ? moment(date2, formatDate2).format(formatDate2)
                                : ""
                            }` +
                            " - Paginas: " +
                            currentPage.toString() +
                            " de " +
                            pageCount,
                        fontSize: 8,
                        alignment: "center",
                        margin: [10, 10, 10, 10],
                    },
                ];
            },
            styles: styles,
        };
        const printer = new PdfPrinter(fonts);
        let pdfDoc = printer.createPdfKitDocument(docDefinition);
        let chunks = [];
        pdfDoc.on("data", (chunk) => {
            chunks.push(chunk);
        });
        pdfDoc.on("end", () => {
            const result = Buffer.concat(chunks);
            res.setHeader("Content-Type", "application/pdf;");
            res.setHeader(
                "Content-disposition",
                `filename=report_compras_${new Date()}.pdf`
            );
            return res.send(result);
        });
        pdfDoc.end();
    } catch (error) {
        console.log(error);
        const pathImage = path.join(__dirname, `../../../uploads/none-img.jpg`);
        return res.sendFile(pathImage);
    }
};
//TODO:
const generatePdfReportsKardexFisico = async (
    req = request,
    res = response
) => {
    try {
        const { filterBy, date1, date2 } = req.query;
        const decimal = await getNumberDecimal();
        const kardexes = await returnDataInputKardexFisico(req.query);
        let dataPdf = dataPdfReturnKardexFisicoVerticalOnlyReciclen(
            req.userAuth,
            kardexes
        ); //PDF
        kardexes.forEach((kardex) => {
            const tableData = [
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
            dataPdf[5].table.body.push(tableData);
        });
        const formatDate1 =
            filterBy == "MONTH" ? "MM" : filterBy == "YEAR" ? "YYYY" : "DD-MM-YYYY";
        const formatDate2 = filterBy == "MONTH" ? "YYYY" : "DD-MM-YYYY";
        let docDefinition = {
            content: dataPdf,

            // pageOrientation: 'landscape',
            footer: function (currentPage, pageCount) {
                return [
                    {
                        text:
                            `Fechas: ${moment(date1, formatDate1).format(formatDate1)} / ${moment(date2, formatDate2).format(formatDate2) !=
                                "Fecha inválida"
                                ? moment(date2, formatDate2).format(formatDate2)
                                : ""
                            }` +
                            " - Paginas: " +
                            currentPage.toString() +
                            " de " +
                            pageCount,
                        fontSize: 8,
                        alignment: "center",
                        margin: [10, 10, 10, 10],
                    },
                ];
            },
            styles: styles,
        };
        const printer = new PdfPrinter(fonts);
        let pdfDoc = printer.createPdfKitDocument(docDefinition);
        let chunks = [];
        pdfDoc.on("data", (chunk) => {
            chunks.push(chunk);
        });
        pdfDoc.on("end", () => {
            const result = Buffer.concat(chunks);
            res.setHeader("Content-Type", "application/pdf;");
            res.setHeader(
                "Content-disposition",
                `filename=report_compras_${new Date()}.pdf`
            );
            return res.send(result);
        });
        pdfDoc.end();
    } catch (error) {
        console.log(error);
        const pathImage = path.join(__dirname, `../../../uploads/none-img.jpg`);
        return res.sendFile(pathImage);
    }
};
//TODO:
const generatePdfReportsExistencia = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2 } = req.query;
        const kardexes = await returnDataKardex(req.query);
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
        let docDefinition = {
            content: dataPdf,
            pageOrientation: "landscape",
            footer: function (currentPage, pageCount) {
                return [
                    {
                        text:
                            `Fechas: ${moment(date1, formatDate1).format(formatDate1)} / ${moment(date2, formatDate2).format(formatDate2) !=
                                "Fecha inválida"
                                ? moment(date2, formatDate2).format(formatDate2)
                                : ""
                            }` +
                            " - Paginas: " +
                            currentPage.toString() +
                            " de " +
                            pageCount,
                        fontSize: 8,
                        alignment: "center",
                        margin: [10, 10, 10, 10],
                    },
                ];
            },
            styles: styles,
        };
        const printer = new PdfPrinter(fonts);
        let pdfDoc = printer.createPdfKitDocument(docDefinition);
        let chunks = [];
        pdfDoc.on("data", (chunk) => {
            chunks.push(chunk);
        });
        pdfDoc.on("end", () => {
            const result = Buffer.concat(chunks);
            res.setHeader("Content-Type", "application/pdf;");
            res.setHeader(
                "Content-disposition",
                `filename=report_compras_${new Date()}.pdf`
            );
            return res.send(result);
        });
        pdfDoc.end();
    } catch (error) {
        console.log(error);
        const pathImage = path.join(__dirname, `../../../uploads/none-img.jpg`);
        return res.sendFile(pathImage);
    }
};

const dataPdfReturn = (auth) => [
    {
        image: "data:image/png;base64," + fs.readFileSync(imagePath, "base64"),
        width: 70,
        absolutePosition: { x: 25, y: 15 },
    },
    {
        text: `Impreso por: ` + moment().format("LLLL"),
        style: "fechaDoc",
        absolutePosition: { y: 16 },
    },
    {
        text: `${auth.full_names} / ${auth.number_document}`,
        style: "fechaDoc",
        absolutePosition: { y: 27 },
    },
    {
        text: "REPORTE DE KARDEX",
        alignment: "center",
        style: "title",
        absolutePosition: { y: 58 },
    },
    {
        text: "Reporte generados con los parámetros establecidos",
        alignment: "center",
        absolutePosition: { y: 73 },
    },
    {
        style: "tableReport",
        absolutePosition: { x: 20, y: 95 },
        table: {
            headerRows: 1,
            widths: [40, 60, 80, "*", 35, 55, 59, 55, 55, 70, 70],
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
                        text: "SALDO INICIAL",
                        fontSize: 8,
                        fillColor: "#eeeeee",
                        bold: true,
                    },
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
                ],
            ],
            layout: "lightHorizontalLines",
        },
    },
];
//TODO:
const dataPdfReturnKardexExistencia = (auth, kardex) => [
    {
        image: "data:image/png;base64," + fs.readFileSync(imagePath, "base64"),
        width: 70,
        absolutePosition: { x: 25, y: 15 },
    },
    {
        text: `Impreso por: ` + moment().format("LLLL"),
        style: "fechaDoc",
        absolutePosition: { y: 16 },
    },
    {
        text: `${auth.full_names} / ${auth.number_document}`,
        style: "fechaDoc",
        absolutePosition: { y: 27 },
    },
    {
        text: "REPORTE DE KARDEX DE EXISTENCIA",
        alignment: "center",
        style: "title",
        absolutePosition: { y: 58 },
    },
    {
        text: `PRODUCTO: ${kardex[0].product.name}`,
        alignment: "center",
        absolutePosition: { y: 73 },
    },
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

const dataPdfReturnKardexFisicoVerticalOnlyReciclen = (auth, kardexes) => [
    {
        image: "data:image/png;base64," + fs.readFileSync(imagePath, "base64"),
        width: 70,
        absolutePosition: { x: 25, y: 15 },
    },
    {
        text: `Impreso por: ` + moment().format("LLLL"),
        style: "fechaDoc",
        absolutePosition: { y: 16 },
    },
    {
        text: `${auth.full_names} / ${auth.number_document}`,
        style: "fechaDoc",
        absolutePosition: { y: 27 },
    },
    {
        text: "REPORTE DE KARDEX FÍSICO",
        alignment: "center",
        style: "title",
        absolutePosition: { y: 58 },
    },
    {
        text: "Detalle de los Productos:" + `${kardexes[0]?.sucursal.name}`,
        alignment: "center",
        absolutePosition: { y: 73 },
    },
    {
        style: "tableReport",
        absolutePosition: { x: 20, y: 95 },
        table: {
            headerRows: 2,
            widths: ["auto", "*", "auto", "auto", "auto", "auto"],
            body: [
                [
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
            ]);

            [6, 7, 8].forEach(
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

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Kardex Físico");
        const headers = [
            "Código",
            "Detalle",
            "Unidad",
            "Entrada",
            "Salida",
            "Saldo",
        ];
        worksheet.addRow(headers);

        kardexes.forEach((kardex) => {
            const row = worksheet.addRow([
                kardex.product.cod,
                kardex.product.name,
                kardex.product.unit.siglas,
                Number(kardex.quantity_input),
                Number(kardex.quantity_output),
                Number(kardex.dataValues.quantity_saldo),
            ]);
            [4, 5, 6].forEach(
                (i) => (row.getCell(i).numFmt = `#,##0.${"0".repeat(decimal)}`)
            );
        });

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

    let whereProduct = {};
    if (category_ids) {
        let ids = category_ids;
        if (!Array.isArray(category_ids)) {
            ids = [category_ids];
        }
        if (ids.length > 0) {
            whereProduct = {
                id_category: {
                    [Op.in]: ids
                }
            }
        }
    }

    let whereCategory = {};
    if (category_types) {
        let types = category_types;
        if (!Array.isArray(category_types)) {
            types = [category_types];
        }
        if (types.length > 0) {
            whereCategory = {
                type: {
                    [Op.in]: types
                }
            }
        }
    }

    return ViewKardex.findAll({
        order: [[...orderNew]],
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
