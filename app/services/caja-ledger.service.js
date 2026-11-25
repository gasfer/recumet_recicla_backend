'use strict';
const { CajaSmall, CjCaja, CjAccount, CjAccountAssignment, CjSessionBalance, CjLedger, DetailsCajaSmall } = require('../database/config');
const { Op } = require('sequelize');

const money = value => Number(Number(value || 0).toFixed(4));

async function postOperationalMovement({ branchId, userId, userRole, direction, amount, paymentType, bankId, description, sourceType, sourceId, transaction, idempotencyKey, cashboxType }) {
  const value = money(amount);
  if (value < 0) {
    const error = new Error('El importe de un movimiento financiero no puede ser negativo.');
    error.statusCode = 422; throw error;
  }
  if (!(value > 0)) return null;
  if (cashboxType != null && !['CHICA', 'MAYOR'].includes(String(cashboxType).trim().toUpperCase())) {
    const error = new Error('Selecciona Caja Chica o Caja Mayor para este movimiento.');
    error.statusCode = 422; throw error;
  }
  const requestedType = cashboxType == null ? null : String(cashboxType).trim().toUpperCase();
  if (userRole !== 'ADMINISTRADOR' && requestedType === 'MAYOR') {
    const error = new Error('Solo un administrador puede contabilizar movimientos en Caja Mayor.');
    error.statusCode = 403; throw error;
  }
  const method = paymentType || 'EFECTIVO';
  const wantedType = /^(EFECTIVO|CASH)$/i.test(method) ? 'CASH' : /QR/i.test(method) ? 'QR' : 'BANK';
  if (wantedType === 'BANK' && !bankId) {
    const error = new Error('Selecciona el banco asociado al pago para contabilizarlo en Caja.');
    error.statusCode = 422; throw error;
  }
  const accountWhere = wantedType === 'CASH' ? { type: 'CASH' } : wantedType === 'QR' ? { type: 'QR', ...(bankId ? { id_bank: bankId } : {}) } : { type: 'BANK', id_bank: bankId };
  const branchAccounts = wantedType === 'CASH' ? [] : await CjAccount.findAll({
    where: { ...accountWhere, is_active: true },
    include: [{ model: CjAccountAssignment, as: 'assignments', where: { is_active: true }, required: true,
      include: [{ model: CjCaja, as: 'caja', where: { id_sucursal: branchId }, attributes: ['id', 'cashbox_type'], required: true }] }],
    transaction,
  });
  if (wantedType !== 'CASH' && !branchAccounts.length) return null;
  if (userRole !== 'ADMINISTRADOR' && branchAccounts.length && !branchAccounts.some(account => account.assignments.some(assignment => assignment.caja?.cashbox_type === 'CHICA'))) {
    const error = new Error('Solo un administrador puede contabilizar movimientos en Caja Mayor.');
    error.statusCode = 403; throw error;
  }
  let selectedType = userRole === 'ADMINISTRADOR' ? requestedType : 'CHICA';
  if (!selectedType) {
    const openSessions = await CajaSmall.findAll({ where: { id_sucursal: branchId, session_state: 'OPEN' }, attributes: ['id', 'cashbox_type'], transaction, lock: transaction.LOCK.UPDATE });
    if (openSessions.length > 1) {
      const error = new Error('Hay Caja Chica y Caja Mayor abiertas. Indica cashbox_type para elegir el destino del pago.');
      error.statusCode = 422; throw error;
    }
    selectedType = openSessions[0]?.cashbox_type || 'CHICA';
  }
  const session = await CajaSmall.findOne({ where: { id_sucursal: branchId, cashbox_type: selectedType, session_state: 'OPEN' }, transaction, lock: transaction.LOCK.UPDATE });
  if (!session) {
    const error = new Error('Debe existir una sesión de Caja abierta en la sucursal para registrar el efecto financiero.');
    error.statusCode = 422; throw error;
  }
  const cajaId = session.id_caja;
  const matchedAccounts = await CjAccount.findAll({
    where: { ...accountWhere, is_active: true },
    include: [{ model: CjAccountAssignment, as: 'assignments', where: { id_caja: cajaId, is_active: true }, attributes: [] }],
    transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']],
  });
  if (!matchedAccounts.length) {
    const error = new Error(`No existe una cuenta ${wantedType === 'CASH' ? 'de efectivo' : 'bancaria/QR'} activa y asignada para este medio de pago.`);
    error.statusCode = 422; throw error;
  }
  if (matchedAccounts.length > 1) {
    const error = new Error('El medio de pago coincide con varias cuentas. Configura la selección explícita de cuenta antes de registrar la operación.');
    error.statusCode = 422; throw error;
  }
  const account = matchedAccounts[0];
  const sessionOpening = await CjSessionBalance.findOne({ where: { id_caja_small: session.id, id_cuenta: account.id }, transaction });
  if (!sessionOpening) {
    const error = new Error(`La cuenta ${account.name} no forma parte de la sesión de Caja ${selectedType}.`);
    error.statusCode = 422; throw error;
  }
  const key = (idempotencyKey || `${sourceType}-${sourceId}-${direction}`).slice(0, 160);
  const duplicate = await CjLedger.findOne({ where: { idempotency_key: key }, transaction });
  if (duplicate) {
    const samePosting = Number(duplicate.id_caja_small) === Number(session.id)
      && Number(duplicate.id_cuenta) === Number(account.id)
      && duplicate.direction === direction
      && duplicate.source_type === sourceType
      && String(duplicate.source_id) === String(sourceId);
    if (samePosting) return duplicate;
    const error = new Error('La clave de idempotencia ya fue utilizada por otro movimiento de Caja.');
    error.statusCode = 409; throw error;
  }
  if (direction === 'OUT') {
    const ledger = await CjLedger.findAll({ where: { id_caja_small: session.id, id_cuenta: account.id }, attributes: ['direction', 'amount'], transaction });
    const available = money(Number(sessionOpening.opening_amount || 0) + ledger.reduce((sum, row) => sum + (row.direction === 'IN' ? 1 : -1) * Number(row.amount), 0));
    if (value > available) {
      const error = new Error(`Saldo insuficiente en ${account.name}. Disponible: ${available.toFixed(2)} ${account.currency}.`);
      error.statusCode = 422; throw error;
    }
  }
  const movement = await DetailsCajaSmall.create({ id_caja_small: session.id, id_cuenta: account.id, id_user: userId,
    date: new Date(), type: direction === 'IN' ? 'INGRESO' : 'GASTO', type_payment: paymentType || 'EFECTIVO', id_bank: account.id_bank || null,
    monto: value, description, status: true, source_type: sourceType, source_id: String(sourceId), idempotency_key: key }, { transaction });
  return CjLedger.create({ id_caja_small: session.id, id_cuenta: account.id, id_detail_caja_small: movement.id, direction, amount: value,
    currency: account.currency, source_type: sourceType, source_id: String(sourceId), idempotency_key: key, id_user: userId, posted_at: new Date() }, { transaction });
}

module.exports = { postOperationalMovement };
