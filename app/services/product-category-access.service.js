const { Op } = require('sequelize');
const { Product } = require('../database/config');
const {
  PRODUCT_CATEGORY_TYPES,
  PRODUCT_ACCESS_MODULES,
} = require('../constants/product-category-access');
const { readPermissionField, isPermissionActionGranted } = require('../helpers/permission-fields');

class InvalidProductAccessContextError extends Error {}

const normalizeContext = (context) => String(context || '').trim().toUpperCase();

const isSupportedContext = (context) => PRODUCT_ACCESS_MODULES.includes(normalizeContext(context));

const normalizeCategoryTypes = (types) => {
  if (!Array.isArray(types)) return [];
  return [...new Set(types.map(type => String(type).trim().toUpperCase()))]
    .filter(type => PRODUCT_CATEGORY_TYPES.includes(type));
};

const getModulePermission = (user, context) => {
  const normalizedContext = normalizeContext(context);
  if (!isSupportedContext(normalizedContext)) {
    throw new InvalidProductAccessContextError(`Contexto de productos no válido: ${context}`);
  }
  const permissions = Array.isArray(user?.assign_permission)
    ? user.assign_permission
    : [];
  return permissions.find(item => (
    readPermissionField(item, 'module') === normalizedContext
    && readPermissionField(item, 'status') !== false
  ));
};

const getAllowedCategoryTypes = (user, context, requiredActions = ['create', 'update']) => {
  if (user?.role === 'ADMINISTRADOR') {
    if (!isSupportedContext(context)) {
      throw new InvalidProductAccessContextError(`Contexto de productos no válido: ${context}`);
    }
    return [...PRODUCT_CATEGORY_TYPES];
  }

  const permission = getModulePermission(user, context);
  if (!permission || !requiredActions.some(action => isPermissionActionGranted(permission, action))) return [];
  return normalizeCategoryTypes(readPermissionField(permission, 'allowed_category_types'));
};

const intersectAllowedCategoryTypes = (user, context, requestedTypes = []) => {
  const allowedTypes = getAllowedCategoryTypes(user, context);
  const normalizedRequested = normalizeCategoryTypes(requestedTypes);
  if (normalizedRequested.length === 0) return allowedTypes;
  return normalizedRequested.filter(type => allowedTypes.includes(type));
};

const findUnauthorizedProducts = async ({
  user,
  context,
  productIds,
  action,
  ProductModel = Product,
}) => {
  const ids = [...new Set((productIds || []).map(Number).filter(Number.isInteger))];
  if (ids.length === 0) return [];

  const allowedTypes = getAllowedCategoryTypes(user, context, [action]);
  const products = await ProductModel.findAll({
    where: {
      id: { [Op.in]: ids },
      status: true,
    },
    attributes: ['id'],
    include: [{
      association: 'category',
      required: true,
      attributes: ['type'],
      where: { status: true },
    }],
  });

  const productsById = new Map(products.map(product => [Number(product.id), product]));
  return ids.filter(id => {
    const product = productsById.get(id);
    return !product || !allowedTypes.includes(product.category?.type);
  });
};

module.exports = {
  InvalidProductAccessContextError,
  normalizeContext,
  isSupportedContext,
  normalizeCategoryTypes,
  getModulePermission,
  getAllowedCategoryTypes,
  intersectAllowedCategoryTypes,
  findUnauthorizedProducts,
};
