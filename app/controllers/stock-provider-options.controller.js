'use strict';
const { Provider } = require('../database/config');
async function getStockProviderOptions(req, res) {
  const typeId = String(req.query.id_type_provider || '');
  if (typeId && !/^[1-9]\d*$/.test(typeId)) return res.status(400).json({ ok: false, errors: [{ msg: 'Seleccione un tipo de proveedor válido.' }] });
  try {
    const providers = await Provider.findAll({
      attributes: ['id', 'full_names', 'number_document'],
      where: { status: true, ...(typeId ? { id_type_provider: Number(typeId) } : {}) },
      include: [{ association: 'type', attributes: ['id', 'name', 'code'] }],
      order: [['full_names', 'ASC']],
    });
    return res.json({ ok: true, providers });
  } catch (error) {
    console.error('Error cargando proveedores del filtro de stock:', error);
    return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudieron cargar los proveedores.' }] });
  }
}
module.exports = { getStockProviderOptions };
