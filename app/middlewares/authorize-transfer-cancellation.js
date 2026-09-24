'use strict';

const authorizeTransferCancellation = (req, res, next) => {
  if (req.userAuth?.role === 'ADMINISTRADOR') return next();
  return res.status(403).json({ ok: false, errors: [{ msg: 'Sólo un administrador puede dar de baja traslados o recepciones.' }] });
};

module.exports = { authorizeTransferCancellation };
