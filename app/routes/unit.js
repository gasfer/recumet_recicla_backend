const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getUnitPaginate, newUnit, updateUnit, activeInactiveUnit } = require('../controllers/unit.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/unit');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Units
 *   description: Gestión de unidades de medida
 */

/**
 * @swagger
 * /unit:
 *   get:
 *     summary: Obtener unidades paginadas
 *     tags: [Units]
 *     responses:
 *       200:
 *         description: Lista de unidades
 */
router.get('/', [
    validarJWT,
], getUnitPaginate);

/**
 * @swagger
 * /unit:
 *   post:
 *     summary: Crear nueva unidad
 *     tags: [Units]
 *     responses:
 *       201:
 *         description: Unidad creada
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newUnit);

/**
 * @swagger
 * /unit/{id}:
 *   put:
 *     summary: Actualizar unidad
 *     tags: [Units]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Unidad actualizada
 */
router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
], updateUnit);

/**
 * @swagger
 * /unit/destroyAndActive/{id}:
 *   put:
 *     summary: Activar/Desactivar unidad
 *     tags: [Units]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado de la unidad actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
], activeInactiveUnit);


module.exports = router;