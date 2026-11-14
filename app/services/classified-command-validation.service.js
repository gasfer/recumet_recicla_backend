'use strict';

const { exactAdd, exactCompare, inventoryQuantity } = require('../helpers/number-formatter');
const { getDecimalPlaces } = require('../helpers/decimals-value');

const CLASSIFIED_REGISTRY_TYPES = Object.freeze(['FICHA', 'BOLETA', 'SIN FICHA']);

const validateClassifiedCommand = ({ classifiedData = {}, classifiedDetails = [] } = {}) => {
  const errors = [];
  const add = (path, msg) => errors.push({ path, msg });
  const registryType = String(classifiedData.type_registry ?? '').trim();
  if (!CLASSIFIED_REGISTRY_TYPES.includes(registryType)) {
    add('classified_data.type_registry', 'Seleccione un tipo de registro válido.');
  }
  if (registryType && registryType !== 'SIN FICHA' && !String(classifiedData.number_registry ?? '').trim()) {
    add('classified_data.number_registry', 'El número de pesaje es obligatorio para ficha o boleta.');
  }
  if (String(classifiedData.number_registry ?? '').trim().length > 50) {
    add('classified_data.number_registry', 'El número de pesaje debe tener máximo 50 caracteres.');
  }
  if (!Number.isFinite(Date.parse(classifiedData.date_classified))) {
    add('classified_data.date_classified', 'Ingrese una fecha de clasificación válida.');
  }
  if (String(classifiedData.status ?? '').trim() !== 'ACTIVE') {
    add('classified_data.status', 'Una clasificación nueva debe registrarse activa.');
  }

  const normalizeNonNegative = (value, path, { positive = false, label } = {}) => {
    const parsed = Number(value);
    if (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(parsed)) {
      add(path, `Ingrese ${label || (path.includes('quantity') ? 'una cantidad' : 'un costo')} con formato numérico válido.`);
      return null;
    }
    try {
      const normalized = inventoryQuantity(value);
      if (positive ? exactCompare(normalized, 0) <= 0 : exactCompare(normalized, 0) < 0) {
        add(path, positive ? `${label || 'La cantidad'} debe ser mayor que cero.` : `${label || 'El costo'} no puede ser negativo.`);
        return null;
      }
      return normalized;
    } catch (_) {
      add(path, `${label || 'El valor'} debe tener como máximo ${getDecimalPlaces()} decimales.`);
      return null;
    }
  };

  const sourceQuantity = normalizeNonNegative(classifiedData.quantity_product, 'classified_data.quantity_product', { positive: true, label: 'La cantidad de origen' });
  normalizeNonNegative(classifiedData.cost_product, 'classified_data.cost_product', { label: 'El costo del producto de origen' });
  if (!Array.isArray(classifiedDetails) || classifiedDetails.length === 0) {
    add('classified_details', 'Agregue al menos un producto clasificado.');
    return errors;
  }

  let detailQuantity = '0.0000';
  const seenProductIds = new Set();
  classifiedDetails.forEach((detail, index) => {
    const line = index + 1;
    const quantityPath = `classified_details.${index}.quantity`;
    const costPath = `classified_details.${index}.cost`;
    const productId = Number(detail?.id_product);
    const quantity = normalizeNonNegative(detail?.quantity, quantityPath, { positive: true, label: `La cantidad de la línea ${line}` });
    normalizeNonNegative(detail?.cost, costPath, { label: `El costo de la línea ${line}` });
    if (!Number.isInteger(productId) || productId <= 0) add(`classified_details.${index}.id_product`, `Línea ${line}: seleccione un producto clasificado del catálogo.`);
    if (productId && productId === Number(classifiedData.id_product)) {
      add(`classified_details.${index}.id_product`, `Línea ${line}: el producto clasificado coincide con el origen; seleccione un producto diferente.`);
    }
    if (productId && seenProductIds.has(productId)) add(`classified_details.${index}.id_product`, `Línea ${line}: el producto está repetido. Consolide su cantidad en una sola línea.`);
    if (productId) seenProductIds.add(productId);
    if (detail?.status !== 'ACTIVE') add(`classified_details.${index}.status`, `Línea ${line}: el producto debe estar activo para registrarlo en la clasificación.`);
    if (quantity !== null) detailQuantity = exactAdd(detailQuantity, quantity);
  });

  if (sourceQuantity !== null && exactCompare(sourceQuantity, detailQuantity) !== 0) {
    add('classified_details', `La salida de origen (${sourceQuantity}) debe igualar la suma de los productos clasificados (${detailQuantity}).`);
  }
  return errors;
};

module.exports = { CLASSIFIED_REGISTRY_TYPES, validateClassifiedCommand };
