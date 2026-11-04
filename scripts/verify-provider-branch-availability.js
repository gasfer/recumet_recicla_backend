'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../app/database/config');

const QUERIES = {
  migration: `
    SELECT EXISTS (
      SELECT 1 FROM "SequelizeMeta"
      WHERE name = '20261104120000-create-provider-sucursal-availability.js'
    ) AS applied`,
  associations: `
    SELECT COUNT(*) AS total_associations,
      COUNT(*) FILTER (WHERE status = TRUE) AS active_associations,
      COUNT(*) FILTER (WHERE status = FALSE) AS disabled_associations,
      COUNT(*) - COUNT(DISTINCT (id_provider, id_sucursal)) AS duplicate_pairs,
      COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM providers p WHERE p.id = a.id_provider)) AS orphan_providers,
      COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM sucursals s WHERE s.id = a.id_sucursal)) AS orphan_branches
    FROM provider_sucursal_availability a`,
  providerCoverage: `
    SELECT COUNT(*) AS total_providers,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM provider_sucursal_availability a
        WHERE a.id_provider = p.id AND a.status = TRUE
      )) AS providers_with_active_availability,
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM provider_sucursal_availability a
        WHERE a.id_provider = p.id AND a.status = TRUE
      )) AS providers_without_active_availability,
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM provider_sucursal_availability a
        WHERE a.id_provider = p.id AND a.status = TRUE
      ) AND p.enabled_sucursal_ids IS NULL AND p.id_sucursal IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM inputs i
          WHERE i.id_provider = p.id AND i.id_sucursal IS NOT NULL
            AND i.status = 'ACTIVE' AND i.voided_at IS NULL
        )) AS unassigned_without_origin_or_active_purchase,
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM provider_sucursal_availability a
        WHERE a.id_provider = p.id AND a.status = TRUE
      ) AND p.enabled_sucursal_ids = '[]'::jsonb) AS explicit_empty_availability
    FROM providers p`,
  explicitAvailability: `
    WITH explicit_assignments AS (
      SELECT p.id AS id_provider, e.value::integer AS id_sucursal
      FROM providers p
      CROSS JOIN LATERAL jsonb_array_elements_text(p.enabled_sucursal_ids) e(value)
      WHERE jsonb_typeof(p.enabled_sucursal_ids) = 'array'
    )
    SELECT COUNT(*) FILTER (WHERE a.id_provider IS NULL OR a.status = FALSE) AS explicit_assignments_missing_or_disabled,
      COUNT(*) AS explicit_assignments
    FROM explicit_assignments e
    LEFT JOIN provider_sucursal_availability a
      ON a.id_provider = e.id_provider AND a.id_sucursal = e.id_sucursal`,
  purchaseCoverage: `
    SELECT COUNT(DISTINCT i.id) AS active_nonvoided_purchase_count,
      COUNT(DISTINCT i.id) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM provider_sucursal_availability a
        WHERE a.id_provider = i.id_provider AND a.id_sucursal = i.id_sucursal AND a.status = TRUE
      )) AS purchases_without_current_provider_availability,
      COUNT(DISTINCT i.id_provider) FILTER (WHERE i.id_provider IS NOT NULL) AS purchase_provider_count
    FROM inputs i
    WHERE i.status = 'ACTIVE' AND i.voided_at IS NULL AND i.id_sucursal IS NOT NULL`,
  purchaseAvailabilityExceptions: `
    SELECT i.id_sucursal,
      COUNT(DISTINCT i.id) AS historical_purchases_without_current_availability,
      COUNT(DISTINCT i.id_provider) FILTER (WHERE i.id_provider IS NOT NULL) AS providers_affected
    FROM inputs i
    WHERE i.status = 'ACTIVE' AND i.voided_at IS NULL AND i.id_sucursal IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM provider_sucursal_availability a
        WHERE a.id_provider = i.id_provider AND a.id_sucursal = i.id_sucursal AND a.status = TRUE
      )
    GROUP BY i.id_sucursal ORDER BY i.id_sucursal`,
  financialReferences: `
    SELECT (SELECT COUNT(*) FROM inputs) AS all_purchase_rows,
      (SELECT COUNT(DISTINCT id_provider) FROM inputs WHERE id_provider IS NOT NULL) AS providers_referenced_by_purchases,
      (SELECT COUNT(*) FROM accounts_payables) AS all_payable_rows,
      (SELECT COUNT(DISTINCT id_provider) FROM accounts_payables WHERE id_provider IS NOT NULL) AS providers_referenced_by_payables,
      (SELECT COUNT(*) FROM (
        SELECT UPPER(REGEXP_REPLACE(TRIM(number_document), '[^[:alnum:]]', '', 'g')) AS document_key
        FROM providers
        WHERE NULLIF(TRIM(number_document), '') IS NOT NULL
        GROUP BY 1 HAVING COUNT(*) > 1
      ) duplicates) AS duplicate_document_groups`,
  duplicateIdentityReferences: `
    WITH normalized AS (
      SELECT id, UPPER(REGEXP_REPLACE(TRIM(number_document), '[^[:alnum:]]', '', 'g')) AS document_key
      FROM providers
      WHERE NULLIF(TRIM(number_document), '') IS NOT NULL
    ), duplicate_keys AS (
      SELECT document_key FROM normalized GROUP BY document_key HAVING COUNT(*) > 1
    )
    SELECT n.id AS provider_id,
      (SELECT COUNT(*) FROM inputs i WHERE i.id_provider = n.id) AS purchase_references,
      (SELECT COUNT(*) FROM accounts_payables ap WHERE ap.id_provider = n.id) AS payable_references
    FROM normalized n JOIN duplicate_keys d ON d.document_key = n.document_key
    ORDER BY n.document_key, n.id`,
  purchaseHistory: `
    SELECT i.id_sucursal, COUNT(DISTINCT i.id) AS active_nonvoided_purchases,
      COUNT(DISTINCT i.id_provider) FILTER (WHERE i.id_provider IS NOT NULL) AS providers_with_active_nonvoided_purchases
    FROM inputs i
    WHERE i.status = 'ACTIVE' AND i.voided_at IS NULL AND i.id_sucursal IS NOT NULL
    GROUP BY i.id_sucursal ORDER BY i.id_sucursal`,
};

async function verify() {
  const [migration] = await sequelize.query(QUERIES.migration, { type: QueryTypes.SELECT, logging: false });
  const [associations] = await sequelize.query(QUERIES.associations, { type: QueryTypes.SELECT, logging: false });
  const [providerCoverage] = await sequelize.query(QUERIES.providerCoverage, { type: QueryTypes.SELECT, logging: false });
  const [explicitAvailability] = await sequelize.query(QUERIES.explicitAvailability, { type: QueryTypes.SELECT, logging: false });
  const [purchaseCoverage] = await sequelize.query(QUERIES.purchaseCoverage, { type: QueryTypes.SELECT, logging: false });
  const purchaseAvailabilityExceptions = await sequelize.query(QUERIES.purchaseAvailabilityExceptions, { type: QueryTypes.SELECT, logging: false });
  const [financialReferences] = await sequelize.query(QUERIES.financialReferences, { type: QueryTypes.SELECT, logging: false });
  const duplicateIdentityReferences = await sequelize.query(QUERIES.duplicateIdentityReferences, { type: QueryTypes.SELECT, logging: false });
  const purchaseHistory = await sequelize.query(QUERIES.purchaseHistory, { type: QueryTypes.SELECT, logging: false });
  const report = { mode: 'read-only', migration, associations, providerCoverage, explicitAvailability, purchaseCoverage, purchaseAvailabilityExceptions, financialReferences, duplicateIdentityReferences, purchaseHistory };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!migration.applied || Number(associations.duplicate_pairs) || Number(associations.orphan_providers)
      || Number(associations.orphan_branches) || Number(explicitAvailability.explicit_assignments_missing_or_disabled)) {
    process.exitCode = 2;
  }
}

verify()
  .catch(error => {
    process.stderr.write(`Provider branch availability verification failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
