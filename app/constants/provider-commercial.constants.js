const PROVIDER_COMMERCIAL_CATALOGS = Object.freeze({
  entity_type: Object.freeze(['PRIVATE', 'PUBLIC', 'NGO_FOUNDATION', 'OTHER']),
  frequency: Object.freeze(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'EVENTUAL', 'UNDETERMINED']),
  service_mode: Object.freeze(['DELIVERY_TO_RECUMET', 'PICKUP_BY_RECUMET', 'BOTH']),
  origin_channel: Object.freeze(['PROSPECTION', 'REFERRAL', 'SICOES', 'SOCIAL_MEDIA', 'DOOR', 'DIRECT_CONTACT', 'OTHER']),
  relationship_status: Object.freeze(['PROSPECT', 'IN_PROGRESS', 'ACTIVE_PROVIDER', 'DORMANT', 'LOST']),
  negotiation_condition: Object.freeze(['DIRECT', 'QUOTATION', 'TENDER', 'AGREEMENT', 'CONTRACT', 'OTHER']),
  account_type: Object.freeze(['CAJA_AHORRO', 'CUENTA_CORRIENTE', 'OTRA']),
  currency: Object.freeze(['BOB', 'USD']),
  site_role: Object.freeze(['HEADQUARTERS', 'BRANCH']),
  operational_type: Object.freeze(['RAW_MATERIAL', 'SERVICES', 'SUPPLIES', 'EQUIPMENT_ASSETS', 'COMMERCIAL', 'OTHER']),
});

const isProviderCatalogValue = (field, value) => (
  Object.prototype.hasOwnProperty.call(PROVIDER_COMMERCIAL_CATALOGS, field)
  && PROVIDER_COMMERCIAL_CATALOGS[field].includes(value)
);

module.exports = { PROVIDER_COMMERCIAL_CATALOGS, isProviderCatalogValue };
