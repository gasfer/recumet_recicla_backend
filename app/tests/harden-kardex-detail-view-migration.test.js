'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../database/migrations/20260923000001-harden-kardex-detail-view');

const viewDefinition = `
  SELECT * FROM details_inputs di JOIN inputs i ON i.id = di.id_input WHERE i.status::text = 'ACTIVE'::text
  UNION ALL
  SELECT * FROM details_classifieds dc JOIN classifieds cl ON cl.id = dc.id_classified WHERE cl.status::text = 'ACTIVE'::text
  UNION ALL
  SELECT * FROM details_outputs dot JOIN outputs o ON o.id = dot.id_output WHERE o.status::text = 'ACTIVE'::text
`;

test('incluye solo líneas activas de documentos activos en Kardex', () => {
  const result = migration.addActiveDetailFilters(viewDefinition);

  assert.match(result, /i\.status::text = 'ACTIVE'::text AND di\.status::text = 'ACTIVE'::text/);
  assert.match(result, /cl\.status::text = 'ACTIVE'::text AND dc\.status::text = 'ACTIVE'::text/);
  assert.match(result, /o\.status::text = 'ACTIVE'::text AND dot\.status::text = 'ACTIVE'::text/);
  assert.equal(migration.removeActiveDetailFilters(result), viewDefinition);
});
