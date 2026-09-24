'use strict';

const db = require('../app/database/config');
const { ValuedKardexRebuilder } = require('../app/services/valued-kardex-rebuilder.service');
const { KARDEX_HISTORY_ATTRIBUTES } = require('../app/services/kardex-event.service');

const summarize = (items, field) => items.reduce((summary, item) => {
  const key = item[field] || 'UNKNOWN';
  summary[key] = (summary[key] || 0) + 1;
  return summary;
}, {});

const run = async () => {
  const startedAt = Date.now();
  const [rows, stocks, persisted] = await Promise.all([
    db.ViewKardex.findAll({ attributes: ['id', ...KARDEX_HISTORY_ATTRIBUTES], raw: true }),
    db.Stock.findAll({
      where: { status: true },
      attributes: ['id_product', 'id_sucursal', 'id_storage', 'stock'],
      raw: true,
    }),
    Promise.all([
      db.ValuedInventoryBalance.count(),
      db.ValuedKardexEntry.count(),
    ]),
  ]);

  const rebuilder = new ValuedKardexRebuilder();
  const preview = rebuilder.preview(rows);
  const parity = rebuilder.comparePhysical(preview, stocks);
  const report = {
    mode: 'PREVIEW_ONLY',
    mutated: preview.mutated,
    duration_ms: Date.now() - startedAt,
    source_movements: rows.length,
    active_stock_locations: stocks.length,
    reconstructed_entries: preview.entries.length,
    valued_entries: preview.entries.filter((entry) => entry.valuation_status === 'VALUED').length,
    unvalued_entries: preview.entries.filter((entry) => entry.valuation_status === 'UNVALUED').length,
    exception_counts: summarize(preview.exceptions, 'code'),
    exception_sample: preview.exceptions.slice(0, 20),
    physical_parity: {
      valid: parity.valid,
      difference_count: parity.differences.length,
      difference_sample: parity.differences.slice(0, 20),
    },
    persisted_before_preview: {
      balances: persisted[0],
      entries: persisted[1],
    },
  };
  console.log(JSON.stringify(report, null, 2));
  if (preview.mutated || persisted[0] !== await db.ValuedInventoryBalance.count() || persisted[1] !== await db.ValuedKardexEntry.count()) {
    throw new Error('La previsualización modificó inesperadamente las tablas valoradas.');
  }
};

run()
  .then(() => db.sequelize.close())
  .catch(async (error) => {
    console.error(JSON.stringify({ code: error.code || 'PREVIEW_FAILED', message: error.message }, null, 2));
    await db.sequelize.close();
    process.exitCode = 1;
  });
