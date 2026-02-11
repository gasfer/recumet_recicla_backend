const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getBankPaginate, newBank, updateBank, activeInactiveBank } = require('../controllers/bank.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/bank');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Banks
 *   description: Gestión de bancos
 */

/**
 * @swagger
 * /bank:
 *   get:
 *     summary: Obtener lista de bancos
 *     tags: [Banks]
 *     responses:
 *       200:
 *         description: Lista de bancos
 */
router.get('/', [
    validarJWT,
], getBankPaginate);

/**
 * @swagger
 * /bank:
 *   post:
 *     summary: Crear nuevo banco
 *     tags: [Banks]
 *     responses:
 *       201:
 *         description: Banco creado
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newBank);

/**
 * @swagger
 * /bank/{id}:
 *   put:
 *     summary: Actualizar banco
 *     tags: [Banks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Banco actualizado
 */
router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
], updateBank);

/**
 * @swagger
 * /bank/destroyAndActive/{id}:
 *   put:
 *     summary: Activar/Desactivar banco
 *     tags: [Banks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado del banco actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
], activeInactiveBank);


module.exports = router;