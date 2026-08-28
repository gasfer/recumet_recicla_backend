const {
  isSupportedContext,
  normalizeContext,
} = require('../services/product-category-access.service');

const bindProductAccessContext = (context) => {
  const normalizedContext = normalizeContext(context);
  if (!isSupportedContext(normalizedContext)) {
    throw new Error(`No se puede registrar un contexto de productos no soportado: ${context}`);
  }

  const middleware = (req, res, next) => {
    if (Object.prototype.hasOwnProperty.call(req.query, 'product_context')) {
      return res.status(400).json({
        ok: false,
        errors: [{
          msg: 'El contexto del catálogo operativo es definido por el servidor.',
        }],
      });
    }

    req.productAccessContext = normalizedContext;
    return next();
  };

  middleware.productAccessContext = normalizedContext;
  return middleware;
};

module.exports = {
  bindProductAccessContext,
};
