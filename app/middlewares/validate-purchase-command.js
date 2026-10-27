'use strict';

const { validatePurchaseCommand } = require('../services/purchase-command-validation.service');

const validatePurchaseCommandRequest = (req, res, next) => {
  const errors = validatePurchaseCommand({
    inputData: req.body?.input_data,
    inputDetails: req.body?.input_details,
    decimalPlaces: req.decimalPolicy?.places,
    allowMissingReferralSource: req.method === 'PUT',
  });
  if (errors.length) return res.status(422).json({ ok: false, errors });
  return next();
};

module.exports = { validatePurchaseCommandRequest };
