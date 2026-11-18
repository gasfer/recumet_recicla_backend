'use strict';

const authorizeAdmin = (req, res, next) => {
  if (req.userAuth?.role === 'ADMINISTRADOR') return next();
  return res.status(403).json({ ok: false, errors: [{ msg: 'Sólo un administrador puede registrar movimientos manuales de Kardex.' }] });
};

module.exports = { authorizeAdmin };
