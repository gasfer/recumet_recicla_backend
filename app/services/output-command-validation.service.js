'use strict';

const { decimalToString, decimalMultiply, exactAdd, exactCompare, exactSubtract } = require('../helpers/number-formatter');
const { getDecimalPlaces } = require('../helpers/decimals-value');

const validateOutputCommand = ({ outputData = {}, outputDetails = [], outputBig = {} } = {}) => {
  const errors = [];
  const add = (path, msg) => errors.push({ path, msg });
  const voucherTypes = ['MENOR', 'MAYOR. NACIONAL', 'MAYOR. EXTERIOR'];
  const registryTypes = ['FICHA', 'BOLETA', 'SIN FICHA'];
  const paymentTypes = ['EFECTIVO', 'CHEQUE', 'TRANSFERENCIA'];

  if (!voucherTypes.includes(String(outputData.voucher || '').trim())) add('output_data.voucher', 'Seleccione MENOR, MAYOR NACIONAL o MAYOR EXTERIOR.');
  if (!registryTypes.includes(String(outputData.type_registry || '').trim())) add('output_data.type_registry', 'Seleccione FICHA, BOLETA o SIN FICHA para el pesaje.');
  if (outputData.type_registry !== 'SIN FICHA' && !String(outputData.number_registry || '').trim()) {
    add('output_data.number_registry', 'Ingrese el número de ficha o boleta; este dato es obligatorio para ese tipo de pesaje.');
  }
  if (!paymentTypes.includes(String(outputData.type_payment || '').trim())) add('output_data.type_payment', 'Seleccione un medio de pago válido: efectivo, cheque o transferencia.');
  const payToCredit = outputData.pay_to_credit === true || outputData.pay_to_credit === 'true';
  if (payToCredit && !Number(outputData.id_client)) add('output_data.id_client', 'Seleccione un cliente antes de registrar una venta a crédito.');
  if (outputData.status !== 'ACTIVE') add('output_data.status', 'Una venta nueva o editada debe permanecer activa.');
  if (outputData.type_payment !== 'EFECTIVO') {
    if (!Number(outputData.id_bank)) add('output_data.id_bank', 'Seleccione el banco utilizado para el cheque o la transferencia.');
    if (!String(outputData.account_output || '').trim()) add('output_data.account_output', 'Ingrese el número de cheque o de cuenta usado para el pago.');
  }
  if (!Array.isArray(outputDetails) || outputDetails.length === 0) {
    add('output_details', 'Agregue al menos un producto antes de guardar la venta.');
    return errors;
  }

  let detailSubtotal = '0.0000';
  const seenProducts = new Set();
  const normalizeMoney = (value, path, label, { positive = false } = {}) => {
    try {
      const amount = decimalToString(value, getDecimalPlaces());
      if (positive ? exactCompare(amount, 0) <= 0 : exactCompare(amount, 0) < 0) {
        add(path, positive ? `${label} debe ser mayor que cero.` : `${label} no puede ser negativo.`);
        return null;
      }
      return amount;
    } catch (_) {
      add(path, `Ingrese ${label.toLowerCase()} como un número válido.`);
      return null;
    }
  };

  outputDetails.forEach((detail, index) => {
    const line = index + 1;
    const quantity = normalizeMoney(detail?.quantity, `output_details.${index}.quantity`, `La cantidad de la línea ${line}`, { positive: true });
    const price = normalizeMoney(detail?.price, `output_details.${index}.price`, `El precio de la línea ${line}`);
    const lineTotal = normalizeMoney(detail?.total, `output_details.${index}.total`, `El importe de la línea ${line}`);
    normalizeMoney(detail?.cost, `output_details.${index}.cost`, `El costo de la línea ${line}`);
    const productId = Number(detail?.id_product);
    if (!Number.isInteger(productId) || productId <= 0) add(`output_details.${index}.id_product`, `Línea ${line}: seleccione un producto válido.`);
    if (productId && seenProducts.has(productId)) add(`output_details.${index}.id_product`, `Línea ${line}: el producto está repetido; consolide la cantidad en una sola línea.`);
    if (productId) seenProducts.add(productId);
    if (detail?.status !== 'ACTIVE') add(`output_details.${index}.status`, `Línea ${line}: el detalle debe estar activo para registrarse en la venta.`);
    if (quantity !== null && price !== null && lineTotal !== null) {
      const expectedLineTotal = decimalMultiply(quantity, price);
      if (exactCompare(lineTotal, expectedLineTotal) !== 0) {
        add(`output_details.${index}.total`, `Línea ${line}: el importe no coincide con cantidad × precio (${expectedLineTotal}). Actualice el detalle.`);
      }
      detailSubtotal = exactAdd(detailSubtotal, lineTotal);
    }
  });

  const subtotal = normalizeMoney(outputData.sub_total, 'output_data.sub_total', 'El subtotal');
  const discount = normalizeMoney(outputData.discount, 'output_data.discount', 'El descuento');
  const total = normalizeMoney(outputData.total, 'output_data.total', 'El total');
  const onAccount = normalizeMoney(outputData.on_account, 'output_data.on_account', 'El monto pagado a cuenta');
  if (subtotal !== null && exactCompare(discount ?? 0, subtotal) > 0) add('output_data.discount', 'El descuento no puede superar el subtotal de la venta.');
  if (subtotal !== null && discount !== null && exactCompare(detailSubtotal, subtotal) !== 0) {
    add('output_data.sub_total', `El subtotal (${subtotal}) no coincide con la suma de los importes de los productos (${detailSubtotal}).`);
  }
  if (subtotal !== null && discount !== null && total !== null) {
    const expectedTotal = exactSubtract(subtotal, discount);
    if (exactCompare(total, expectedTotal) !== 0) add('output_data.total', `El total debe ser subtotal menos descuento: ${expectedTotal}.`);
    if (onAccount !== null && exactCompare(onAccount, total) > 0) add('output_data.on_account', 'El monto pagado a cuenta no puede superar el total de la venta.');
  }

  if (outputData.voucher !== 'MENOR') {
    if (!Number(outputBig.id_chauffeur)) add('output_big.id_chauffeur', 'Seleccione el conductor para registrar una venta mayorista.');
    if (!Number(outputBig.id_cargo_truck)) add('output_big.id_cargo_truck', 'Seleccione el camión asignado a la venta mayorista.');
    if (!String(outputBig.origin || '').trim()) add('output_big.origin', 'Seleccione el origen de la carga.');
    if (!String(outputBig.destination || '').trim()) add('output_big.destination', 'Seleccione el destino de la carga.');
  }

  return errors;
};

module.exports = { validateOutputCommand };
