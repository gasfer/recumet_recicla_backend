const { findUnauthorizedProducts } = require('../services/product-category-access.service');

const authorizeProductCategoryAccess = ({ context, action, extractProductIds }) => async (req, res, next) => {
  try {
    const unauthorizedProductIds = await findUnauthorizedProducts({
      user: req.userAuth,
      context,
      action,
      productIds: extractProductIds(req.body),
    });

    if (unauthorizedProductIds.length > 0) {
      return res.status(403).json({
        ok: false,
        errors: [{
          msg: 'Uno o más productos no están permitidos para este usuario en el módulo actual.',
          product_ids: unauthorizedProductIds,
        }],
      });
    }

    next();
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      ok: false,
      errors: [{ msg: 'No se pudo validar el acceso a los productos.' }],
    });
  }
};

const detailProductIds = detailField => body =>
  (body?.[detailField] || []).map(detail => detail.id_product);

const classifiedProductIds = body => [
  body?.classified_data?.id_product,
  ...(body?.classified_details || []).map(detail => detail.id_product),
];

module.exports = {
  authorizeProductCategoryAccess,
  detailProductIds,
  classifiedProductIds,
};
