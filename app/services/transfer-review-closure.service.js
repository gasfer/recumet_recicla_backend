'use strict';

const { TransferReviewNote } = require('../database/config');
const integrity = require('./stock-kardex-integrity.service');
const { exactAdd, exactSubtract, exactCompare } = require('../helpers/number-formatter');

const closureError = (message) => Object.assign(new Error(message), { statusCode: 409, code: 'REVIEW_CLOSURE_REJECTED' });

const assertReviewClosure = async ({ noteId, transaction }) => {
  const note = await TransferReviewNote.findByPk(noteId, {
    include: [{ association: 'details', include: [
      { association: 'inventoryHolds' },
      { association: 'resolutionActions', include: [{ association: 'movementLinks', include: [{ association: 'kardexMovement' }] }] },
    ] }], transaction, lock: transaction ? { level: transaction.LOCK.UPDATE, of: TransferReviewNote } : undefined,
  });
  if (!note) throw closureError('No se encontró el expediente para comprobar su cierre.');
  const locations = [{ productId: note.id_product, sucursalId: note.id_sucursal, storageId: note.id_storage }];
  for (const detail of note.details) {
    const pending = exactSubtract(detail.quantity_difference, detail.quantity_resolved || 0);
    const retained = (detail.inventoryHolds || []).filter(({ disposition }) => disposition !== 'LIBERADO_POR_AJUSTE').reduce((sum, hold) => exactAdd(sum, hold.quantity), '0');
    if (exactCompare(pending, 0) !== 0 || exactCompare(retained, 0) !== 0) throw closureError('No se puede cerrar: quedan cantidades o retenciones pendientes.');
    locations.push({ productId: detail.id_product, sucursalId: note.id_sucursal, storageId: note.id_storage });
    const actions = (detail.resolutionActions || []).filter(({ management_status }) => !['REVERTIDA', 'ELIMINADA'].includes(management_status));
    const resolved = actions.reduce((sum, action) => exactAdd(sum, action.quantity), '0');
    if (exactCompare(resolved, detail.quantity_resolved || 0) !== 0) throw closureError('Las acciones no representan toda la cantidad resuelta.');
    for (const action of actions) {
      if (action.operation_status === 'PENDING_RECEPTION') throw closureError('La operación correctiva todavía espera recepción.');
      for (const { kardexMovement: movement } of action.movementLinks || []) {
        if (!movement || movement.status === false) throw closureError('Un efecto de conciliación no está activo.');
        locations.push({ productId: movement.id_product, sucursalId: movement.id_sucursal, storageId: movement.id_storage });
      }
    }
  }
  return integrity.verifyLocationsIntegrity({ locations, transaction });
};

module.exports = { assertReviewClosure };
