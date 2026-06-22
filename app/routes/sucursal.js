const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getSucursalPaginate, newSucursal, updateSucursal, activeInactiveSucursal } = require('../controllers/sucursal.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/sucursal');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Sucursales
 *   description: Gestión de sucursales
 */

/**
 * @swagger
 * /sucursal:
 *   get:
 *     summary: Obtener sucursales paginadas
 *     tags: [Sucursales]
 *     responses:
 *       200:
 *         description: Lista de sucursales
 */
router.get('/', [
    validarJWT,
], getSucursalPaginate);

/**
 * @swagger
 * /sucursal:
 *   post:
 *     summary: Crear nueva sucursal
 *     tags: [Sucursales]
 *     responses:
 *       201:
 *         description: Sucursal creada
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newSucursal);

/**
 * @swagger
 * /sucursal/{id}:
 *   put:
 *     summary: Actualizar sucursal
 *     tags: [Sucursales]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sucursal actualizada
 */
router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
], updateSucursal);

/**
 * @swagger
 * /sucursal/destroyAndActive/{id}:
 *   put:
 *     summary: Activar/Desactivar sucursal
 *     tags: [Sucursales]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado de la sucursal actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
], activeInactiveSucursal);


module.exports = router;