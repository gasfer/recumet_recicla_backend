const { Op } = require("sequelize");
const { sequelize, ViewKardex } = require("../../database/config");
const PdfPrinter = require("pdfmake");
const fonts = require("../../helpers/generator-pdf/fonts");
const styles = require("../../helpers/generator-pdf/styles");
const path = require("path");
const fs = require("fs");
const moment = require("moment");
const ExcelJS = require("exceljs");
const { getNumberDecimal } = require("../../helpers/company");
const { whereDateForType } = require("../../helpers/where_range");
moment.locale("es");

const imagePath = path.join(__dirname, "../../../uploads/logo.png");

// -------------------- PDF HELPERS --------------------
const createPdfBuffer = async (docDefinition) => {
  return new Promise((resolve, reject) => {
    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    let chunks = [];
    pdfDoc.on("data", chunk => chunks.push(chunk));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", err => reject(err));
    pdfDoc.end();
  });
};

// -------------------- EXCEL HELPERS --------------------
const generateExcelReport = async (res, data, sheetName, fileName, numericColumns = [], columnWidths = []) => {
  const decimal = await getNumberDecimal();
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]);
  worksheet.addRow(headers);

  data.forEach(rowData => {
    const row = worksheet.addRow(headers.map(h => rowData[h]));
    numericColumns.forEach(colName => {
      const colIndex = headers.indexOf(colName) + 1;
      if (colIndex > 0) row.getCell(colIndex).numFmt = `#,##0.${'0'.repeat(decimal)}`;
    });
  });

  if (columnWidths.length === headers.length) {
    columnWidths.forEach((w, i) => worksheet.getColumn(i + 1).width = w);
  } else {
    headers.forEach((_, i) => worksheet.getColumn(i + 1).width = 20);
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
  await workbook.xlsx.write(res);
  res.end();
};

// -------------------- DATA QUERIES --------------------
const returnDataKardex = async ({
  id_sucursal, id_storage, id_product, filterBy, date1, date2, type_kardex, orderNew=["date","ASC"], include_zero=true
}) => {
  const whereDate = whereDateForType(filterBy, date1, date2, '"ViewKardex"."date"');
  const zeroFilter = include_zero ? {} : {
    [Op.or]: [
      { quantity_input: { [Op.ne]: 0 } },
      { quantity_output: { [Op.ne]: 0 } },
      { saldo: { [Op.ne]: 0 } },
      { cost_input: { [Op.ne]: 0 } },
      { cost_output: { [Op.ne]: 0 } },
      { cost_saldo: { [Op.ne]: 0 } },
    ]
  };

  return ViewKardex.findAll({
    order: [[...orderNew]],
    attributes: [
      "type","date","registry_number","detail","sub_detail",
      "quantity_input","quantity_output","saldo",
      "cost_unitario","cost_input","cost_output","cost_saldo"
    ],
    where: {
      [Op.and]: [
        id_sucursal && { id_sucursal },
        id_storage && { id_storage },
        id_product && { id_product },
        type_kardex && { type: type_kardex },
        { date: whereDate },
        zeroFilter
      ].filter(Boolean)
    },
    include: [
      { association: "sucursal", attributes: ["name"] },
      { association: "storage", attributes: ["name"] },
      { association: "product", include: ["unit"] }
    ]
  });
};

const returnDataInputKardexFisico = async ({
  id_sucursal, id_storage, id_product, filterBy, date1, date2, orderNew=["id_product","ASC"], include_zero=true
}) => {
  const whereDate = whereDateForType(filterBy, date1, date2, '"ViewKardex"."date"');

  return ViewKardex.findAll({
    order: [[...orderNew]],
    attributes: [
      "id_product",
      [sequelize.fn("SUM", sequelize.col("quantity_input")), "quantity_input"],
      [sequelize.fn("SUM", sequelize.col("quantity_output")), "quantity_output"],
      [sequelize.literal("SUM(quantity_input) - SUM(quantity_output)"), "quantity_saldo"]
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
      { association: "product", include: ["unit", "category"] },
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
    having: include_zero ? undefined : sequelize.literal("SUM(quantity_input) <> 0 OR SUM(quantity_output) <> 0"),
  });
};

// -------------------- PDF REPORTS --------------------
const generatePdfReports = async (req, res) => {
  try {
    const { filterBy, date1, date2 } = req.query;
    const kardexes = await returnDataKardex(req.query);
    const decimal = await getNumberDecimal();
    let dataPdf = dataPdfReturn(req.userAuth);

    kardexes.forEach((kardex) => {
      const tableData = [
        { text: kardex?.type === "INPUT" ? "ENTRADA" : "SALIDA", fontSize: 8 },
        { text: moment(kardex?.date).format("DD/MM/YYYY"), fontSize: 8 },
        { text: kardex?.detail, fontSize: 8 },
        { text: kardex?.product.name, fontSize: 8 },
        { text: kardex?.product.unit.siglas, fontSize: 8 },
        { text: Number(kardex?.quantity_input), fontSize: 8 },
        { text: Number(kardex?.quantity_output), fontSize: 8 },
        { text: Number(kardex?.saldo), fontSize: 8 },
        { text: kardex?.sucursal.name, fontSize: 8 },
        { text: kardex?.storage.name, fontSize: 8 },
      ];
      dataPdf[5].table.body.push(tableData);
    });

    const formatDate1 = filterBy === "MONTH" ? "MM" : filterBy === "YEAR" ? "YYYY" : "DD-MM-YYYY";
    const formatDate2 = filterBy === "MONTH" ? "YYYY" : "DD-MM-YYYY";

    let docDefinition = {
      content: dataPdf,
      pageOrientation: "landscape",
      footer: function (currentPage, pageCount) {
        return [
          {
            text:
              `Fechas: ${moment(date1, formatDate1).format(formatDate1)} / ${moment(date2, formatDate2).format(formatDate2) !== "Fecha inválida" ? moment(date2, formatDate2).format(formatDate2) : ""} - Paginas: ${currentPage} de ${pageCount}`,
            fontSize: 8,
            alignment: "center",
            margin: [10, 10, 10, 10],
          },
        ];
      },
      styles: styles,
    };

    const pdfBuffer = await createPdfBuffer(docDefinition);
    res.setHeader("Content-Type", "application/pdf;");
    res.setHeader("Content-disposition", `filename=report_compras_${new Date()}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error(error);
    return res.sendFile(path.join(__dirname, "../../../uploads/none-img.jpg"));
  }
};

const generatePdfReportsKardexFisico = async (req, res) => {
  try {
    const { filterBy, date1, date2 } = req.query;
    const decimal = await getNumberDecimal();
    const kardexes = await returnDataInputKardexFisico(req.query);
    let dataPdf = dataPdfReturnKardexFisicoVerticalOnlyReciclen(req.userAuth, kardexes);

    kardexes.forEach((kardex) => {
      const tableData = [
        { text: kardex?.product.cod, fontSize: 8 },
        { text: kardex?.product.name, fontSize: 8 },
        { text: kardex?.product.unit.siglas, fontSize: 8 },
        { text: Number(kardex?.quantity_input), fontSize: 8 },
        { text: Number(kardex?.quantity_output), fontSize: 8 },
        { text: Number(kardex?.dataValues.quantity_saldo), fontSize: 8 },
      ];
      dataPdf[5].table.body.push(tableData);
    });

    const formatDate1 = filterBy === "MONTH" ? "MM" : filterBy === "YEAR" ? "YYYY" : "DD-MM-YYYY";
    const formatDate2 = filterBy === "MONTH" ? "YYYY" : "DD-MM-YYYY";

    let docDefinition = {
      content: dataPdf,
      footer: function (currentPage, pageCount) {
        return [
          {
            text: `Fechas: ${moment(date1, formatDate1).format(formatDate1)} / ${moment(date2, formatDate2).format(formatDate2) !== "Fecha inválida" ? moment(date2, formatDate2).format(formatDate2) : ""} - Paginas: ${currentPage} de ${pageCount}`,
            fontSize: 8,
            alignment: "center",
            margin: [10, 10, 10, 10],
          },
        ];
      },
      styles: styles,
    };

    const pdfBuffer = await createPdfBuffer(docDefinition);
    res.setHeader("Content-Type", "application/pdf;");
    res.setHeader("Content-disposition", `filename=report_kardex_fisico_${new Date()}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error(error);
    return res.sendFile(path.join(__dirname, "../../../uploads/none-img.jpg"));
  }
};

// -------------------- EXCEL REPORTS --------------------
const generateExcelReports = async (req, res) => {
  try {
    const kardexes = await returnDataKardex(req.query);
    let data = kardexes.map(row => ({
      TIPO: row.type === "INPUT" ? "ENTRADA" : "SALIDA",
      FECHA: moment(row.date).format("DD/MM/YYYY HH:mm:ss"),
      DETALLE: row.detail,
      PRODUCTO: row.product.name,
      UND: row.product.unit.siglas,
      CANT_ENTRADA: Number(row.quantity_input),
      CANT_SALIDA: Number(row.quantity_output),
      CANT_SALDO: Number(row.saldo)
    }));
    await generateExcelReport(res, data, "Kardex", "kardex.xlsx", ["CANT_ENTRADA","CANT_SALIDA","CANT_SALDO"]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok:false, error:"Error generando Excel" });
  }
};

const generateExcelReportsKardexFisico = async (req, res) => {
  try {
    const kardexes = await returnDataInputKardexFisico(req.query);
    let data = kardexes.map(row => ({
      CODIGO: row.product.cod,
      DETALLE: row.product.name,
      UND: row.product.unit.siglas,
      ENTRADA: Number(row.quantity_input),
      SALIDA: Number(row.quantity_output),
      SALDO: Number(row.dataValues.quantity_saldo)
    }));
    await generateExcelReport(res, data, "Kardex Fisico", "kardex-fisico.xlsx", ["ENTRADA","SALIDA","SALDO"]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok:false, error:"Error generando Excel" });
  }
};

// -------------------- EXPORTS --------------------
module.exports = {
  generatePdfReports,
  generatePdfReportsKardexFisico,
  generateExcelReports,
  generateExcelReportsKardexFisico,
  returnDataKardex,
  returnDataInputKardexFisico
};
