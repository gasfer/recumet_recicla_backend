'use strict';
const { Op, literal } = require('sequelize');

function ids(value) {
  return [...new Set(String(value ?? '').split(',').map(v => v.trim()).filter(v => /^\d+$/.test(v)).map(Number).filter(v => Number.isSafeInteger(v) && v > 0))];
}

// Match the source material, as the previous single-product filter did.
function classifiedMaterialFilter(params = {}) {
  const products = ids(params.product_ids || params.id_product);
  const categories = ids(params.category_ids);
  return [
    ...(products.length ? [{ id_product: { [Op.in]: products } }] : []),
    ...(categories.length ? [{ id_product: { [Op.in]: literal(`(SELECT id FROM products WHERE id_category IN (${categories.join(',')}))`) } }] : []),
  ];
}

module.exports = { classifiedMaterialFilter };
