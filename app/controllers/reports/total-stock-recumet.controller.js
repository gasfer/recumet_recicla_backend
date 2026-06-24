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
    const { query, id_sucursal, id_sucursales, id_storage, id_storages, id_product, id_products, category_ids, filterBy, date1, date2 } = queryReq;
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

    let productCond = {};
    const targetProducts = id_products || id_product;
    if (targetProducts) {
        const productIds = String(targetProducts).split(',').map(id => id.trim()).filter(Boolean);
        if (productIds.length > 0) {
            productCond = { id_product: { [Op.in]: productIds } };
        }
    }

    let whereProduct = {};
    if (targetProducts) {
        const productIds = String(targetProducts).split(',').map(id => id.trim()).filter(Boolean);
        if (productIds.length > 0) {
            whereProduct = { id: { [Op.in]: productIds } };
        }
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
                productCond,
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
        ? allKardexes
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
        const { filterBy, date1, date2, query, id_sucursal, id_sucursales, id_storage, id_storages, id_product, id_products, category_ids } = req.query;
        const decimal = await getNumberDecimal();
        const kardexes = await returnDataTotalStockRecumet(req.query);
        const auth = req.userAuth;

        let dataPdf = dataPdfReturnTotalStock(auth);

        // Compute sucursal totals
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

        let productCond = {};
        const targetProducts = id_products || id_product;
        if (targetProducts) {
            const productIds = String(targetProducts).split(',').map(id => id.trim()).filter(Boolean);
            if (productIds.length > 0) {
                productCond = { id_product: { [Op.in]: productIds } };
            }
        }

        let whereProduct = {};
        if (targetProducts) {
            const productIds = String(targetProducts).split(',').map(id => id.trim()).filter(Boolean);
            if (productIds.length > 0) {
                whereProduct = { id: { [Op.in]: productIds } };
            }
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

        const showZeroSaldo = req.query.showZeroSaldo === 'true' || req.query.showZeroSaldo === true;

        const sucursalTotals = {};
        const optionsDbSucursalProduct = {
            attributes: [
                'id_sucursal',
                'id_product',
                [sequelize.literal('COALESCE(SUM(quantity_input), 0)'), 'quantity_input'],
                [sequelize.literal('COALESCE(SUM(quantity_output), 0)'), 'quantity_output'],
                [sequelize.literal('COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0)'), 'quantity_saldo'],
            ],
            where: {
                [Op.and]: [
                    sucursalCond,
                    storageCond,
                    productCond,
                    { date: whereDate },
                ]
            },
            include: [
                {
                    association: 'product',
                    attributes: ['id_category'],
                    where: whereProduct,
                    include: [
                        { association: 'category', attributes: ['name', 'type'], where: whereCategory }
                    ]
                },
                {
                    association: 'sucursal',
                    attributes: ['name']
                }
            ],
            group: ['id_sucursal', 'id_product', 'product.id', 'product.category.id', 'sucursal.id'],
            raw: true,
            nest: true
        };

        const sucursalProductKardexes = await ViewKardex.findAll(optionsDbSucursalProduct);
        if (sucursalProductKardexes && sucursalProductKardexes.length > 0) {
            const productIds = sucursalProductKardexes.map(k => k.id_product);
            const firstMovementsSP = await ViewKardex.findAll({
                attributes: [
                    'id_product',
                    'id_sucursal',
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
                group: ['id_product', 'id_sucursal'],
                raw: true
            });

            const minIdsSP = firstMovementsSP.map(m => m.min_id).filter(Boolean);
            const initialBalancesSP = minIdsSP.length > 0 ? await ViewKardex.findAll({
                attributes: ['id_product', 'id_sucursal', 'saldo_inicial'],
                where: {
                    id: { [Op.in]: minIdsSP }
                },
                raw: true
            }) : [];

            const balanceMapSP = {};
            for (const bal of initialBalancesSP) {
                balanceMapSP[`${bal.id_product}_${bal.id_sucursal}`] = bal.saldo_inicial;
            }

            for (const sp of sucursalProductKardexes) {
                const key = `${sp.id_product}_${sp.id_sucursal}`;
                const quantity_inicial = Number(balanceMapSP[key] || 0);
                sp.quantity_saldo = Number(sp.quantity_saldo) + quantity_inicial;
            }
        }

        const filteredSP = showZeroSaldo
            ? sucursalProductKardexes
            : sucursalProductKardexes.filter(sp => Number(sp.quantity_saldo) > 0);

        for (const sp of filteredSP) {
            const sucursalId = sp.id_sucursal;
            const sucursalName = sp.sucursal?.name || `Sucursal ${sucursalId}`;
            const catType = sp.product?.category?.type;
            const saldoVal = Number(sp.quantity_saldo || 0);

            if (!sucursalTotals[sucursalId]) {
                sucursalTotals[sucursalId] = {
                    name: sucursalName,
                    quantity_saldo: 0,
                    quantity_saldo_mp: 0,
                    quantity_saldo_pt: 0
                };
            }

            sucursalTotals[sucursalId].quantity_saldo += saldoVal;
            if (catType === 'RAW_MATERIAL') {
                sucursalTotals[sucursalId].quantity_saldo_mp += saldoVal;
            } else if (catType === 'FINISHED_PRODUCT') {
                sucursalTotals[sucursalId].quantity_saldo_pt += saldoVal;
            }
        }

        // Build main table body with category headers and footers
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

        let currentCategoryName = "";
        let categorySum = 0;

        const addCategoryFooter = (catName, sumVal) => {
            tableBody.push([
                { text: `TOTAL ${catName.toUpperCase()}`, fontSize: 8, bold: true, fillColor: "#f8f9fa", colSpan: 3 },
                {},
                {},
                { text: formatEuro(sumVal, decimal), fontSize: 8, bold: true, alignment: "right", fillColor: "#f8f9fa" }
            ]);
        };

        kardexes.forEach((kardex) => {
            const saldoVal = Number(kardex.dataValues.quantity_saldo || 0);
            totalSaldo += saldoVal;

            const catType = kardex.product?.category?.type;
            if (catType === 'RAW_MATERIAL') {
                totalSaldoMp += saldoVal;
            } else if (catType === 'FINISHED_PRODUCT') {
                totalSaldoPt += saldoVal;
            }

            const categoryName = kardex.product?.category?.name || "SIN CATEGORÍA";

            if (categoryName !== currentCategoryName) {
                if (currentCategoryName !== "") {
                    addCategoryFooter(currentCategoryName, categorySum);
                }
                currentCategoryName = categoryName;
                categorySum = 0;

                // Add group header row
                tableBody.push([
                    { text: categoryName.toUpperCase(), fontSize: 8, bold: true, fillColor: "#e0f2fe", colSpan: 4 },
                    {},
                    {},
                    {}
                ]);
            }

            categorySum += saldoVal;

            tableBody.push([
                { text: kardex.product.cod, fontSize: 8 },
                { text: kardex.product.name, fontSize: 8 },
                { text: kardex.product.unit.siglas, fontSize: 8 },
                { text: formatEuro(saldoVal, decimal), fontSize: 8, alignment: "right" }
            ]);
        });

        if (currentCategoryName !== "") {
            addCategoryFooter(currentCategoryName, categorySum);
        }

        // Push main table
        dataPdf.push({
            style: "tableReport",
            margin: [0, 25, 0, 10],
            table: {
                headerRows: 1,
                widths: ["auto", "*", "auto", "auto"],
                body: tableBody
            },
            layout: "lightHorizontalLines",
        });

        // Build Sucursal Summary Table matching the HTML card
        const sucursalTableBody = [
            [
                { text: "SUCURSAL", fontSize: 8, fillColor: "#d2e2f7", bold: true, color: "#0f3d99" },
                { text: "TOTAL (MP)", fontSize: 8, fillColor: "#d2e2f7", bold: true, color: "#0f3d99", alignment: "right" },
                { text: "TOTAL (PT)", fontSize: 8, fillColor: "#d2e2f7", bold: true, color: "#0f3d99", alignment: "right" },
                { text: "TOTAL GENERAL", fontSize: 8, fillColor: "#d2e2f7", bold: true, color: "#0f3d99", alignment: "right" }
            ]
        ];

        const sucursalesList = Object.values(sucursalTotals);
        sucursalesList.forEach((st) => {
            sucursalTableBody.push([
                { text: st.name.toUpperCase(), fontSize: 8, bold: true, color: "#1e293b" },
                { text: formatEuro(st.quantity_saldo_mp, decimal), fontSize: 8, color: "#64748b", alignment: "right" },
                { text: formatEuro(st.quantity_saldo_pt, decimal), fontSize: 8, color: "#64748b", alignment: "right" },
                { text: formatEuro(st.quantity_saldo, decimal), fontSize: 8, bold: true, color: "#1e293b", alignment: "right" }
            ]);
        });

        // Add Consolidado General row
        sucursalTableBody.push([
            { text: "CONSOLIDADO GENERAL", fontSize: 8, bold: true, color: "#0f3d99", fillColor: "#f4f6fc" },
            { text: formatEuro(totalSaldoMp, decimal), fontSize: 8, bold: true, color: "#0f3d99", fillColor: "#f4f6fc", alignment: "right" },
            { text: formatEuro(totalSaldoPt, decimal), fontSize: 8, bold: true, color: "#0f3d99", fillColor: "#f4f6fc", alignment: "right" },
            { text: formatEuro(totalSaldo, decimal), fontSize: 9, bold: true, color: "#ffffff", fillColor: "#038b21", alignment: "right" }
        ]);

        dataPdf.push({
            text: "RESUMEN POR SUCURSAL",
            fontSize: 9,
            bold: true,
            color: "#0f3d99",
            margin: [0, 15, 0, 5],
            keepWithNext: true
        });

        dataPdf.push({
            style: "tableReport",
            table: {
                headerRows: 1,
                widths: ["*", "auto", "auto", "auto"],
                body: sucursalTableBody
            },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 20]
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
        const { filterBy, date1, date2, query, id_sucursal, id_sucursales, id_storage, id_storages, id_product, id_products, category_ids } = req.query;
        const kardexes = await returnDataTotalStockRecumet(req.query);
        const decimal = await getNumberDecimal();

        // Compute sucursal totals
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

        let productCond = {};
        const targetProducts = id_products || id_product;
        if (targetProducts) {
            const productIds = String(targetProducts).split(',').map(id => id.trim()).filter(Boolean);
            if (productIds.length > 0) {
                productCond = { id_product: { [Op.in]: productIds } };
            }
        }

        let whereProduct = {};
        if (targetProducts) {
            const productIds = String(targetProducts).split(',').map(id => id.trim()).filter(Boolean);
            if (productIds.length > 0) {
                whereProduct = { id: { [Op.in]: productIds } };
            }
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

        const showZeroSaldo = req.query.showZeroSaldo === 'true' || req.query.showZeroSaldo === true;

        const sucursalTotals = {};
        const optionsDbSucursalProduct = {
            attributes: [
                'id_sucursal',
                'id_product',
                [sequelize.literal('COALESCE(SUM(quantity_input), 0)'), 'quantity_input'],
                [sequelize.literal('COALESCE(SUM(quantity_output), 0)'), 'quantity_output'],
                [sequelize.literal('COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0)'), 'quantity_saldo'],
            ],
            where: {
                [Op.and]: [
                    sucursalCond,
                    storageCond,
                    productCond,
                    { date: whereDate },
                ]
            },
            include: [
                {
                    association: 'product',
                    attributes: ['id_category'],
                    where: whereProduct,
                    include: [
                        { association: 'category', attributes: ['name', 'type'], where: whereCategory }
                    ]
                },
                {
                    association: 'sucursal',
                    attributes: ['name']
                }
            ],
            group: ['id_sucursal', 'id_product', 'product.id', 'product.category.id', 'sucursal.id'],
            raw: true,
            nest: true
        };

        const sucursalProductKardexes = await ViewKardex.findAll(optionsDbSucursalProduct);
        if (sucursalProductKardexes && sucursalProductKardexes.length > 0) {
            const productIds = sucursalProductKardexes.map(k => k.id_product);
            const firstMovementsSP = await ViewKardex.findAll({
                attributes: [
                    'id_product',
                    'id_sucursal',
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
                group: ['id_product', 'id_sucursal'],
                raw: true
            });

            const minIdsSP = firstMovementsSP.map(m => m.min_id).filter(Boolean);
            const initialBalancesSP = minIdsSP.length > 0 ? await ViewKardex.findAll({
                attributes: ['id_product', 'id_sucursal', 'saldo_inicial'],
                where: {
                    id: { [Op.in]: minIdsSP }
                },
                raw: true
            }) : [];

            const balanceMapSP = {};
            for (const bal of initialBalancesSP) {
                balanceMapSP[`${bal.id_product}_${bal.id_sucursal}`] = bal.saldo_inicial;
            }

            for (const sp of sucursalProductKardexes) {
                const key = `${sp.id_product}_${sp.id_sucursal}`;
                const quantity_inicial = Number(balanceMapSP[key] || 0);
                sp.quantity_saldo = Number(sp.quantity_saldo) + quantity_inicial;
            }
        }

        const filteredSP = showZeroSaldo
            ? sucursalProductKardexes
            : sucursalProductKardexes.filter(sp => Number(sp.quantity_saldo) > 0);

        for (const sp of filteredSP) {
            const sucursalId = sp.id_sucursal;
            const sucursalName = sp.sucursal?.name || `Sucursal ${sucursalId}`;
            const catType = sp.product?.category?.type;
            const saldoVal = Number(sp.quantity_saldo || 0);

            if (!sucursalTotals[sucursalId]) {
                sucursalTotals[sucursalId] = {
                    name: sucursalName,
                    quantity_saldo: 0,
                    quantity_saldo_mp: 0,
                    quantity_saldo_pt: 0
                };
            }

            sucursalTotals[sucursalId].quantity_saldo += saldoVal;
            if (catType === 'RAW_MATERIAL') {
                sucursalTotals[sucursalId].quantity_saldo_mp += saldoVal;
            } else if (catType === 'FINISHED_PRODUCT') {
                sucursalTotals[sucursalId].quantity_saldo_pt += saldoVal;
            }
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Consolidado Stock");
        const headers = [
            "Código",
            "Detalle",
            "Unidad",
            "Saldo",
        ];

        const thinBorder = {
            top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
        
        const headerRow = worksheet.addRow(headers);
        headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1A3FA8' } // Deep blue brand color
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = thinBorder;
        });
        headerRow.height = 24;

        let totalSaldo = 0;
        let totalSaldoMp = 0;
        let totalSaldoPt = 0;

        let currentCategoryName = "";
        let categorySum = 0;

        const addCategoryFooterExcel = (catName, sumVal) => {
            const catFooterRow = worksheet.addRow([
                `TOTAL ${catName.toUpperCase()}`,
                "",
                "",
                sumVal
            ]);
            catFooterRow.font = { name: 'Arial', size: 10, bold: true };
            catFooterRow.getCell(4).numFormat = `#,##0.${'0'.repeat(decimal)}`;
            worksheet.mergeCells(`A${catFooterRow.number}:C${catFooterRow.number}`);
            
            for (let i = 1; i <= 4; i++) {
                const cell = catFooterRow.getCell(i);
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF8F9FA' }
                };
                cell.border = thinBorder;
            }
            catFooterRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
            catFooterRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
        };

        kardexes.forEach((kardex) => {
            const saldoVal = Number(kardex.dataValues.quantity_saldo || 0);
            totalSaldo += saldoVal;

            const catType = kardex.product?.category?.type;
            if (catType === 'RAW_MATERIAL') {
                totalSaldoMp += saldoVal;
            } else if (catType === 'FINISHED_PRODUCT') {
                totalSaldoPt += saldoVal;
            }

            const categoryName = kardex.product?.category?.name || "SIN CATEGORÍA";

            if (categoryName !== currentCategoryName) {
                if (currentCategoryName !== "") {
                    addCategoryFooterExcel(currentCategoryName, categorySum);
                }
                currentCategoryName = categoryName;
                categorySum = 0;

                // Add group header row in Excel
                const catRow = worksheet.addRow([categoryName.toUpperCase()]);
                catRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F3D99' } };
                worksheet.mergeCells(`A${catRow.number}:D${catRow.number}`);
                
                for (let i = 1; i <= 4; i++) {
                    const cell = catRow.getCell(i);
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE0F2FE' }
                    };
                    cell.border = thinBorder;
                }
                catRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
            }

            categorySum += saldoVal;

            const row = worksheet.addRow([
                kardex.product.cod,
                kardex.product.name,
                kardex.product.unit.siglas,
                saldoVal,
            ]);
            row.getCell(4).numFormat = `#,##0.${'0'.repeat(decimal)}`;
            row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
            row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
            row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
            for (let i = 1; i <= 4; i++) {
                row.getCell(i).border = thinBorder;
            }
        });

        if (currentCategoryName !== "") {
            addCategoryFooterExcel(currentCategoryName, categorySum);
        }

        // Add blank row
        worksheet.addRow([]);

        // Add Resumen por Sucursal Section
        const subTitleRow = worksheet.addRow(["RESUMEN POR SUCURSAL"]);
        subTitleRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F3D99' } };
        worksheet.mergeCells(`A${subTitleRow.number}:D${subTitleRow.number}`);

        const sucHeaderRow = worksheet.addRow([
            "SUCURSAL",
            "TOTAL (MP)",
            "TOTAL (PT)",
            "TOTAL GENERAL"
        ]);
        sucHeaderRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F3D99' } };
        sucHeaderRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD2E2F7' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = thinBorder;
        });
        sucHeaderRow.height = 20;

        const sucursalesList = Object.values(sucursalTotals);
        sucursalesList.forEach((st) => {
            const row = worksheet.addRow([
                st.name.toUpperCase(),
                st.quantity_saldo_mp,
                st.quantity_saldo_pt,
                st.quantity_saldo
            ]);
            row.font = { name: 'Arial', size: 10 };
            row.getCell(2).numFormat = `#,##0.${'0'.repeat(decimal)}`;
            row.getCell(3).numFormat = `#,##0.${'0'.repeat(decimal)}`;
            row.getCell(4).numFormat = `#,##0.${'0'.repeat(decimal)}`;
            row.getCell(4).font = { name: 'Arial', size: 10, bold: true };
            row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
            row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
            row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
            row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
            for (let i = 1; i <= 4; i++) {
                row.getCell(i).border = thinBorder;
            }
        });

        // Add Consolidado General Row
        const consRow = worksheet.addRow([
            "CONSOLIDADO GENERAL",
            totalSaldoMp,
            totalSaldoPt,
            totalSaldo
        ]);
        consRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F3D99' } };
        for (let i = 1; i <= 3; i++) {
            const cell = consRow.getCell(i);
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF4F6FC' }
            };
            cell.border = thinBorder;
        }
        consRow.getCell(2).numFormat = `#,##0.${'0'.repeat(decimal)}`;
        consRow.getCell(3).numFormat = `#,##0.${'0'.repeat(decimal)}`;

        consRow.getCell(4).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF038B21' } // Green background
        };
        consRow.getCell(4).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        consRow.getCell(4).numFormat = `#,##0.${'0'.repeat(decimal)}`;
        consRow.getCell(4).border = thinBorder;

        consRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
        consRow.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
        consRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
        consRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };

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
