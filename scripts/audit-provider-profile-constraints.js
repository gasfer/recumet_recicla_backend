'use strict';

const { sequelize } = require('../app/database/config');

const checks = Object.freeze({
  mainContacts: `SELECT id_provider, COUNT(*)::int AS count FROM provider_contacts WHERE status = true AND is_main_contact = true GROUP BY id_provider HAVING COUNT(*) > 1`,
  mainAccounts: `SELECT id_provider, COUNT(*)::int AS count FROM provider_bank_accounts WHERE status = true AND is_main = true GROUP BY id_provider HAVING COUNT(*) > 1`,
  duplicateAccounts: `SELECT id_provider, id_bank, account_number, COUNT(*)::int AS count FROM provider_bank_accounts WHERE status = true GROUP BY id_provider, id_bank, account_number HAVING COUNT(*) > 1`,
  duplicateMaterials: `SELECT id_provider, id_category, COALESCE(id_product, 0) AS id_product, COUNT(*)::int AS count FROM provider_materials WHERE status = true GROUP BY id_provider, id_category, COALESCE(id_product, 0) HAVING COUNT(*) > 1`,
  ambiguousCompanies: `SELECT pc.id, pc.full_names, COUNT(p.id)::int AS active_sites FROM provider_companies pc LEFT JOIN providers p ON p.id_provider_company = pc.id AND p.status = true GROUP BY pc.id, pc.full_names HAVING COUNT(p.id) <> 1`,
});

Promise.all(Object.entries(checks).map(async ([name, sql]) => {
  const [rows] = await sequelize.query(sql);
  return [name, rows];
}))
  .then((results) => process.stdout.write(`${JSON.stringify(Object.fromEntries(results), null, 2)}\n`))
  .catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; })
  .finally(() => sequelize.close());
