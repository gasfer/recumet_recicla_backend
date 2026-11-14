'use strict';

const { validateOutputCommand } = require('../services/output-command-validation.service');

const validateOutputCommandRequest = (req, res, next) => {
  const errors = validateOutputCommand({
    outputData: req.body?.output_data,
    outputDetails: req.body?.output_details,
    outputBig: req.body?.output_big,
  });
  if (errors.length) return res.status(422).json({ ok: false, errors });
  if (typeof req.body.output_data.pay_to_credit === 'string') {
    req.body.output_data.pay_to_credit = req.body.output_data.pay_to_credit.toLowerCase() === 'true';
  }
  return next();
};

module.exports = { validateOutputCommandRequest };
