'use strict';

const { validateClassifiedCommand } = require('../services/classified-command-validation.service');

const validateClassifiedCommandRequest = (req, res, next) => {
  const errors = validateClassifiedCommand({
    classifiedData: req.body?.classified_data,
    classifiedDetails: req.body?.classified_details,
  });
  if (errors.length) return res.status(422).json({ ok: false, errors });
  return next();
};

module.exports = { validateClassifiedCommandRequest };
