'use strict';

const service = require('../services/manual-kardex-movement.service');

const createManualKardexMovement = async (req, res) => {
  try {
    const { idempotency_key, id_product, id_sucursal, id_storage, direction, quantity, reason } = req.body || {};
    const result = await service.registerManualMovement({
      actorRole: req.userAuth?.role, actorUserId: req.userAuth?.id, idempotencyKey: idempotency_key,
      idProduct: id_product, idSucursal: id_sucursal, idStorage: id_storage,
      direction, quantity, reason,
    });
    return res.status(result.repeated ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, errors: [{ msg: error.message || 'No se pudo registrar el movimiento manual.' }] });
  }
};

module.exports = { createManualKardexMovement };
