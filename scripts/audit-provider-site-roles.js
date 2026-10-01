'use strict';

const models = require('../app/database/config');

const apply = process.argv.includes('--apply');

async function auditProviderSiteRoles() {
  const companies = await models.ProviderCompany.findAll({
    include: [{
      model: models.Provider,
      as: 'operatingProviders',
      required: false,
      where: { status: true },
    }],
    order: [['id', 'ASC']],
  });

  const report = { mode: apply ? 'apply' : 'preview', assigned: [], ambiguous: [], empty: [] };
  for (const company of companies) {
    const sites = company.operatingProviders || [];
    if (sites.length === 0) {
      report.empty.push({ companyId: company.id, name: company.full_names });
      continue;
    }
    if (sites.length !== 1) {
      report.ambiguous.push({
        companyId: company.id,
        name: company.full_names,
        activeProviderIds: sites.map((site) => site.id),
      });
      continue;
    }

    const site = sites[0];
    report.assigned.push({ companyId: company.id, providerId: site.id });
    if (apply && site.site_role !== 'HEADQUARTERS') {
      await site.update({ site_role: 'HEADQUARTERS' });
    }
  }
  return report;
}

auditProviderSiteRoles()
  .then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return models.sequelize.close();
  })
  .catch(async (error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    await models.sequelize.close();
    process.exitCode = 1;
  });
