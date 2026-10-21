const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { readHardwareWeight, listTruckWeighings, createFirstTruckWeight, updateTruckWeighing, completeTruckWeight, deleteTruckWeighing, getScalePaginate, newScale, updateScale, activeInactiveScale } = require('../controllers/scalas.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/scala');

const router = Router();

/**
 * @swagger
 * /scale/read-weight:
 *   get:
 *     summary: Leer el peso actual de la balanza camionera configurada en el servidor
 *     tags: [Scales]
 *     responses:
 *       200:
 *         description: Peso actual en kilogramos
 *       503:
 *         description: Balanza sin configurar o sin conexión
 */
router.get('/read-weight', [validarJWT], readHardwareWeight);
router.get('/truck-weighings', [validarJWT], listTruckWeighings);
router.post('/truck-weighings', [validarJWT], createFirstTruckWeight);
router.put('/truck-weighings/:id', [validarJWT], updateTruckWeighing);
router.put('/truck-weighings/:id/second-weight', [validarJWT], completeTruckWeight);
router.delete('/truck-weighings/:id', [validarJWT], deleteTruckWeighing);


/**
 * @swagger
 * tags:
 *   name: Scales
 *   description: Gestión de balanzas
 */

/**
 * @swagger
 * /scale:
 *   get:
 *     summary: Obtener balanzas paginadas
 *     tags: [Scales]
 *     responses:
 *       200:
 *         description: Lista de balanzas
 */
router.get('/', [
    validarJWT,
], getScalePaginate);

/**
 * @swagger
 * /scale:
 *   post:
 *     summary: Crear nueva balanza
 *     tags: [Scales]
 *     responses:
 *       201:
 *         description: Balanza creada
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newScale);

/**
 * @swagger
 * /scale/{id}:
 *   put:
 *     summary: Actualizar balanza
 *     tags: [Scales]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Balanza actualizada
 */
router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
], updateScale);

/**
 * @swagger
 * /scale/destroyAndActive/{id}:
 *   put:
 *     summary: Activar/Desactivar balanza
 *     tags: [Scales]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado de la balanza actualizado
 */
router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
], activeInactiveScale);


module.exports = router;
