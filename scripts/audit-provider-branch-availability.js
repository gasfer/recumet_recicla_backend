'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../app/database/config');

const QUERIES = {
  availability: `
    WITH values_by_provider AS (
      SELECT p.id, p.full_names, p.id_sucursal, p.enabled_sucursal_ids,
        jsonb_typeof(p.enabled_sucursal_ids) AS value_type,
        e.value AS raw_value,
        e.value #>> '{}' AS value,
        COUNT(*) OVER (PARTITION BY p.id, e.value) AS value_count
      FROM providers p
      LEFT JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.enabled_sucursal_ids) = 'array'
          THEN p.enabled_sucursal_ids ELSE '[]'::jsonb END
      ) e(value) ON TRUE
    ),
    invalid_values AS (
      SELECT v.id, v.value
      FROM values_by_provider v
      WHERE v.raw_value IS NOT NULL
        AND (jsonb_typeof(v.raw_value) <> 'number'
          OR v.value !~ '^[1-9][0-9]*$'
          OR CASE WHEN v.value ~ '^[1-9][0-9]*$' THEN v.value::numeric > 2147483647 ELSE FALSE END
          OR NOT EXISTS (SELECT 1 FROM sucursals s WHERE s.id = CASE WHEN v.value ~ '^[1-9][0-9]*$' AND v.value::numeric <= 2147483647 THEN v.value::integer END))
      GROUP BY v.id, v.value
    ),
    duplicates AS (
      SELECT id, value, MAX(value_count) AS occurrences
      FROM values_by_provider WHERE raw_value IS NOT NULL AND value_count > 1
      GROUP BY id, value
    )
    SELECT
      (SELECT COUNT(*) FROM providers WHERE enabled_sucursal_ids IS NULL) AS null_lists,
      (SELECT COUNT(*) FROM providers WHERE enabled_sucursal_ids = '[]'::jsonb) AS empty_lists,
      (SELECT COUNT(*) FROM providers WHERE enabled_sucursal_ids IS NOT NULL AND jsonb_typeof(enabled_sucursal_ids) <> 'array') AS non_array_lists,
      (SELECT COUNT(DISTINCT id) FROM values_by_provider WHERE raw_value IS NOT NULL AND jsonb_typeof(raw_value) <> 'number') AS providers_with_non_numeric_branch_values,
      (SELECT COUNT(DISTINCT id) FROM invalid_values) AS providers_with_invalid_branch_ids,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('provider_id', id, 'branch_id', value) ORDER BY id, value) FROM invalid_values), '[]'::jsonb) AS invalid_branch_ids,
      (SELECT COUNT(DISTINCT id) FROM duplicates) AS providers_with_repeated_branch_ids,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('provider_id', id, 'branch_id', value, 'occurrences', occurrences) ORDER BY id, value) FROM duplicates), '[]'::jsonb) AS repeated_branch_ids,
      (SELECT COUNT(*) FROM providers p WHERE p.id_sucursal IS NULL) AS providers_without_registration_branch,
      (SELECT COUNT(*) FROM providers p LEFT JOIN sucursals s ON s.id = p.id_sucursal WHERE p.id_sucursal IS NOT NULL AND s.id IS NULL) AS providers_with_missing_registration_branch,
      (SELECT COUNT(DISTINCT p.id) FROM providers p JOIN inputs i ON i.id_provider = p.id
        WHERE p.enabled_sucursal_ids IS NULL AND p.id_sucursal IS NULL AND i.id_sucursal IS NOT NULL
          AND i.status = 'ACTIVE' AND i.voided_at IS NULL) AS providers_with_purchase_branch_candidates,
      (SELECT COUNT(*) FROM (
        SELECT p.id, COUNT(DISTINCT i.id_sucursal) AS branches
        FROM providers p JOIN inputs i ON i.id_provider = p.id
        WHERE p.enabled_sucursal_ids IS NULL AND p.id_sucursal IS NULL AND i.id_sucursal IS NOT NULL
          AND i.status = 'ACTIVE' AND i.voided_at IS NULL
        GROUP BY p.id
      ) candidate_counts WHERE branches > 1) AS providers_with_multiple_purchase_branches,
      (SELECT COUNT(*) FROM providers p WHERE p.enabled_sucursal_ids IS NULL AND p.id_sucursal IS NULL
        AND NOT EXISTS (SELECT 1 FROM inputs i WHERE i.id_provider = p.id AND i.id_sucursal IS NOT NULL
          AND i.status = 'ACTIVE' AND i.voided_at IS NULL)) AS providers_without_origin_or_active_purchase_branch` ,
  duplicates: `
    WITH normalized AS (
      SELECT p.id, p.full_names, p.number_document,
        UPPER(REGEXP_REPLACE(TRIM(p.number_document), '[^[:alnum:]]', '', 'g')) AS document_key
      FROM providers p
      WHERE NULLIF(TRIM(p.number_document), '') IS NOT NULL
        AND NULLIF(UPPER(REGEXP_REPLACE(TRIM(p.number_document), '[^[:alnum:]]', '', 'g')), '') IS NOT NULL
    ), duplicate_keys AS (
      SELECT document_key FROM normalized GROUP BY document_key HAVING COUNT(*) > 1
    ), provider_references AS (
      SELECT p.id AS provider_id,
        (SELECT COUNT(*) FROM inputs i WHERE i.id_provider = p.id) AS purchase_count,
        (SELECT COUNT(*) FROM accounts_payables ap WHERE ap.id_provider = p.id) AS payable_count
      FROM providers p
    )
    SELECT RIGHT(n.document_key, 4) AS document_hint, n.id AS provider_id,
      r.purchase_count, r.payable_count
    FROM normalized n
    JOIN duplicate_keys d ON d.document_key = n.document_key
    JOIN provider_references r ON r.provider_id = n.id
    ORDER BY n.document_key, n.id`,
  purchaseHistory: `
    SELECT i.id_sucursal, COUNT(DISTINCT i.id) AS active_nonvoided_purchases,
      COUNT(DISTINCT i.id_provider) FILTER (WHERE i.id_provider IS NOT NULL) AS providers_with_active_nonvoided_purchases
    FROM inputs i
    WHERE i.status = 'ACTIVE' AND i.voided_at IS NULL AND i.id_sucursal IS NOT NULL
    GROUP BY i.id_sucursal ORDER BY i.id_sucursal`,
};

async function runAudit() {
  const [availability] = await sequelize.query(QUERIES.availability, { type: QueryTypes.SELECT, logging: false });
  const duplicateProviders = await sequelize.query(QUERIES.duplicates, { type: QueryTypes.SELECT, logging: false });
  const purchaseHistory = await sequelize.query(QUERIES.purchaseHistory, { type: QueryTypes.SELECT, logging: false });
  process.stdout.write(`${JSON.stringify({ mode: 'read-only', availability, duplicateProviders, purchaseHistory }, null, 2)}\n`);
}

runAudit()
  .catch(error => {
    process.stderr.write(`Provider branch availability audit failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
