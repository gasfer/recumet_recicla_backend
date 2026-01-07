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

// -------------------- HELPER: GENERAR EXCEL --------------------
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

  // Ajuste de anchos
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

// -------------------- GENERAR PDF: FUNCION GENERAL --------------------
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

// -------------------- FUNCIONES PDF Y EXCEL --------------------

// 🔹 Generate PDF Report (Kardex)
const generatePdfReports = async (req = request, res = response) => {
  try {
    const { filterBy, date1, date2 } = req.query;
    const kardexes = await returnDataKardex(req.query);
    const decimal = await getNumberDecimal();
    let dataPdf = dataPdfReturn(req.userAuth);

    kardexes.forEach(kardex => {
      dataPdf[5].table.body.push([
        { text: kardex?.type == "INPUT" ? "ENTRADA" : "SALIDA", fontSize: 8 },
        { text: moment(kardex?.date).format("DD/MM/YYYY"), fontSize: 8 },
        { text: kardex?.detail, fontSize: 8 },
        { text: kardex?.product.name, fontSize: 8 },
        { text: kardex?.product.unit.siglas, fontSize: 8 },
        { text: Number(kardex?.quantity_input), fontSize: 8 },
        { text: Number(kardex?.quantity_output), fontSize: 8 },
        { text: Number(kardex?.saldo), fontSize: 8 },
        { text: kardex?.sucursal.name, fontSize: 8 },
        { text: kardex?.storage.name, fontSize: 8 },
      ]);
    });

    const formatDate1 = filterBy == "MONTH" ? "MM" : filterBy == "YEAR" ? "YYYY" : "DD-MM-YYYY";
    const formatDate2 = filterBy == "MONTH" ? "YYYY" : "DD-MM-YYYY";

    const docDefinition = {
      content: dataPdf,
      pageOrientation: "landscape",
      footer: (currentPage, pageCount) => ({
        text: `Fechas: ${moment(date1, formatDate1).format(formatDate1)} / ${moment(date2, formatDate2).format(formatDate2) !== "Fecha inválida" ? moment(date2, formatDate2).format(formatDate2) : ""} - Paginas: ${currentPage} de ${pageCount}`,
        fontSize: 8,
        alignment: "center",
        margin: [10,10,10,10]
      }),
      styles: styles
    };

    const pdfBuffer = await createPdfBuffer(docDefinition);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-disposition", `filename=report_kardex_${new Date().getTime()}.pdf`);
    return res.send(pdfBuffer);

  } catch (error) {
    console.error(error);
    return res.sendFile(path.join(__dirname, "../../../uploads/none-img.jpg"));
  }
};

// 🔹 Generate Excel Report (Kardex)
const generateExcelReports = async (req = request, res = response) => {
  try {
    const inputs = await returnDataInput(req.query);
    let input_data = [];
    if (inputs.length === 0) {
      input_data.push({
        CÓDIGO: '', FECHA_COMPRA: '', TIPO_DOCUMENTO: '', NRO_DOCUMENTO: '',
        PROVEEDOR: '', DETALLE: '', TIPO: '', REFERENCIA: '', TIPO_PROVEEDOR: '',
        CANT_KG: 0, TOTAL: 0,
      });
    } else {
      inputs.forEach(input => {
        input_data.push({
          CÓDIGO: input.cod,
          FECHA_COMPRA: moment(input?.date_voucher).format('DD/MM/YYYY HH:mm:ss'),
          TIPO_DOCUMENTO: input.type_registry,
          NRO_DOCUMENTO: input.registry_number,
          PROVEEDOR: input.provider.full_names,
          DETALLE: input.detailsInput.map(res => res.product.name + ` [${res.quantity} ${res.product.unit.siglas}]`).join(', '),
          TIPO: input.type,
          REFERENCIA: (input?.referral_sources ?? '-') + '  ' +
                      'Cliente antiguo: ' + (input?.old_customer ? 'SI' : 'NO') + '  ' +
                      'Con recojo: ' + (input?.with_pickup ? 'SI' : 'NO'),
          TIPO_PROVEEDOR: input.provider.type.name,
          CANT_KG: Number(input.total_quantity),
          TOTAL: Number(input.total),
        });
      });
    }

    await generateExcelReport(res, input_data, "Reporte Compras", "reporte_compras.xlsx", ["CANT_KG","TOTAL"]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok:false, error:"Error generando Excel" });
  }
};

// 🔹 Generate PDF Details Reports
const generatePdfDetailsReports = async (req = request, res = response) => {
  // Aquí implementa la lógica específica de detalle
};

// 🔹 Generate Excel Details Reports
const generateExcelDetailsReports = async (req = request, res = response) => {
  // Aquí implementa la lógica específica de detalle
};

// 🔹 Print Input Voucher
const printInputVoucher = async (req = request, res = response) => {
  // Aquí implementa la lógica específica de impresión de voucher
};

// 🔹 Generate PDF Details CPP Reports
const generatePdfDetailsCPPReports = async (req = request, res = response) => {
  // Aquí implementa la lógica específica de CPP
};

// -------------------- EXPORTS --------------------
module.exports = {
  generatePdfReports,
  generateExcelReports,
  generatePdfDetailsReports,
  generateExcelDetailsReports,
  printInputVoucher,
  generatePdfDetailsCPPReports
};
