'use strict';
const { User, sequelize, Sequelize } = require('../app/database/config');
const { ensureProviderRegistrationPermission, PROVIDER_REGISTRATION_ROLES } = require('../app/services/user-role-permissions.service');

sequelize.transaction(async transaction => {
  const users = await User.findAll({
    where: { role: { [Sequelize.Op.in]: PROVIDER_REGISTRATION_ROLES } },
    attributes: ['id', 'role'], transaction,
  });
  for (const user of users) await ensureProviderRegistrationPermission(user, transaction);
  console.log(`Permisos iniciales revisados para ${users.length} usuarios. Las configuraciones existentes se conservaron.`);
}).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => sequelize.close());
