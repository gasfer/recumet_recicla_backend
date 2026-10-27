'use strict';

const { getDecimalPlaces } = require('../helpers/decimals-value');

const PAYMENT_METHODS = Object.freeze(['EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'QR']);
const REGISTRY_TYPES = Object.freeze(['SIN FICHA', 'FICHA', 'BOLETA']);
const REFERRAL_SOURCES = Object.freeze([
  'REDES SOCIALES',
  'PAGINA WEB RECUMET',
  'GOOGLE',
  'REFERIDO POR AMIGO',
  'FERIA',
  'SEGUIMIENTO COMERCIAL',
]);

const parseScaled = (value, scale) => {
  const raw = String(value ?? '').trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return null;
  const fraction = match[3] || '';
  if (fraction.length > scale && /[^0]/.test(fraction.slice(scale))) return null;
  const units = BigInt(`${match[1]}${match[2]}${fraction.slice(0, scale).padEnd(scale, '0')}`);
  return units;
};

const roundScaledProduct = (left, right, base) => {
  const product = left * right;
  const negative = product < 0n;
  const absolute = negative ? -product : product;
  let result = absolute / base;
  if ((absolute % base) * 2n >= base) result += 1n;
  return negative ? -result : result;
};

const booleanValue = (value) => {
  if (value === true || value === 'TRUE') return true;
  if (value === false || value === 'FALSE') return false;
  return null;
};

const validatePurchaseCommand = ({
  inputData = {}, inputDetails = [], decimalPlaces = getDecimalPlaces(), allowMissingReferralSource = false,
} = {}) => {
  const errors = [];
  const add = (field, msg) => errors.push({ path: field, msg });
  const scale = Number.isInteger(decimalPlaces) && decimalPlaces >= 0 && decimalPlaces <= 4 ? decimalPlaces : 2;
  const base = 10n ** BigInt(scale);
  const paymentMethod = String(inputData.type_payment || '').trim();
  const registryType = String(inputData.type_registry || '').trim();
  const credit = booleanValue(inputData.pay_to_credit);
  const invoice = booleanValue(inputData.is_paid);

  if (!REGISTRY_TYPES.includes(registryType)) add('input_data.type_registry', 'Seleccione un tipo de registro válido.');
  if (credit === null) add('input_data.pay_to_credit', 'La condición de pago debe ser al contado o a crédito.');
  if (!PAYMENT_METHODS.includes(paymentMethod)) add('input_data.type_payment', 'Seleccione un medio de pago válido.');
  if (invoice === null) add('input_data.is_paid', 'Indique si la compra lleva factura.');
  const referralSource = String(inputData.referral_sources || '').trim();
  const oldCustomer = booleanValue(inputData.old_customer) === true;
  if ((referralSource || (!oldCustomer && !allowMissingReferralSource)) && !REFERRAL_SOURCES.includes(referralSource)) {
    add('input_data.referral_sources', 'Seleccione un origen válido para el proveedor.');
  }
  for (const field of ['old_customer', 'with_pickup']) {
    if (booleanValue(inputData[field]) === null) add(`input_data.${field}`, 'El valor debe ser verdadero o falso.');
  }

  if (paymentMethod && PAYMENT_METHODS.includes(paymentMethod) && paymentMethod !== 'EFECTIVO') {
    if (!Number.isInteger(Number(inputData.id_bank)) || Number(inputData.id_bank) <= 0) add('input_data.id_bank', 'Seleccione el banco del pago.');
    const account = String(inputData.account_input || '').trim();
    if (!account) add('input_data.account_input', paymentMethod === 'CHEQUE' ? 'El número de cheque es obligatorio.' : 'La cuenta de origen es obligatoria.');
    if (account.length > 20) add('input_data.account_input', 'La cuenta o número de cheque debe tener máximo 20 caracteres.');
  }
  if (paymentMethod === 'TRANSFERENCIA' || paymentMethod === 'QR') {
    const transactionNumber = String(inputData.number_transaction || '').trim();
    if (!transactionNumber) add('input_data.number_transaction', 'El número de transacción es obligatorio para transferencia o QR.');
    if (transactionNumber.length > 50) add('input_data.number_transaction', 'El número de transacción debe tener máximo 50 caracteres.');
  }

  const numericFields = ['sumas', 'discount', 'total', 'on_account'];
  const header = {};
  for (const field of numericFields) {
    header[field] = parseScaled(inputData[field], scale);
    if (header[field] === null) add(`input_data.${field}`, 'Ingrese un importe válido con la precisión permitida.');
    else if (header[field] < 0n) add(`input_data.${field}`, 'El importe no puede ser negativo.');
  }

  if (Array.isArray(inputDetails) && inputDetails.length) {
    let detailSubtotal = 0n;
    for (const [index, detail] of inputDetails.entries()) {
      const quantity = parseScaled(detail?.quantity, scale);
      const cost = parseScaled(detail?.cost, scale);
      const total = parseScaled(detail?.total, scale);
      if (quantity === null || quantity <= 0n) add(`input_details.${index}.quantity`, 'La cantidad debe ser mayor a cero y respetar la precisión permitida.');
      if (cost === null || cost < 0n) add(`input_details.${index}.cost`, 'El costo debe ser un importe válido no negativo.');
      if (total === null || total < 0n) add(`input_details.${index}.total`, 'El total del detalle debe ser un importe válido no negativo.');
      if (quantity !== null && cost !== null && total !== null) {
        const expected = roundScaledProduct(quantity, cost, base);
        if (expected !== total) add(`input_details.${index}.total`, 'El total del detalle no coincide con la cantidad por el costo.');
        detailSubtotal += total;
      }
    }
    if (header.sumas !== null && detailSubtotal !== header.sumas) add('input_data.sumas', 'La suma de los detalles no coincide con el subtotal de la compra.');
  }

  if (header.sumas !== null && header.discount !== null && header.total !== null) {
    if (header.discount > header.sumas) add('input_data.discount', 'El descuento no puede superar el subtotal.');
    if (header.sumas - header.discount !== header.total) add('input_data.total', 'El total debe coincidir con el subtotal menos el descuento.');
  }
  if (credit === true && header.on_account !== null && header.total !== null && header.on_account > header.total) {
    add('input_data.on_account', 'El abono inicial no puede superar el total de la compra.');
  }
  if (credit === false && header.on_account !== null && header.on_account !== 0n) {
    add('input_data.on_account', 'La compra al contado no admite abono inicial de crédito.');
  }

  return errors;
};

module.exports = { PAYMENT_METHODS, REGISTRY_TYPES, REFERRAL_SOURCES, validatePurchaseCommand };
