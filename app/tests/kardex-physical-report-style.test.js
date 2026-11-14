'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tabularReport } = require('../helpers/generator-pdf/tabular-report.adapter');
const { renderReportHtml } = require('../helpers/generator-pdf/report-html.template');
const { REPORT_COLORS } = require('../constants/report-style.constants');

test('PDF physical Kardex preserves grouped, subtotal, total and alternating row styles', () => {
  const report = tabularReport({
    widths: [1, 2],
    headerRows: 1,
    body: [
      [{ text: 'N.º' }, { text: 'Producto' }],
      [{ text: 'MATERIA PRIMA', rowKind: 'group', colSpan: 2 }, {}],
      [{ text: 1, rowKind: 'detail' }, { text: 'Cobre' }],
      [{ text: 2, rowKind: 'alternate' }, { text: 'Aluminio' }],
      [{ text: 'TOTAL MATERIA PRIMA', rowKind: 'subtotal', colSpan: 2 }, {}],
      [{ text: 'TOTALES POR UNIDAD', rowKind: 'total', colSpan: 2 }, {}],
    ],
  });
  assert.deepEqual(report.rows.map(row => row.kind), ['group', 'detail', 'alternate', 'subtotal', 'total']);
  const html = renderReportHtml({ title: 'KARDEX FÍSICO', reportTheme: 'stock', sections: [report] });
  assert.match(html, /class="row-alternate"/);
  assert.match(html, /class="row-group"/);
  assert.match(html, new RegExp(`background:${'#' + REPORT_COLORS.alternateRow.slice(-6)}`));
  assert.match(html, new RegExp(`background:${'#' + REPORT_COLORS.grandTotal.slice(-6)}`));
  assert.match(html, new RegExp(`background:${'#' + REPORT_COLORS.header.slice(-6)}`));
});
