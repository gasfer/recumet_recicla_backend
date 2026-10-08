'use strict';

const CATALOGS = {
  usual_service_mode: ['DELIVERY_TO_RECUMET', 'PICKUP_BY_RECUMET', 'BOTH'],
  logistics_condition: ['SUPPLIER_DELIVERY', 'RECUMET_PICKUP', 'BY_VOLUME', 'TO_COORDINATE'],
  negotiation_mode: ['DIRECT', 'NEGOTIATION_REQUIRED', 'PRIOR_QUOTATION'],
  price_policy: ['LIST_PRICE', 'PREFERRED_PRICE', 'AUTHORIZED_SPECIAL_PRICE'],
};
const WHOLESALE_FIELDS = [...Object.keys(CATALOGS), 'commercialized_materials', 'habitual_price_adjustment', 'contact_frequency'];
const FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'EVENTUAL', 'UNDETERMINED'];

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function validateWholesaleProfile(data, typeCode) {
  if (typeof data.contact_frequency === 'string') {
    const value = data.contact_frequency.trim().toUpperCase();
    const aliases = { SEMANAL: 'WEEKLY', QUINCENAL: 'BIWEEKLY', MENSUAL: 'MONTHLY', TRIMESTRAL: 'QUARTERLY', ANUAL: 'ANNUAL', EVENTUAL: 'EVENTUAL', 'SIN DETERMINAR': 'UNDETERMINED' };
    data.contact_frequency = aliases[value] || value || null;
  }
  if (typeCode === 'B' || typeCode === 'C') {
    if (!['LIST_PRICE', 'AUTHORIZED_SPECIAL_PRICE'].includes(data.price_policy)) invalid('Seleccione el nivel de precio: precio minorista o ajuste autorizado');
    if (!CATALOGS.logistics_condition.includes(data.logistics_condition)) invalid('Seleccione una condición logística');
  }
  if (data.contact_frequency != null && !FREQUENCIES.includes(data.contact_frequency)) invalid('La frecuencia de contacto no es válida');
  for (const [field, options] of Object.entries(CATALOGS)) {
    if (data[field] != null && data[field] !== '' && !options.includes(data[field])) invalid(`Valor no válido para ${field}`);
  }
  for (const [field, max] of [['commercialized_materials', 1000], ['habitual_price_adjustment', 500]]) {
    if (data[field] != null && (typeof data[field] !== 'string' || data[field].length > max)) invalid(`Texto no válido para ${field} (máximo ${max} caracteres)`);
  }
  if (data.materials != null) {
    if (!Array.isArray(data.materials)) invalid('Los materiales deben ser una lista');
    if (data.materials.some(item => !item || typeof item !== 'object' || Array.isArray(item))) invalid('Cada material debe ser un registro válido');
    const products = new Set();
    for (const material of data.materials.filter(item => item.status !== false)) {
      const id = Number(material.id_product);
      if (!Number.isInteger(id) || id <= 0 || products.has(id)) invalid('Seleccione productos válidos sin duplicados');
      products.add(id);
      if (material.estimated_volume != null && material.estimated_volume !== '') {
        const volume = Number(material.estimated_volume);
        if (!Number.isFinite(volume) || volume < 0 || volume >= 1e15) invalid('El volumen estimado debe ser un número positivo o cero');
      }
      if (material.frequency != null && !FREQUENCIES.includes(material.frequency)) invalid('La frecuencia por producto no es válida');
    }
  }
  for (const [kind, primary] of [['contacts', 'is_main_contact'], ['bankAccounts', 'is_main']]) {
    if (data[kind] == null) continue;
    if (!Array.isArray(data[kind])) invalid(`${kind} debe ser una lista`);
    if (data[kind].some(item => !item || typeof item !== 'object' || Array.isArray(item))) invalid(`Cada registro de ${kind} debe ser válido`);
    const active = data[kind].filter(item => item.status !== false);
    if (active.length && active.filter(item => item[primary]).length !== 1) invalid(`Seleccione un único registro principal en ${kind}`);
    for (const item of active) {
      const required = kind === 'contacts' ? (['C', 'D', 'E', 'F'].includes(typeCode) ? ['full_name'] : ['full_name', 'position_area', 'cellphone']) : ['id_bank', 'account_holder', 'account_number', 'account_type', 'currency'];
      if (required.some(field => item[field] == null || String(item[field]).trim() === '')) invalid(`Complete todos los datos de ${kind}`);
      if (kind === 'contacts' && item.email && !/^\S+@\S+\.\S+$/.test(item.email)) invalid('El correo del contacto no es válido');
      if (kind === 'bankAccounts' && (!['CAJA_AHORRO', 'CUENTA_CORRIENTE', 'OTRA'].includes(item.account_type) || !['BOB', 'USD'].includes(item.currency))) invalid('El tipo de cuenta o la moneda no es válido');
    }
  }
}

module.exports = { WHOLESALE_FIELDS, validateWholesaleProfile };
