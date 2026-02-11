const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getStoragesPaginate, newStorage, updateStorage, activeInactiveStorage } = require('../controllers/storage.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/storage');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Storages
 *   description: Gestión de almacenes
 */

/**
 * @swagger
 * /storage:
 *   get:
 *     summary: Obtener almacenes paginados
 *     tags: [Storages]
 *     responses:
 *       200:
 *         description: Lista de almacenes
 */
router.get('/', [
    validarJWT,
], getStoragesPaginate);

/**
 * @swagger
 * /storage:
 *   post:
 *     summary: Crear nuevo almacén
 *     tags: [Storages]
 *     responses:
 *       201:
 *         description: Almacén creado
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newStorage);

/**
 * @swagger
 * /storage/{id}:
 *   put:
 *     summary: Actualizar almacén
 *     tags: [Storages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Almacén actualizado
 */
router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
], updateStorage);

/**
 * @swagger
 * /storage/destroyAndActive/{id}:
 *   put:
 *     summary: Activar/Desactivar almacén
 *     tags: [Storages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado del almacén actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
], activeInactiveStorage);


module.exports = router;