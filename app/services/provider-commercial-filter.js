'use strict';
const { Op, where, literal } = require('sequelize');

function providerCommercialFilter(value, entityType) {
  const hasUser = value !== undefined && value !== null && value !== '';
  if (hasUser && (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)) {
    throw Object.assign(new Error('Responsable comercial inválido'), { statusCode: 400 });
  }
  const conditions = [];
  if (hasUser) conditions.push(where(literal('COALESCE((SELECT pc.id_commercial_user FROM provider_companies pc WHERE pc.id = "provider"."id_provider_company"), "provider"."id_commercial_user")'), Number(value)));
  if (entityType) {
    if (!['PRIVATE', 'PUBLIC', 'NGO_FOUNDATION', 'OTHER'].includes(entityType)) throw Object.assign(new Error('Tipo de entidad inválido'), { statusCode: 400 });
    conditions.push(where(literal('COALESCE((SELECT pc.entity_type FROM provider_companies pc WHERE pc.id = "provider"."id_provider_company"), "provider"."entity_type")'), entityType));
    conditions.push(where(literal('(SELECT tp.code FROM types_provider tp WHERE tp.id = "provider"."id_type_provider")'), 'A'));
  }
  return conditions.length ? { [Op.and]: conditions } : {};
}

module.exports = { providerCommercialFilter };
