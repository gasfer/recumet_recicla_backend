
const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { openCajaSmall, closeCajaSmall, newDetailCajaSmall, getCajasSmall, getTotalDetailsCajasSmall, editMontoAperturaCajaSmall } = require('../controllers/caja_small.controller');
const { getValidateOpen, getValidateClose, getValidateDetail } = require('../middlewares/validators/caja_small');
const { printCaja } = require('../controllers/reports/caja.controller');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: CajaSmall
 *   description: Gestión de caja chica
 */

/**
 * @swagger
 * /caja_small:
 *   get:
 *     summary: Obtener cajas chicas
 *     tags: [CajaSmall]
 *     responses:
 *       200:
 *         description: Lista de cajas chicas
 */
router.get('/', [
    validarJWT,
], getCajasSmall);

/**
 * @swagger
 * /caja_small/print_caja/{id_caja_small}:
 *   get:
 *     summary: Imprimir reporte de caja chica
 *     tags: [CajaSmall]
 *     parameters:
 *       - in: path
 *         name: id_caja_small
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reporte generado
 */
router.get('/print_caja/:id_caja_small', [
    validarJWT,
], printCaja);

/**
 * @swagger
 * /caja_small/totales:
 *   get:
 *     summary: Obtener totales de caja chica
 *     tags: [CajaSmall]
 *     responses:
 *       200:
 *         description: Totales obtenidos
 */
router.get('/totales', [
    validarJWT,
], getTotalDetailsCajasSmall);

/**
 * @swagger
 * /caja_small/open:
 *   post:
 *     summary: Aperturar caja chica
 *     tags: [CajaSmall]
 *     responses:
 *       200:
 *         description: Caja chica aperturada
 */
router.post('/open', [
    validarJWT,
    toUpperCaseConvert,
    getValidateOpen
], openCajaSmall);

/**
 * @swagger
 * /caja_small/update_apertura:
 *   put:
 *     summary: Actualizar monto de apertura
 *     tags: [CajaSmall]
 *     responses:
 *       200:
 *         description: Monto actualizado
 */
router.put('/update_apertura', [
    validarJWT,
    getValidateOpen
], editMontoAperturaCajaSmall);

/**
 * @swagger
 * /caja_small/close:
 *   put:
 *     summary: Cerrar caja chica
 *     tags: [CajaSmall]
 *     responses:
 *       200:
 *         description: Caja chica cerrada
 */
router.put('/close', [
    validarJWT,
    toUpperCaseConvert,
    getValidateClose
], closeCajaSmall);

/**
 * @swagger
 * /caja_small/new-detail:
 *   post:
 *     summary: Agregar nuevo detalle a caja chica
 *     tags: [CajaSmall]
 *     responses:
 *       201:
 *         description: Detalle agregado
 */
router.post('/new-detail', [
    validarJWT,
    toUpperCaseConvert,
    getValidateDetail
], newDetailCajaSmall);



module.exports = router;