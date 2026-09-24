const test = require('node:test');
const assert = require('node:assert/strict');

const configPath = require.resolve('../app/database/config');
const servicePath = require.resolve('../app/services/daily-kardex-history.service');

const queryResponder = (...results) => {
  const calls = [];
  return {
    calls,
    async query(sql, options) {
      calls.push({ sql, options });
      return results.length > 0 ? results.shift() : [];
    },
  };
};

const loadService = (responder) => {
  const cachedConfig = require.cache[configPath];
  const cachedService = require.cache[servicePath];
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: { sequelize: { query: (sql, options) => responder.query(sql, options) } },
  };
  delete require.cache[servicePath];
  const { getDailyKardexHistory } = require(servicePath);
  const restore = () => {
    if (cachedConfig) require.cache[configPath] = cachedConfig;
    else delete require.cache[configPath];
    if (cachedService) require.cache[servicePath] = cachedService;
    else delete require.cache[servicePath];
  };
  return { getDailyKardexHistory, restore };
};

const dailyRow = () => ({
  id: 1,
  id_movement: 10,
  type: 'INPUT',
  date: new Date('2026-09-17T09:00:00'),
  type_movement: 'INPUT',
  registry_number: 'SF-0001',
  detail: 'PROVEEDOR A',
  sub_detail: 'COMPRA #C-1',
  id_product: 7,
  id_sucursal: 1,
  id_storage: 2,
  quantity: '5.0000',
  cost_unitario: '2.0000',
  product_cod: 'A-1',
  product_name: 'ALUMINIO',
  unit_siglas: 'KGR',
  storage_name: 'PRINCIPAL',
  sucursal_name: 'LA PAZ',
});

test('une sólo movimientos del día aplicando filtros, orden y total en una sola pasada', async (t) => {
  const responder = queryResponder([{ ...dailyRow(), total_count: 27 }]);
  const { getDailyKardexHistory, restore } = loadService(responder);
  t.after(restore);

  const result = await getDailyKardexHistory({
    date: '17-09-2026',
    idSucursal: 1,
    idStorage: 2,
    idProduct: 7,
    type: 'INPUT',
    query: 'alum',
    fieldSort: 'quantity_input',
    order: 'desc',
    page: 2,
    limit: 25,
  });

  assert.equal(responder.calls.length, 1);
  assert.equal(result.total, 27);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].product.cod, 'A-1');
  assert.equal(result.data[0].product.unit.siglas, 'KGR');
  assert.equal(result.data[0].storage.name, 'PRINCIPAL');
  assert.equal(result.data[0].sucursal.name, 'LA PAZ');
  assert.equal(result.data[0].quantity_input, '5.0000');
  assert.equal(result.data[0].quantity_output, 0);
  assert.equal(result.data[0].id_movement, 10);
  assert.equal(result.data[0].saldo, null);
  assert.equal(result.data[0].total_count, undefined);

  const dataCall = responder.calls[0];
  assert.match(dataCall.sql, /COUNT\(\*\) OVER\(\) AS total_count/);
  assert.match(dataCall.sql, /BETWEEN :start AND :end/);
  assert.match(dataCall.sql, /km\.id_sucursal = :idSucursal/);
  assert.match(dataCall.sql, /i\.id_storage = :idStorage/);
  assert.match(dataCall.sql, /di\.id_product = :idProduct/);
  assert.match(dataCall.sql, /km\.type = :type/);
  assert.match(dataCall.sql, /p\.cod ILIKE :query/);
  assert.match(dataCall.sql, /p\.name ILIKE :query/);
  assert.match(dataCall.sql, /ORDER BY CASE WHEN m\.type = 'INPUT' THEN m\.quantity ELSE 0 END DESC, m\.id DESC/);
  assert.match(dataCall.sql, /LIMIT :limit OFFSET :offset/);
  assert.match(dataCall.sql, /details_inputs/);
  assert.doesNotMatch(dataCall.sql, /details_outputs/);
  assert.doesNotMatch(dataCall.sql, /FROM classifieds cl WHERE/);
  assert.equal(dataCall.options.replacements.limit, 25);
  assert.equal(dataCall.options.replacements.offset, 25);
  assert.equal(dataCall.options.replacements.idProduct, 7);
  assert.equal(dataCall.options.replacements.type, 'INPUT');
  assert.equal(dataCall.options.replacements.query, '%alum%');
});

test('devuelve día inválido como resultado vacío sin consultar la base de datos', async (t) => {
  const responder = queryResponder();
  const { getDailyKardexHistory, restore } = loadService(responder);
  t.after(restore);

  const result = await getDailyKardexHistory({ date: 'indefinida', idSucursal: 1, idStorage: 2 });

  assert.deepEqual(result, { data: [], total: 0 });
  assert.equal(responder.calls.length, 0);
});

test('no ejecuta un count extra cuando la primera página trae resultados', async (t) => {
  const responder = queryResponder([{ ...dailyRow(), total_count: 3 }]);
  const { getDailyKardexHistory, restore } = loadService(responder);
  t.after(restore);

  const result = await getDailyKardexHistory({ date: '17-09-2026', idSucursal: 1, idStorage: 2 });

  assert.equal(responder.calls.length, 1);
  assert.equal(result.total, 3);
});

test('usa el count de respaldo sólo cuando la página queda fuera de rango', async (t) => {
  const responder = queryResponder([], [{ total: 41 }]);
  const { getDailyKardexHistory, restore } = loadService(responder);
  t.after(restore);

  const result = await getDailyKardexHistory({ date: '17-09-2026', idSucursal: 1, idStorage: 2, page: 5, limit: 50 });

  assert.equal(responder.calls.length, 2);
  assert.equal(result.total, 41);
  assert.equal(result.data.length, 0);

  const countCall = responder.calls[1];
  assert.match(countCall.sql, /COUNT\(\*\)::int AS total/);
  assert.doesNotMatch(countCall.sql, /LIMIT/);
  assert.doesNotMatch(countCall.sql, /JOIN products p ON p\.id = m\.id_product/);
});

test('usa orden estable por fecha y descarta órdenes no permitidas', async (t) => {
  const responder = queryResponder();
  const { getDailyKardexHistory, restore } = loadService(responder);
  t.after(restore);

  await getDailyKardexHistory({ date: '17-09-2026', idSucursal: 1, idStorage: 2, fieldSort: 'cost_amount', order: 'asc' });

  assert.match(responder.calls[0].sql, /ORDER BY m\.date ASC, m\.id ASC/);
  assert.equal(responder.calls[0].sql.includes('cost_amount'), false);

  await getDailyKardexHistory({ date: '17-09-2026', idSucursal: 1, idStorage: 2, fieldSort: 'product.cod', order: 'desc' });
  assert.match(responder.calls[1].sql, /ORDER BY p\.cod DESC, m\.id DESC/);
});

test('poda las ramas de salida cuando el tipo filtrado es una entrada', async (t) => {
  const responder = queryResponder();
  const { getDailyKardexHistory, restore } = loadService(responder);
  t.after(restore);

  await getDailyKardexHistory({ date: '17-09-2026', idSucursal: 1, idStorage: 2, type: 'INPUT' });

  assert.match(responder.calls[0].sql, /details_inputs/);
  assert.doesNotMatch(responder.calls[0].sql, /details_outputs/);
  assert.doesNotMatch(responder.calls[0].sql, /FROM classifieds cl WHERE/);
  assert.equal(responder.calls[0].options.replacements.type, 'INPUT');
});

test('sin tipo consulta todas las fuentes activas del día', async (t) => {
  const responder = queryResponder();
  const { getDailyKardexHistory, restore } = loadService(responder);
  t.after(restore);

  await getDailyKardexHistory({ date: '17-09-2026', idSucursal: 1, idStorage: 2 });

  assert.match(responder.calls[0].sql, /details_inputs/);
  assert.match(responder.calls[0].sql, /details_outputs/);
  assert.match(responder.calls[0].sql, /FROM classifieds cl WHERE/);
  assert.equal(responder.calls[0].options.replacements.type, '');
  assert.equal(responder.calls.length, 1);
});

const controllerPath = require.resolve('../app/controllers/kardex.controller');
const dailyServicePath = require.resolve('../app/services/daily-kardex-history.service');
const eventServicePath = require.resolve('../app/services/kardex-event.service');
const enrichmentServicePath = require.resolve('../app/services/kardex-history-enrichment.service');

const loadController = (stub = {}) => {
  const paths = { configPath, controllerPath, dailyServicePath, eventServicePath, enrichmentServicePath };
  const cached = new Map(Object.entries(paths)
    .filter(([, file]) => require.cache[file])
    .map(([key, file]) => [key, require.cache[file]]));
  const calls = [];
  const serviceError = stub.serviceError;

  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: { sequelize: {}, ViewKardex: {}, TransferReviewNote: {} },
  };
  require.cache[dailyServicePath] = {
    id: dailyServicePath,
    filename: dailyServicePath,
    loaded: true,
    exports: {
      getDailyKardexHistory: async (params) => {
        calls.push(params);
        if (serviceError) throw serviceError;
        return { data: stub.rows || [], total: stub.total || 0 };
      },
    },
  };
  require.cache[eventServicePath] = {
    id: eventServicePath,
    filename: eventServicePath,
    loaded: true,
    exports: {
      KARDEX_HISTORY_ATTRIBUTES: [],
      attachKardexEventMetadata: (row) => {
        const values = row?.dataValues || row;
        values.event_label = values.event_label || 'EVENTO';
        return row;
      },
    },
  };
  require.cache[enrichmentServicePath] = {
    id: enrichmentServicePath,
    filename: enrichmentServicePath,
    loaded: true,
    exports: {
      enrichKardexHistory: async (rows) => {
        rows.forEach((row) => { row.valuation = { status: 'UNVALUED' }; });
        return rows;
      },
    },
  };
  delete require.cache[controllerPath];
  const { getDailyKardexPaginate } = require(controllerPath);
  const restore = () => {
    for (const [key, file] of Object.entries(paths)) {
      if (cached.get(key)) require.cache[file] = cached.get(key);
      else delete require.cache[file];
    }
  };
  return { getDailyKardexPaginate, calls, restore };
};

const responseRecorder = () => {
  const result = {};
  return {
    result,
    response: {
      status: (status) => ({ json: (body) => {
        result.status = status;
        result.body = body;
        return body;
      } }),
    },
  };
};

test('controlador diario mapea parámetros y devuelve el envoltorio paginado', async (t) => {
  const { getDailyKardexPaginate, calls, restore } = loadController({
    rows: [{ id_product: 7, type: 'INPUT' }],
    total: 3,
  });
  t.after(restore);
  const { response, result } = responseRecorder();

  await getDailyKardexPaginate({
    query: {
      page: '2',
      limit: '25',
      date1: '17-09-2026',
      id_sucursal: '1',
      id_storage: '2',
      id_product: '7',
      type_kardex: 'INPUT',
      field_sort: 'date',
      order: 'ASC',
    },
  }, response);

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.kardexes.data.length, 1);
  assert.equal(result.body.kardexes.total, 3);
  assert.equal(result.body.kardexes.currentPage, 2);
  assert.equal(result.body.kardexes.per_page, 25);
  assert.equal(result.body.kardexes.data[0].event_label, 'EVENTO');
  assert.deepEqual(result.body.kardexes.data[0].valuation, { status: 'UNVALUED' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].date, '17-09-2026');
  assert.equal(calls[0].idSucursal, '1');
  assert.equal(calls[0].idStorage, '2');
  assert.equal(calls[0].idProduct, '7');
  assert.equal(calls[0].type, 'INPUT');
  assert.equal(calls[0].query, '');
  assert.equal(calls[0].fieldSort, 'date');
  assert.equal(calls[0].order, 'ASC');
  assert.equal(calls[0].page, '2');
  assert.equal(calls[0].limit, '25');
});

test('controlador diario usa valores por defecto sin paginación explícita', async (t) => {
  const { getDailyKardexPaginate, calls, restore } = loadController({ rows: [], total: 0 });
  t.after(restore);
  const { response, result } = responseRecorder();

  await getDailyKardexPaginate({ query: { date1: '17-09-2026', id_sucursal: '1', id_storage: '2' } }, response);

  assert.equal(result.status, 200);
  assert.equal(result.body.kardexes.currentPage, 1);
  assert.equal(result.body.kardexes.per_page, 50);
  assert.equal(calls[0].type, '');
  assert.equal(calls[0].fieldSort, 'date');
  assert.equal(calls[0].order, 'DESC');
});

test('controlador diario responde 500 ante fallos del servicio', async (t) => {
  const { getDailyKardexPaginate, restore } = loadController({ serviceError: new Error('boom') });
  t.after(restore);
  const { response, result } = responseRecorder();

  await getDailyKardexPaginate({ query: { date1: '17-09-2026', id_sucursal: '1', id_storage: '2' } }, response);

  assert.equal(result.status, 500);
  assert.equal(result.body.ok, false);
  assert.ok(result.body.errors[0].msg);
});