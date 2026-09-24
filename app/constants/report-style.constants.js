'use strict';

const REPORT_COLORS = Object.freeze({
  header: 'FF1E5B3A',
  subheader: 'FFE3F3EA',
  row: 'FFFFFFFF',
  alternateRow: 'FFF3F9F5',
  total: 'FFD4EBDD',
  grandTotal: 'FFB9DFC8',
  highlight: 'FFFFF9B3',
  text: 'FF000000',
  textOnDark: 'FFFFFFFF',
  border: 'FFD4DDD7',
  productData: 'FFD6E2F0',
  observations: 'FFF5F5F2',
  observationsHeader: 'FFE7E8E3',
});

const LOCATION_STYLES = Object.freeze({
  casaMatriz: { header: 'FFD4EBDD', body: 'FFE8F5ED', subtotal: 'FFD4EBDD', total: 'FFC5DCF3', text: 'FF1E5B3A' },
  cbba: { header: 'FFDDEFE5', body: 'FFEDF8F2', subtotal: 'FFDDEFE5', total: 'FFC9E9D5', text: 'FF1E5B3A' },
  santaCruz: { header: 'FFFFF1A8', body: 'FFFFF9D9', subtotal: 'FFFFF1A8', total: 'FFFFE8A3', text: 'FF6B6500' },
  default: { header: 'FFE3F3EA', body: 'FFFFFFFF', subtotal: 'FFD4EBDD', total: 'FFB9DFC8', text: 'FF1E5B3A' },
});

const reportLocationStyle = (label = '') => {
  const normalized = String(label).toUpperCase();
  if (normalized.includes('CASA MATRIZ')) return LOCATION_STYLES.casaMatriz;
  if (normalized.includes('CBBA') || normalized.includes('COCHABAMBA')) return LOCATION_STYLES.cbba;
  if (normalized.includes('SANTA CRUZ')) return LOCATION_STYLES.santaCruz;
  return LOCATION_STYLES.default;
};

const solidFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

const reportThinBorder = Object.freeze({
  top: { style: 'thin', color: { argb: REPORT_COLORS.border } },
  left: { style: 'thin', color: { argb: REPORT_COLORS.border } },
  bottom: { style: 'thin', color: { argb: REPORT_COLORS.border } },
  right: { style: 'thin', color: { argb: REPORT_COLORS.border } },
});

module.exports = { REPORT_COLORS, LOCATION_STYLES, reportLocationStyle, solidFill, reportThinBorder };
