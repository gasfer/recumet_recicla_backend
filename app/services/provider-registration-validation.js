'use strict';
const { PROVIDER_COMMERCIAL_CATALOGS } = require('../constants/provider-commercial.constants');

function fail(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function validateRegistrationFields(data) {
  if (typeof data.frequency_mode === 'string') data.frequency_mode = data.frequency_mode.trim().toLowerCase();
  if (Array.isArray(data.materials)) data.materials.forEach(item => { if (typeof item?.frequency_mode === 'string') item.frequency_mode = item.frequency_mode.trim().toLowerCase(); });
  const lengths = {
    full_names: 174, commercial_name: 174, number_document: 50, direction: 254,
    name_contact: 174, companyContacts: 254, workAreaOrPositionOrUnit: 254,
    commercial_observations: 2000, contact_observations: 2000, general_observations: 2000,
    department: 120, city: 120, zone: 120, geolocation_text: 500,
  };
  for (const [field, max] of Object.entries(lengths)) {
    if (data[field] != null && (typeof data[field] !== 'string' || data[field].length > max)) fail(`El campo ${field} debe tener máximo ${max} caracteres`);
  }
  if (data.full_names != null && data.full_names.trim().length < 2) fail('El nombre debe tener al menos 2 caracteres');
  for (const field of ['status', 'requires_certificate', 'requires_traceability_report']) {
    if (data[field] != null && typeof data[field] !== 'boolean') fail(`El campo ${field} debe ser booleano`);
  }
  for (const field of ['cellphone', 'cellphone_contact']) {
    if (data[field] != null && data[field] !== '' && !/^[67]\d{7}$/.test(String(data[field]))) fail(`El celular ${field} debe tener 8 dígitos y comenzar con 6 o 7`);
  }
  const has = value => value != null && value !== '';
  if (has(data.latitude) || has(data.longitude)) {
    if (!has(data.latitude) || !has(data.longitude) || !Number.isFinite(Number(data.latitude)) || !Number.isFinite(Number(data.longitude)) || Math.abs(Number(data.latitude)) > 90 || Math.abs(Number(data.longitude)) > 180) fail('Registre latitud y longitud válidas');
  }
  if (data.frequency_mode != null && !['automatic', 'manual'].includes(data.frequency_mode)) fail('La modalidad de frecuencia no es válida');
  for (const field of ['frequency', 'service_mode', 'origin_channel', 'relationship_status', 'negotiation_condition', 'entity_type']) {
    const allowed = [...PROVIDER_COMMERCIAL_CATALOGS[field], ...(field === 'origin_channel' ? ['ROUTING_VISIT'] : field === 'relationship_status' ? ['ACTIVE', 'TO_RECOVER'] : [])];
    if (data[field] != null && data[field] !== '' && !allowed.includes(data[field])) fail(`El valor de ${field} no pertenece al catálogo permitido`);
  }
  if (data.contact_email && !/^\S+@\S+\.\S+$/.test(data.contact_email)) fail('El correo del contacto no es válido');
  for (const kind of ['contacts', 'bankAccounts', 'materials']) {
    if (data[kind] == null) continue;
    if (!Array.isArray(data[kind])) fail(`El campo ${kind} debe ser una lista`);
    for (const item of data[kind]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`Registro no válido en ${kind}`);
      if (item.status === false) continue;
      if (kind === 'contacts') {
        if (String(item.full_name || '').length > 174 || String(item.position_area || '').length > 254) fail('El nombre o cargo del contacto excede el límite permitido');
        if (item.cellphone && !/^[67]\d{7}$/.test(String(item.cellphone))) fail('El celular del contacto debe tener 8 dígitos y comenzar con 6 o 7');
        if (item.email && !/^\S+@\S+\.\S+$/.test(item.email)) fail('El correo del contacto no es válido');
      }
      if (kind === 'bankAccounts') {
        if (!Number.isInteger(Number(item.id_bank)) || Number(item.id_bank) <= 0) fail('Seleccione un banco válido');
        if (String(item.account_holder || '').length > 254 || String(item.account_number || '').length > 254) fail('La cuenta bancaria excede el límite permitido');
      }
      if (kind === 'materials') {
        if (item.frequency_mode != null && !['automatic', 'manual'].includes(item.frequency_mode)) fail('La modalidad de frecuencia por producto no es válida');
        if (item.frequency && !PROVIDER_COMMERCIAL_CATALOGS.frequency.includes(item.frequency)) fail('La frecuencia por producto no es válida');
        if (item.estimated_volume != null && (!Number.isFinite(Number(item.estimated_volume)) || Number(item.estimated_volume) < 0)) fail('El volumen estimado no es válido');
      }
    }
  }
}

module.exports = { validateRegistrationFields };
