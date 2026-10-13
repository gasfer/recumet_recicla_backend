'use strict';
const { Provider, TypesProvider } = require('../database/config');
const { Op } = require('sequelize');
const { assignedBranches } = require('../services/provider-management.service');
async function purchaseProviderCatalog(req, res) {
  const id = String(req.query.id_type_provider || '');
  if (id && !/^[1-9]\d*$/.test(id)) return res.status(400).json({ ok: false, errors: [{ msg: 'Tipo de proveedor inválido.' }] });
  const branch = String(req.query.id_sucursal || '');
  if (!/^[1-9]\d*$/.test(branch)) return res.status(400).json({ ok: false, errors: [{ msg: 'Seleccione una sucursal válida.' }] });
  const allowedBranches = assignedBranches(req.userAuth);
  if (allowedBranches && !allowedBranches.includes(Number(branch))) return res.status(403).json({ ok: false, errors: [{ msg: 'No tiene acceso a esa sucursal.' }] });
  try {
    const query = String(req.query.query || '').trim().slice(0, 150);
    const where = {
      id_sucursal: Number(branch),
      ...(id ? { id_type_provider: Number(id) } : {}),
      ...(query ? { [Op.or]: [
        { full_names: { [Op.iLike]: '%' + query + '%' } },
        { number_document: { [Op.iLike]: '%' + query + '%' } },
      ] } : {}),
    };
    const [providers, types] = await Promise.all([
      Provider.findAll({ attributes: ['id', 'full_names', 'number_document'], where, limit: 100, order: [['full_names', 'ASC'], ['id', 'ASC']], raw: true }),
      TypesProvider.findAll({ attributes: ['id', 'name', 'code'], order: [['id', 'ASC']], raw: true }),
    ]);
    res.json({ ok: true, providers, types });
  } catch (error) { console.error(error); res.status(500).json({ ok: false, errors: [{ msg: 'No se pudieron cargar los filtros de proveedores.' }] }); }
}
module.exports = { purchaseProviderCatalog };
