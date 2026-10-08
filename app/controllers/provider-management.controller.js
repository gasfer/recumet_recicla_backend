'use strict';
const service = require('../services/provider-management.service');

function handle(operation, key) {
  return async (req, res) => {
    try {
      return res.json({ ok: true, [key]: await operation(req) });
    } catch (error) {
      if (!error.statusCode) console.error('Provider management query failed:', error.message);
      return res.status(error.statusCode || 500).json({ ok: false, errors: [{ msg: error.statusCode ? error.message : 'No se pudo consultar la gestión de proveedores' }] });
    }
  };
}

module.exports = {
  search: handle(req => service.search(req.query, req.userAuth), 'providers'),
  catalogs: handle(req => service.catalogs(req.userAuth), 'catalogs'),
};
