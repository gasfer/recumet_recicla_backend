const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const { getAllHistory } = require('../controllers/history.controller');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: History
 *   description: Historial de acciones
 */

/**
 * @swagger
 * /history:
 *   get:
 *     summary: Obtener historial completo
 *     tags: [History]
 *     responses:
 *       200:
 *         description: Lista de historial
 */
router.get('/', [
    validarJWT,
], getAllHistory);


module.exports = router;