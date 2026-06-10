const { response, request } = require("express");
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

const formatEuro = (value, decimal = 2) => {
    if (value === null || value === undefined) return "0";
    return Number(value).toLocaleString("de-DE", {
        minimumFractionDigits: decimal,
        maximumFractionDigits: decimal,
    });
};

const returnDataTotalStockRecumet = async (queryReq) => {
    const { query, id_sucursal, id_sucursales, id_storage, id_storages, id_product, category_ids, filterBy, date1, date2 } = queryReq;
    const whereDate = whereDateForType(filterBy, date1, date2, '"ViewKardex"."date"');

    let sucursalCond = {};
    const targetSucursales = id_sucursales || id_sucursal;
    if (targetSucursales) {
        const sucursalIds = String(targetSucursales).split(',').map(id => id.trim()).filter(Boolean);
        if (sucursalIds.length > 0) {
            sucursalCond = { id_sucursal: { [Op.in]: sucursalIds } };
        }
    }

    let storageCond = {};
    const targetStorages = id_storages || id_storage;
    if (targetStorages) {
        const storageIds = String(targetStorages).split(',').map(id => id.trim()).filter(Boolean);
        if (storageIds.length > 0) {
            storageCond = { id_storage: { [Op.in]: storageIds } };
        }
    }

    let whereProduct = {};
    if (id_product) {
        whereProduct = { id: id_product };
    }
    if (category_ids) {
        let ids = [];
        if (Array.isArray(category_ids)) {
            ids = category_ids;
        } else if (typeof category_ids === 'string') {
            ids = category_ids.split(',').map(id => id.trim()).filter(Boolean);
        }
        if (ids.length > 0) {
            whereProduct = {
                ...whereProduct,
                id_category: { [Op.in]: ids }
            };
        }
    }

    const category_types = ['RAW_MATERIAL', 'FINISHED_PRODUCT'];
    let whereCategory = {
        type: {
            [Op.in]: category_types
        }
    };

    const orderNew = queryReq.orderNew || ['product', 'cod', 'ASC'];
    const optionsDbAll = {
        order: [
            ['product', 'category', 'name', 'ASC'],
            orderNew
        ],
        attributes: [
            'id_product',
            [sequelize.literal('COALESCE(SUM(quantity_input), 0)'), 'quantity_input'],
            [sequelize.literal('COALESCE(SUM(quantity_output), 0)'), 'quantity_output'],
            [sequelize.literal('COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0)'), 'quantity_saldo'],
        ],
        where: {
            [Op.and]: [
                sucursalCond,
                storageCond,
                id_product ? { id_product } : {},
                { date: whereDate },
            ]
        },
        include: [
            {
                association: 'product', attributes: { exclude: ['id', 'id_category', 'id_unit', 'status', 'createdAt', 'updatedAt'] },
                where: whereProduct,
                include: [
                    { association: 'unit', attributes: ['name', 'siglas'] },
                    { association: 'category', attributes: ['name', 'type'], where: whereCategory }
                ]
            }
        ],
        group: ['id_product', 'product.id', 'product.unit.id', 'product.category.id']
    };

    if (query) {
        let where = {
            [Op.or]: [
                { '$product.name$': { [Op.iLike]: `%${query}%` } },
                { '$product.cod$': { [Op.iLike]: `%${query}%` } }
            ]
        };
        optionsDbAll.where[Op.and].push(where);
    }

    const allKardexes = await ViewKardex.findAll(optionsDbAll);
    if (allKardexes && allKardexes.length > 0) {
        const productIds = allKardexes.map(k => k.id_product);
        const firstMovements = await ViewKardex.findAll({
            attributes: [
                'id_product',
                [sequelize.fn('MIN', sequelize.col('id')), 'min_id']
            ],
            where: {
                [Op.and]: [
                    sucursalCond,
                    storageCond,
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
        for (const kardex of allKardexes) {
            const quantity_inicial = Number(balanceMap[kardex.id_product] || 0);
            kardex.dataValues.quantity_inicial = quantity_inicial;
            kardex.dataValues.quantity_input = Number(kardex.dataValues.quantity_input) + quantity_inicial;
            kardex.dataValues.quantity_saldo = Number(kardex.dataValues.quantity_saldo) + quantity_inicial;
        }
    }

    const showZeroSaldo = queryReq.showZeroSaldo === 'true' || queryReq.showZeroSaldo === true;
    const filteredAllKardexes = showZeroSaldo
        ? allKardexes.filter(k => Number(k.dataValues.quantity_saldo) <= 0)
        : allKardexes.filter(k => Number(k.dataValues.quantity_saldo) > 0);

    return filteredAllKardexes;
};

const dataPdfReturnTotalStock = (auth) => {
    let base64Image = "";
    try {
        if (fs.existsSync(imagePath)) {
            base64Image = fs.readFileSync(imagePath, "base64");
        }
    } catch (e) {
        console.error("Error reading logo:", e);
    }

    const content = [];
    if (base64Image) {
        content.push({
            image: "data:image/png;base64," + base64Image,
            width: 70,
            absolutePosition: { x: 25, y: 15 },
        });
    }

    content.push(
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
            text: "CONSOLIDADO DE STOCK (MP Y PT) RECUMET",
            alignment: "center",
            style: "title",
            absolutePosition: { y: 58 },
        }
    );

    return content;
};

const generatePdfReportsTotalStock = async (req = request, res = response) => {
    try {
        const { filterBy, date1, date2 } = req.query;
        const decimal = await getNumberDecimal();
        const kardexes = await returnDataTotalStockRecumet(req.query);
        const auth = req.userAuth;

        let dataPdf = dataPdfReturnTotalStock(auth);
        
        const tableBody = [
            [
                { text: "CÓDIGO", fontSize: 8, fillColor: "#eeeeee", bold: true },
                { text: "DETALLE", fontSize: 8, fillColor: "#eeeeee", bold: true },
                { text: "UND", fontSize: 8, fillColor: "#eeeeee", bold: true },
                { text: "SALDO", fontSize: 8, fillColor: "#eeeeee", bold: true, alignment: "right" }
            ]
        ];

        let totalSaldo = 0;
        let totalSaldoMp = 0;
        let totalSaldoPt = 0;
        kardexes.forEach((kardex) => {
            const saldoVal = Number(kardex.dataValues.quantity_saldo || 0);
            totalSaldo += saldoVal;

            const catType = kardex.product?.category?.type;
            if (catType === 'RAW_MATERIAL') {
                totalSaldoMp += saldoVal;
            } else if (catType === 'FINISHED_PRODUCT') {
                totalSaldoPt += saldoVal;
            }

            tableBody.push([
                { text: kardex.product.cod, fontSize: 8 },
                { text: kardex.product.name, fontSize: 8 },
                { text: kardex.product.unit.siglas, fontSize: 8 },
                { text: formatEuro(saldoVal, decimal), fontSize: 8, alignment: "right" }
            ]);
        });

        tableBody.push([
            { text: "TOTAL MATERIA PRIMA (MP)", fontSize: 8, bold: true, fillColor: "#E2E8F0" },
            { text: "", fillColor: "#E2E8F0" },
            { text: "", fillColor: "#E2E8F0" },
            { text: formatEuro(totalSaldoMp, decimal), fontSize: 8, bold: true, alignment: "right", fillColor: "#E2E8F0" }
        ]);
        tableBody.push([
            { text: "TOTAL PRODUCTOS TERMINADOS (PT)", fontSize: 8, bold: true, fillColor: "#E2E8F0" },
            { text: "", fillColor: "#E2E8F0" },
            { text: "", fillColor: "#E2E8F0" },
            { text: formatEuro(totalSaldoPt, decimal), fontSize: 8, bold: true, alignment: "right", fillColor: "#E2E8F0" }
        ]);
        tableBody.push([
            { text: "TOTAL GENERAL", fontSize: 8, bold: true, fillColor: "#CBD5E1" },
            { text: "", fillColor: "#CBD5E1" },
            { text: "", fillColor: "#CBD5E1" },
            { text: formatEuro(totalSaldo, decimal), fontSize: 8, bold: true, alignment: "right", fillColor: "#CBD5E1" }
        ]);

        dataPdf.push({
            style: "tableReport",
            absolutePosition: { x: 20, y: 85 },
            table: {
                headerRows: 1,
                widths: ["auto", "*", "auto", "auto"],
                body: tableBody
            },
            layout: "lightHorizontalLines",
        });

        const formatDate1 =
            filterBy == "MONTH" ? "MM" : filterBy == "YEAR" ? "YYYY" : "DD-MM-YYYY";
        const formatDate2 = filterBy == "MONTH" ? "YYYY" : "DD-MM-YYYY";
        let docDefinition = {
            content: dataPdf,
            pageOrientation: "portrait",
            footer: function (currentPage, pageCount) {
                return [
                    {
                        text:
                            `Fechas: ${moment(date1, formatDate1).format(formatDate1)} / ${moment(date2, formatDate2).format(formatDate2) !=
                                "Fecha inválida"
                                ? moment(date2, formatDate2).format(formatDate2)
                                : ""
                            }` +
                            " - Páginas: " +
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
                `filename=consolidado_stock_${new Date()}.pdf`
            );
            res.status(200).send(result);
        });
        pdfDoc.end();
    } catch (error) {
        console.error("Error generating PDF:", error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
        });
    }
};

const generateExcelReportsTotalStock = async (req = request, res = response) => {
    try {
        const kardexes = await returnDataTotalStockRecumet(req.query);
        const decimal = await getNumberDecimal();

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Consolidado Stock");
        const headers = [
            "Código",
            "Detalle",
            "Unidad",
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

        let totalSaldo = 0;
        let totalSaldoMp = 0;
        let totalSaldoPt = 0;
        kardexes.forEach((kardex) => {
            const saldoVal = Number(kardex.dataValues.quantity_saldo || 0);
            totalSaldo += saldoVal;

            const catType = kardex.product?.category?.type;
            if (catType === 'RAW_MATERIAL') {
                totalSaldoMp += saldoVal;
            } else if (catType === 'FINISHED_PRODUCT') {
                totalSaldoPt += saldoVal;
            }

            const row = worksheet.addRow([
                kardex.product.cod,
                kardex.product.name,
                kardex.product.unit.siglas,
                saldoVal,
            ]);
            row.getCell(4).numFormat = `#,##0.${'0'.repeat(decimal)}`;
        });

        const rowMp = worksheet.addRow([
            "TOTAL MATERIA PRIMA (MP)",
            "",
            "",
            totalSaldoMp,
        ]);
        rowMp.font = { name: 'Arial', size: 10, bold: true };
        rowMp.getCell(4).numFormat = `#,##0.${'0'.repeat(decimal)}`;

        const rowPt = worksheet.addRow([
            "TOTAL PRODUCTOS TERMINADOS (PT)",
            "",
            "",
            totalSaldoPt,
        ]);
        rowPt.font = { name: 'Arial', size: 10, bold: true };
        rowPt.getCell(4).numFormat = `#,##0.${'0'.repeat(decimal)}`;

        const totalRow = worksheet.addRow([
            "TOTAL GENERAL",
            "",
            "",
            totalSaldo,
        ]);
        totalRow.font = { name: 'Arial', size: 10, bold: true };
        totalRow.getCell(4).numFormat = `#,##0.${'0'.repeat(decimal)}`;
        
        // Auto-fit column widths
        worksheet.columns.forEach(column => {
            let maxLen = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                const len = cell.value ? String(cell.value).length : 0;
                if (len > maxLen) maxLen = len;
            });
            column.width = Math.max(maxLen + 4, 12);
        });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=consolidado_stock_${new Date().toISOString()}.xlsx`
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("Error generating Excel:", error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
        });
    }
};

module.exports = {
    generatePdfReportsTotalStock,
    generateExcelReportsTotalStock,
};
