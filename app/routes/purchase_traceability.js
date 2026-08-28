const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const { authorizeModulePermission } = require('../middlewares/authorize-module-permission');
const { getPurchaseTraceability } = require('../controllers/purchase_traceability.controller');

const router = Router();
router.get('/purchase/:id_input', [validarJWT, authorizeModulePermission('COMPRAS', 'view')], getPurchaseTraceability);

module.exports = router;
