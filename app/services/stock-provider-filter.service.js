'use strict';
const { Op, literal } = require('sequelize');
function stockProviderCondition(query = {}) {
  const conditions = [];
  for (const [key, column] of [['id_provider', 'i.id_provider'], ['id_type_provider', 'pr.id_type_provider']]) {
    if (!query[key]) continue;
    if (!/^[1-9]\d*$/.test(String(query[key]))) { const error = new Error('Seleccione un proveedor o tipo válido.'); error.statusCode = 400; throw error; }
    conditions.push(column + ' = ' + Number(query[key]));
  }
  if (!conditions.length) return {};
  for (const [value, column] of [
    [query.id_sucursales || query.id_sucursal, 'i.id_sucursal'],
    [query.id_storages || query.id_storage, 'i.id_storage'],
    [query.id_products || query.id_product, 'd.id_product'],
    [query.id_categories || query.category_ids, 'pr.id_category'],
  ]) {
    if (!value) continue;
    const ids = (Array.isArray(value) ? value : String(value).split(',')).map(id => String(id).trim());
    if (ids.some(id => !/^[1-9]\d*$/.test(id))) {
      const error = new Error('Seleccione sucursales o productos válidos.'); error.statusCode = 400; throw error;
    }
    conditions.push(`${column} IN (${ids.map(Number).join(',')})`);
  }

  // Correlate the matching purchase to the current kardex row. The former
  // tuple-IN subquery materialized every matching product/location before
  // either of the stock summary queries could aggregate its movements.
  return {
    [Op.and]: literal(`EXISTS (
      SELECT 1
      FROM inputs i
      INNER JOIN details_inputs d ON d.id_input = i.id
      INNER JOIN providers pr ON pr.id = i.id_provider
      WHERE d.id_product = "ViewKardex".id_product
        AND i.id_sucursal = "ViewKardex".id_sucursal
        AND i.status = 'ACTIVE'
        AND (d.status = 'ACTIVE' OR d.status IS NULL)
        AND ${conditions.join(' AND ')}
    )`)
  };
}
module.exports = { stockProviderCondition };
