'use strict';

const ExcelJS = require('exceljs');
const { REPORT_COLORS, reportLocationStyle, solidFill, reportThinBorder } = require('../constants/report-style.constants');

const BRAND_BLUE = REPORT_COLORS.header;
const HEADER_DARK = REPORT_COLORS.header;
const SECTION_BG = REPORT_COLORS.productData;
const CATEGORY_BG = REPORT_COLORS.subheader;
const SUBTOTAL_BG = REPORT_COLORS.total;
const SECTION_TOTAL_BG = REPORT_COLORS.total;
const GRAND_TOTAL_BG = REPORT_COLORS.grandTotal;
const thinBorder = reportThinBorder;

const doubleBottomBorder = {
  top: { style: 'thin', color: { argb: REPORT_COLORS.border } },
  left: { style: 'thin', color: { argb: REPORT_COLORS.border } },
  bottom: { style: 'double', color: { argb: REPORT_COLORS.text } },
  right: { style: 'thin', color: { argb: REPORT_COLORS.border } },
};

const formatNumberCell = (cell, value, decimalPlaces = 2) => {
  cell.value = Number(value) || 0;
  cell.numFormat = `#,##0.${'0'.repeat(decimalPlaces)}`;
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
  cell.border = thinBorder;
};

const generateConsolidatedInventoryExcel = async (projection) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RECUMET S.R.L.';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Consolidado de inventario', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9, // A4
    },
    views: [
      { state: 'frozen', xSplit: 3, ySplit: 5 },
    ],
  });

  const { metadata, locations, sections, grandTotals } = projection;
  const decimalPlaces = metadata.decimalPlaces || 2;

  // Base columns: CÓDIGO (1), DESCRIPCIÓN (2), UND (3)
  // Per location: Stock reg. y Traslado pendiente
  // Consolidated totals: Stock reg. y Traslado pendiente
  // Observations: (last column)
  const totalLocations = locations.length;
  const totalColumns = 3 + (totalLocations * 2) + 2 + 1;
  const colorForLocation = (index, shade) => reportLocationStyle(locations[index]?.label)[shade];
  const shadeLocation = (row, index, shade) => {
    for (let column = 4 + index * 2; column <= 5 + index * 2; column++) {
      row.getCell(column).fill = solidFill(colorForLocation(index, shade));
    }
  };

  // Row 1: Title
  const titleRow = worksheet.addRow(['RECUMET S.R.L. - CONSOLIDADO DE INVENTARIO (MATERIA PRIMA Y PRODUCTOS TERMINADOS)']);
  titleRow.height = 28;
  titleRow.font = { name: 'Arial', size: 12, bold: true, color: { argb: REPORT_COLORS.textOnDark } };
  worksheet.mergeCells(1, 1, 1, totalColumns);
  for (let c = 1; c <= totalColumns; c++) {
    const cell = titleRow.getCell(c);
    cell.fill = solidFill(BRAND_BLUE);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Row 2: Subtitle with Cutoff Date and Filter info
  const subtitleText = `Fecha de corte: ${metadata.headerLabel} | Modo: ${metadata.filterBy} | Saldos cero: ${metadata.filtersSummary.showZeroSaldo ? 'Incluidos' : 'Excluidos'}`;
  const subtitleRow = worksheet.addRow([subtitleText]);
  subtitleRow.height = 20;
  subtitleRow.font = { name: 'Arial', size: 9, italic: true, color: { argb: REPORT_COLORS.text } };
  worksheet.mergeCells(2, 1, 2, totalColumns);
  for (let c = 1; c <= totalColumns; c++) {
    const cell = subtitleRow.getCell(c);
    cell.fill = solidFill(REPORT_COLORS.row);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Row 3: Blank separator
  const sepRow = worksheet.addRow([]);
  sepRow.height = 8;

  // Row 4: Header Level 1 (Location Groupings)
  const h1Values = new Array(totalColumns).fill('');
  h1Values[0] = 'DATOS DEL PRODUCTO';

  let colIdx = 4;
  for (let i = 0; i < totalLocations; i++) {
    h1Values[colIdx - 1] = locations[i].label.toUpperCase();
    colIdx += 2;
  }
  h1Values[colIdx - 1] = 'TOTALES CONSOLIDADOS';
  h1Values[totalColumns - 1] = 'OBSERVACIONES';

  const h1Row = worksheet.addRow(h1Values);
  h1Row.height = 38;
  h1Row.font = { name: 'Arial', size: 10, bold: true, color: { argb: REPORT_COLORS.textOnDark } };

  // Merge A4:C4 for product info
  worksheet.mergeCells(4, 1, 4, 3);
  for (let c = 1; c <= 3; c++) {
    const cell = h1Row.getCell(c);
    cell.fill = solidFill(HEADER_DARK);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }

  // Merge location groups
  let locCol = 4;
  for (let i = 0; i < totalLocations; i++) {
    worksheet.mergeCells(4, locCol, 4, locCol + 1);
    shadeLocation(h1Row, i, 'header');
    for (let c = locCol; c <= locCol + 1; c++) {
      const cell = h1Row.getCell(c);
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: reportLocationStyle(locations[i].label).text } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
    locCol += 2;
  }

  // Merge Totales Consolidados
  worksheet.mergeCells(4, locCol, 4, locCol + 1);
  for (let c = locCol; c <= locCol + 1; c++) {
    const cell = h1Row.getCell(c);
    cell.fill = solidFill(HEADER_DARK);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  }

  // Observations column header
  const obsCell = h1Row.getCell(totalColumns);
  obsCell.fill = solidFill(HEADER_DARK);
  obsCell.alignment = { horizontal: 'center', vertical: 'middle' };
  obsCell.border = thinBorder;

  // Row 5: Header Level 2 (Subcolumns)
  const h2Values = ['CÓDIGO', 'DESCRIPCIÓN', 'UND'];
  for (let i = 0; i < totalLocations; i++) {
    h2Values.push('Stock reg.', 'Traslado Pendiente');
  }
  h2Values.push('Stock reg.', 'Traslado Pendiente');
  h2Values.push('OBS.');

  const h2Row = worksheet.addRow(h2Values);
  h2Row.height = 20;
  h2Row.font = { name: 'Arial', size: 9, bold: true, color: { argb: REPORT_COLORS.text } };
  for (let c = 1; c <= totalColumns; c++) {
    const cell = h2Row.getCell(c);
    cell.fill = solidFill(REPORT_COLORS.subheader);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  }
  for (let i = 0; i < totalLocations; i++) shadeLocation(h2Row, i, 'header');

  // Helper to render section
  let productRowIndex = 0;
  const renderSection = (section) => {
    // Section Header Banner
    const sectionBannerRow = worksheet.addRow([`SECCIÓN: ${section.title}`]);
    sectionBannerRow.height = 22;
    sectionBannerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: HEADER_DARK } };
    worksheet.mergeCells(sectionBannerRow.number, 1, sectionBannerRow.number, totalColumns);
    for (let c = 1; c <= totalColumns; c++) {
      const cell = sectionBannerRow.getCell(c);
      cell.fill = solidFill(SECTION_BG);
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.border = thinBorder;
    }

    if (section.categories.length === 0) {
      const emptyRow = worksheet.addRow(['Sin productos registrados para esta sección']);
      worksheet.mergeCells(emptyRow.number, 1, emptyRow.number, totalColumns);
      emptyRow.font = { name: 'Arial', size: 9, italic: true };
      emptyRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    }

    for (const cat of section.categories) {
      // Category Group Banner
      const catRow = worksheet.addRow([`CATEGORÍA: ${cat.category_name.toUpperCase()}`]);
      catRow.height = 20;
      catRow.font = { name: 'Arial', size: 9, bold: true, color: { argb: HEADER_DARK } };
      worksheet.mergeCells(catRow.number, 1, catRow.number, totalColumns);
      for (let c = 1; c <= totalColumns; c++) {
        const cell = catRow.getCell(c);
        cell.fill = solidFill(CATEGORY_BG);
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.border = thinBorder;
      }

      // Products
      for (const prod of cat.products) {
        const rowValues = [prod.cod, prod.name, prod.unit];

        // Locations values
        for (const loc of locations) {
          const lData = prod.locations[loc.key] || { registeredStock: 0, pendingReceipt: 0 };
          rowValues.push(lData.registeredStock, lData.pendingReceipt);
        }

        // Consolidated totals
        rowValues.push(prod.totalRegisteredStock, prod.totalPendingReceipt);
        rowValues.push(prod.observations || '');

        const prodRow = worksheet.addRow(rowValues);
        prodRow.height = 18;
        prodRow.font = { name: 'Arial', size: 9 };
        const rowColor = productRowIndex++ % 2 === 0 ? REPORT_COLORS.row : REPORT_COLORS.alternateRow;
        for (let c = 1; c <= totalColumns; c++) prodRow.getCell(c).fill = solidFill(rowColor);

        prodRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
        prodRow.getCell(1).border = thinBorder;
        prodRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
        prodRow.getCell(2).border = thinBorder;
        prodRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        prodRow.getCell(3).border = thinBorder;

        let curC = 4;
        for (let i = 0; i < totalLocations; i++) {
          formatNumberCell(prodRow.getCell(curC++), prod.locations[locations[i].key]?.registeredStock || 0, decimalPlaces);
          formatNumberCell(prodRow.getCell(curC++), prod.locations[locations[i].key]?.pendingReceipt || 0, decimalPlaces);
          shadeLocation(prodRow, i, 'body');
        }
        formatNumberCell(prodRow.getCell(curC++), prod.totalRegisteredStock, decimalPlaces);
        formatNumberCell(prodRow.getCell(curC++), prod.totalPendingReceipt, decimalPlaces);
        const lastCell = prodRow.getCell(totalColumns);
        lastCell.alignment = { horizontal: 'left', vertical: 'middle' };
        lastCell.border = thinBorder;
        lastCell.fill = solidFill(REPORT_COLORS.observations);
      }

      // Category Subtotal
      const catSubRow = worksheet.addRow([`SUBTOTAL ${cat.category_name.toUpperCase()}`, '', '']);
      catSubRow.height = 20;
      catSubRow.font = { name: 'Arial', size: 9, bold: true, color: { argb: HEADER_DARK } };
      worksheet.mergeCells(catSubRow.number, 1, catSubRow.number, 3);
      for (let c = 1; c <= 3; c++) {
        const cell = catSubRow.getCell(c);
        cell.fill = solidFill(SUBTOTAL_BG);
        cell.border = thinBorder;
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }

      let subC = 4;
      for (let i = 0; i < totalLocations; i++) {
        const locSub = cat.subtotals.locations[locations[i].key] || { registeredStock: 0, pendingReceipt: 0 };
        const c1 = catSubRow.getCell(subC++);
        const c2 = catSubRow.getCell(subC++);
        formatNumberCell(c1, locSub.registeredStock, decimalPlaces);
        formatNumberCell(c2, locSub.pendingReceipt, decimalPlaces);
        [c1, c2].forEach(c => {
          c.font = { name: 'Arial', size: 9, bold: true };
        });
        shadeLocation(catSubRow, i, 'subtotal');
      }

      const cTot1 = catSubRow.getCell(subC++);
      const cTot2 = catSubRow.getCell(subC++);
      formatNumberCell(cTot1, cat.subtotals.totalRegisteredStock, decimalPlaces);
      formatNumberCell(cTot2, cat.subtotals.totalPendingReceipt, decimalPlaces);
      [cTot1, cTot2].forEach(c => {
        c.fill = solidFill(SUBTOTAL_BG);
        c.font = { name: 'Arial', size: 9, bold: true, color: { argb: HEADER_DARK } };
      });

      const catObs = catSubRow.getCell(totalColumns);
      catObs.fill = solidFill(SUBTOTAL_BG);
      catObs.border = thinBorder;
    }

    // Section Totals Row
    const secTotRow = worksheet.addRow([`TOTAL ${section.title}`, '', '']);
    secTotRow.height = 22;
    secTotRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: HEADER_DARK } };
    worksheet.mergeCells(secTotRow.number, 1, secTotRow.number, 3);
    for (let c = 1; c <= 3; c++) {
      const cell = secTotRow.getCell(c);
      cell.fill = solidFill(SECTION_TOTAL_BG);
      cell.border = thinBorder;
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    }

    let secC = 4;
    for (let i = 0; i < totalLocations; i++) {
      const locSec = section.totals.locations[locations[i].key] || { registeredStock: 0, pendingReceipt: 0 };
      const c1 = secTotRow.getCell(secC++);
      const c2 = secTotRow.getCell(secC++);
      formatNumberCell(c1, locSec.registeredStock, decimalPlaces);
      formatNumberCell(c2, locSec.pendingReceipt, decimalPlaces);
      [c1, c2].forEach(c => {
        c.font = { name: 'Arial', size: 10, bold: true, color: { argb: HEADER_DARK } };
      });
      shadeLocation(secTotRow, i, 'subtotal');
    }

    const sTot1 = secTotRow.getCell(secC++);
    const sTot2 = secTotRow.getCell(secC++);
    formatNumberCell(sTot1, section.totals.totalRegisteredStock, decimalPlaces);
    formatNumberCell(sTot2, section.totals.totalPendingReceipt, decimalPlaces);
    [sTot1, sTot2].forEach(c => {
      c.fill = solidFill(SECTION_TOTAL_BG);
      c.font = { name: 'Arial', size: 10, bold: true, color: { argb: HEADER_DARK } };
    });

    const secObs = secTotRow.getCell(totalColumns);
    secObs.fill = solidFill(SECTION_TOTAL_BG);
    secObs.border = thinBorder;

    // Blank separator after section
    const blankRow = worksheet.addRow([]);
    blankRow.height = 10;
  };

  renderSection(sections.rawMaterial);
  renderSection(sections.finishedProduct);

  // Grand Total Row (CONSOLIDADO GENERAL MP + PT)
  const grandRow = worksheet.addRow(['CONSOLIDADO GENERAL (MP + PT)', '', '']);
  grandRow.height = 24;
  grandRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: REPORT_COLORS.text } };
  worksheet.mergeCells(grandRow.number, 1, grandRow.number, 3);
  for (let c = 1; c <= 3; c++) {
    const cell = grandRow.getCell(c);
    cell.fill = solidFill(GRAND_TOTAL_BG);
    cell.border = doubleBottomBorder;
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  }

  let grandC = 4;
  for (let i = 0; i < totalLocations; i++) {
    const locGrand = grandTotals.locations[locations[i].key] || { registeredStock: 0, pendingReceipt: 0 };
    const c1 = grandRow.getCell(grandC++);
    const c2 = grandRow.getCell(grandC++);
    formatNumberCell(c1, locGrand.registeredStock, decimalPlaces);
    formatNumberCell(c2, locGrand.pendingReceipt, decimalPlaces);
    [c1, c2].forEach(c => {
      c.font = { name: 'Arial', size: 10, bold: true, color: { argb: HEADER_DARK } };
      c.border = doubleBottomBorder;
    });
    shadeLocation(grandRow, i, 'total');
  }

  const gTot1 = grandRow.getCell(grandC++);
  const gTot2 = grandRow.getCell(grandC++);
  formatNumberCell(gTot1, grandTotals.totalRegisteredStock, decimalPlaces);
  formatNumberCell(gTot2, grandTotals.totalPendingReceipt, decimalPlaces);
  [gTot1, gTot2].forEach(c => {
    c.fill = solidFill(GRAND_TOTAL_BG);
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: REPORT_COLORS.text } };
    c.border = doubleBottomBorder;
  });

  const gObs = grandRow.getCell(totalColumns);
  gObs.fill = solidFill(GRAND_TOTAL_BG);
  gObs.border = doubleBottomBorder;

  // Auto-fit column widths with min bounds
  worksheet.columns.forEach((column, index) => {
    if (index === 0) {
      column.width = 14; // CÓDIGO
    } else if (index === 1) {
      column.width = 32; // DESCRIPCIÓN
    } else if (index === 2) {
      column.width = 10; // UND
    } else if (index === totalColumns - 1) {
      column.width = 20; // OBSERVACIONES
    } else {
      column.width = 16; // Quantity columns
    }
  });

  return workbook;
};

module.exports = {
  generateConsolidatedInventoryExcel,
};
