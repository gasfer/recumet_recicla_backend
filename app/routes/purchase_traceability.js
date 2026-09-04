const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const { authorizeModulePermission } = require('../middlewares/authorize-module-permission');
const { getPurchaseTraceability, getProviderTraceability, getPurchaseAuthorizers } = require('../controllers/purchase_traceability.controller');

const router = Router();
router.get('/authorizers', [validarJWT, authorizeModulePermission('COMPRAS', 'update')], getPurchaseAuthorizers);
router.get('/purchase/:id_input', [validarJWT, authorizeModulePermission('COMPRAS', 'view')], getPurchaseTraceability);
router.get('/provider/:id_provider', [validarJWT, authorizeModulePermission('COMPRAS', 'view')], getProviderTraceability);

module.exports = router;
