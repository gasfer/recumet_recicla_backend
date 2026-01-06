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

    const formatDate1 =
      filterBy === "MONTH" ? "MM" : filterBy === "YEAR" ? "YYYY" : "DD-MM-YYYY";
    const formatDate2 = filterBy === "MONTH" ? "YYYY" : "DD-MM-YYYY";

    let docDefinition = {
      content: dataPdf,
      pageOrientation: "landscape",
      footer: function (currentPage, pageCount) {
        return [
          {
            text:
              `Fechas: ${moment(date1, formatDate1).format(formatDate1)} / ${
                moment(date2, formatDate2).format(formatDate2) !==
                "Fecha inválida"
                  ? moment(date2, formatDate2).format(formatDate2)
                  : ""
              } - Paginas: ${currentPage} de ${pageCount}`,
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
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
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
    console.error(error);
    return res.sendFile(path.join(__dirname, "../../../uploads/none-img.jpg"));
  }
};

// -------------------- PDF KARDEX FISICO --------------------
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

    const formatDate1 =
      filterBy === "MONTH" ? "MM" : filterBy === "YEAR" ? "YYYY" : "DD-MM-YYYY";
    const formatDate2 = filterBy === "MONTH" ? "YYYY" : "DD-MM-YYYY";

    let docDefinition = {
      content: dataPdf,
      footer: function (currentPage, pageCount) {
        return [
          {
            text:
              `Fechas: ${moment(date1, formatDate1).format(formatDate1)} / ${
                moment(date2, formatDate2).format(formatDate2) !==
                "Fecha inválida"
                  ? moment(date2, formatDate2).format(formatDate2)
                  : ""
              } - Paginas: ${currentPage} de ${pageCount}`,
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
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
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
    console.error(error);
    return res.sendFile(path.join(__dirname, "../../../uploads/none-img.jpg"));
  }
};

// -------------------- PDF EXISTENCIA --------------------
const generatePdfReportsExistencia = async (req, res) => {
  try {
    const { filterBy, date1, date2 } = req.query;
    const kardexes = await returnDataKardex(req.query);
    const decimal = await getNumberDecimal();

    let dataPdf = dataPdfReturnKardexExistencia(req.userAuth, kardexes);

    kardexes.forEach((kardex) => {
      const tableData = [
        { text: moment(kardex?.date).format("DD/MM/YYYY HH:mm"), fontSize: 8 },
        { text: kardex?.registry_number, fontSize: 8 },
        { text: kardex?.detail, fontSize: 8 },
        { text: Number(kardex?.quantity_input), fontSize: 8, fillColor: "#DFF0D8" },
        { text: Number(kardex?.quantity_output), fontSize: 8, fillColor: "#F2DEDE" },
        { text: Number(kardex?.saldo), fontSize: 8, fillColor: "#D9EDF7" },
        { text: Number(kardex?.cost_unitario), fontSize: 8 },
        { text: Number(kardex?.cost_input), fontSize: 8, fillColor: "#DFF0D8" },
        { text: Number(kardex?.cost_output), fontSize: 8, fillColor: "#F2DEDE" },
        { text: Number(kardex?.cost_saldo), fontSize: 8, fillColor: "#D9EDF7" },
      ];
      dataPdf[5].table.body.push(tableData);
    });

    const formatDate1 =
      filterBy === "MONTH" ? "MM" : filterBy === "YEAR" ? "YYYY" : "DD-MM-YYYY";
    const formatDate2 = filterBy === "MONTH" ? "YYYY" : "DD-MM-YYYY";

    let docDefinition = {
      content: dataPdf,
      pageOrientation: "landscape",
      footer: function (currentPage, pageCount) {
        return [
          {
            text:
              `Fechas: ${moment(date1, formatDate1).format(formatDate1)} / ${
                moment(date2, formatDate2).format(formatDate2) !==
                "Fecha inválida"
                  ? moment(date2, formatDate2).format(formatDate2)
                  : ""
              } - Paginas: ${currentPage} de ${pageCount}`,
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
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
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
    console.error(error);
    return res.sendFile(path.join(__dirname, "../../../uploads/none-img.jpg"));
  }
};

// -------------------- EXCEL REPORTS --------------------
const generateExcelReports = async (req, res) => {
  try {
    const kardexes = await returnDataKardex(req.query);
    const decimal = await getNumberDecimal();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Kardex");

    const headers = ["TIPO", "FECHA_KARDEX", "DETALLE", "PRODUCTO", "UND", "CANT_ENTRADA", "CANT_SALIDA", "CANT_SALDO"];
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

      [6, 7, 8].forEach(i => row.getCell(i).numFmt = `#,##0.${"0".repeat(decimal)}`);
    });

    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition","attachment; filename=kardex.xlsx");

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
    const headers = ["Código", "Detalle", "Unidad", "Entrada", "Salida", "Saldo"];
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
      [4,5,6].forEach(i => row.getCell(i).numFmt = `#,##0.${"0".repeat(decimal)}`);
    });

    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition","attachment; filename=kardex-fisico.xlsx");

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
    const headers = ["FECHA","N°","DETALLE","ENTRADA_FISICO","SALIDA_FISICO","SALDO_FISICO","P.U.","ENTRADA_VALORADO","SALIDA_VALORADO","SALDO_VALORADO"];
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
      [4,5,6,7,8,9,10].forEach(i => row.getCell(i).numFmt = `#,##0.${"0".repeat(decimal)}`);
    });

    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition","attachment; filename=kardex-existencia.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error generando Excel" });
  }
};

// -------------------- DATA QUERIES --------------------
const returnDataKardex = async ({
  id_sucursal, id_storage, id_product, filterBy, date1, date2, type_kardex, orderNew = ["date","ASC"], include_zero=true
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

// -------------------- EXPORT --------------------
module.exports = {
  generatePdfReports,
  generatePdfReportsKardexFisico,
  generatePdfReportsExistencia,
  generateExcelReports,
  generateExcelReportsKardexFisico,
  generateExcelReportsExistencia
};
