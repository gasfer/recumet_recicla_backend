'use strict';

const { Input, Output, Classified, Transfers } = require('../database/config');
const { Op } = require('sequelize');

const REGISTRY_MODELS = Object.freeze({
  input: { model: Input, numberField: 'registry_number', branchField: 'id_sucursal', hasType: true },
  output: { model: Output, numberField: 'number_registry', branchField: 'id_sucursal', hasType: true },
  classified: { model: Classified, numberField: 'number_registry', branchField: 'id_sucursal', hasType: true },
  transfer: { model: Transfers, numberField: 'registry_number', branchField: 'id_sucursal_send', hasType: true },
});

const checkRegistryNumber = async (req, res) => {
  const operation = String(req.query.operation || '').trim().toLowerCase();
  const config = REGISTRY_MODELS[operation];
  const number = String(req.query.number || '').trim().toUpperCase();
  const branchId = Number(req.query.branch_id);

  if (!config || !number || !Number.isInteger(branchId) || branchId < 1) {
    return res.status(400).json({ ok: false, errors: [{ msg: 'Datos incompletos para validar el número de registro.' }] });
  }

  const where = {
    [config.numberField]: number,
    [config.branchField]: branchId,
  };
  const typeRegistry = String(req.query.type_registry || '').trim().toUpperCase();
  if (config.hasType) {
    if (!typeRegistry) {
      return res.status(400).json({ ok: false, errors: [{ msg: 'El tipo de registro es obligatorio para validar el número.' }] });
    }
    where.type_registry = typeRegistry;
  }

  const excludeId = Number(req.query.exclude_id);
  if (Number.isInteger(excludeId) && excludeId > 0) {
    where.id = { [Op.ne]: excludeId };
  }

  try {
    const existing = await config.model.findOne({ where, attributes: ['id'] });
    return res.status(200).json({ ok: true, exists: Boolean(existing) });
  } catch (error) {
    console.error('No fue posible validar el número de registro:', error.message);
    return res.status(500).json({ ok: false, errors: [{ msg: 'No fue posible validar el número de registro.' }] });
  }
};

module.exports = { checkRegistryNumber };
