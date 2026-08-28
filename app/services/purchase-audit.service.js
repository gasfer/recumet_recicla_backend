'use strict';

const { v4: uuidv4 } = require('uuid');
const { PurchaseAuditEvent } = require('../database/config');

const ENTITY_TYPES = Object.freeze({ PURCHASE: 'PURCHASE', DETAIL: 'PURCHASE_DETAIL', ACCOUNT: 'ACCOUNT_PAYABLE', PAYMENT: 'PAYMENT' });
const EVENT_TYPES = Object.freeze({
  PURCHASE_CREATED: 'PURCHASE_CREATED', PURCHASE_UPDATED: 'PURCHASE_UPDATED', PURCHASE_VOIDED: 'PURCHASE_VOIDED',
  DETAIL_ADDED: 'DETAIL_ADDED', DETAIL_UPDATED: 'DETAIL_UPDATED', DETAIL_REMOVED: 'DETAIL_REMOVED', PRICE_CHANGED: 'PRICE_CHANGED',
  ACCOUNT_CREATED: 'ACCOUNT_PAYABLE_CREATED', ACCOUNT_UPDATED: 'ACCOUNT_PAYABLE_UPDATED', ACCOUNT_VOIDED: 'ACCOUNT_PAYABLE_VOIDED',
  PAYMENT_CREATED: 'PAYMENT_CREATED', PAYMENT_VOIDED: 'PAYMENT_VOIDED',
});

const AUDITABLE_INPUT_FIELDS = ['date_voucher', 'type', 'type_payment', 'type_registry', 'registry_number', 'account_input', 'comments', 'sumas', 'discount', 'total', 'is_paid', 'id_scales', 'id_storage', 'id_provider', 'id_bank', 'id_sucursal', 'referral_sources', 'old_customer', 'with_pickup', 'number_transaction', 'status'];
const AUDITABLE_DETAIL_FIELDS = ['id', 'id_product', 'quantity', 'cost', 'total', 'expiration_date', 'profit_margin', 'status'];
const AUDITABLE_ACCOUNT_FIELDS = ['id', 'cod', 'id_input', 'id_provider', 'description', 'date_credit', 'total', 'monto_abonado', 'monto_restante', 'status_account', 'status'];
const AUDITABLE_PAYMENT_FIELDS = ['id', 'id_account_payable', 'date_abono', 'monto_abono', 'total_abonado', 'restante_credito', 'type_payment', 'comments', 'account_output', 'id_bank', 'from_pay_multiple', 'account_origin', 'id_bank_origin', 'number_transaction', 'status'];

const plain = (value) => value && typeof value.get === 'function' ? value.get({ plain: true }) : (value || null);
const pick = (value, fields) => {
  const source = plain(value) || {};
  return fields.reduce((result, field) => {
    if (source[field] !== undefined) result[field] = source[field];
    return result;
  }, {});
};
const normalize = (value) => value === null || value === undefined ? null : (typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value)) ? Number(value) : value);
const diff = (before, after) => Object.keys({ ...(before || {}), ...(after || {}) }).reduce((changes, field) => {
  const oldValue = normalize(before?.[field]);
  const newValue = normalize(after?.[field]);
  if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) changes.push({ field, before: oldValue, after: newValue });
  return changes;
}, []);

const detailKey = (detail) => String(`product:${detail.id_product}`);
const diffDetails = (beforeDetails = [], afterDetails = []) => {
  const beforeMap = new Map(beforeDetails.map((item) => [detailKey(plain(item)), pick(item, AUDITABLE_DETAIL_FIELDS)]));
  const afterMap = new Map(afterDetails.map((item) => [detailKey(plain(item)), pick(item, AUDITABLE_DETAIL_FIELDS)]));
  const result = [];
  for (const [key, after] of afterMap) {
    const before = beforeMap.get(key);
    if (!before) result.push({ kind: 'ADDED', before: null, after, changes: Object.keys(after).map((field) => ({ field, before: null, after: after[field] })) });
    else {
      const changes = diff(before, after);
      if (changes.length) result.push({ kind: changes.some((item) => item.field === 'cost') ? 'PRICE_CHANGED' : 'UPDATED', before, after, changes });
    }
  }
  for (const [key, before] of beforeMap) if (!afterMap.has(key)) result.push({ kind: 'REMOVED', before, after: null, changes: [{ field: 'status', before: before.status, after: 'INACTIVE' }] });
  return result;
};

const createEvent = async ({ transaction, correlationId = uuidv4(), idempotencyKey, input, actorUserId, authorizerUserId, entityType, entityId, eventType, reason, beforeData, afterData, changedFields, detailId, accountId, paymentId, historicalIncomplete = false }) => {
  if (!transaction) throw new Error('La trazabilidad debe guardarse dentro de una transacción');
  if (!input?.id || !actorUserId) throw new Error('La compra y el usuario autenticado son obligatorios para la trazabilidad');
  if (idempotencyKey) {
    const existing = await PurchaseAuditEvent.findOne({ where: { idempotency_key: idempotencyKey }, transaction });
    if (existing) return existing;
  }
  return PurchaseAuditEvent.create({
    id_input: input.id, id_sucursal: input.id_sucursal,
    id_detail_input: detailId || null, id_account_payable: accountId || null, id_abono_account_payable: paymentId || null,
    id_actor_user: actorUserId, id_authorizer_user: authorizerUserId || null, entity_type: entityType,
    entity_id: entityId || input.id, event_type: eventType, reason: reason || null,
    before_data: beforeData || null, after_data: afterData || null, changed_fields: changedFields || null,
    correlation_id: correlationId, idempotency_key: idempotencyKey || null, historical_incomplete: historicalIncomplete,
  }, { transaction });
};

module.exports = {
  ENTITY_TYPES, EVENT_TYPES, AUDITABLE_INPUT_FIELDS, AUDITABLE_DETAIL_FIELDS, AUDITABLE_ACCOUNT_FIELDS, AUDITABLE_PAYMENT_FIELDS,
  pick, diff, diffDetails, createEvent,
  findEventByIdempotencyKey: (idempotencyKey, transaction) => idempotencyKey ? PurchaseAuditEvent.findOne({ where: { idempotency_key: idempotencyKey }, transaction }) : null,
  createCorrelationId: uuidv4,
};
