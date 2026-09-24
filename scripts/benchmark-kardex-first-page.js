'use strict';

const db = require('../app/database/config');
const { getKardexPaginate } = require('../app/controllers/kardex.controller');

const response = () => ({
  statusCode: 0,
  payload: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; },
});

const run = async () => {
  const req = {
    query: {
      page: '1',
      limit: '50',
      filterBy: 'RANGE',
      date1: '01-01-2000',
      date2: '31-12-2100',
      orderNew: ['date', 'DESC'],
    },
  };
  const res = response();
  const startedAt = process.hrtime.bigint();
  await getKardexPaginate(req, res);
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  const result = {
    status: res.statusCode,
    duration_ms: Number(durationMs.toFixed(2)),
    page_size: res.payload?.kardexes?.data?.length || 0,
    total: res.payload?.kardexes?.total || 0,
    target_ms: 5000,
    target_met: res.statusCode === 200 && durationMs <= 5000,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.target_met) process.exitCode = 1;
};

run()
  .finally(() => db.sequelize.close());
