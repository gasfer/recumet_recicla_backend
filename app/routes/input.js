const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getInputsPaginate, newInput, anularInput, updateInput, getInputFindOne } = require('../controllers/input.controller');
const { getValidateCreate, validateIdInput, getValidateUpdate } = require('../middlewares/validators/input');
const { generatePdfReports, generateExcelReports, generatePdfDetailsReports, generateExcelDetailsReports, printInputVoucher, generatePdfDetailsCPPReports } = require('../controllers/reports/input.controller');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Inputs
 *   description: Gestión de entradas de material
 */

/**
 * @swagger
 * /input:
 *   get:
 *     summary: Obtener entradas paginadas
 *     tags: [Inputs]
 *     responses:
 *       200:
 *         description: Lista de entradas
 */
router.get('/', [
    validarJWT,
], getInputsPaginate);

/**
 * @swagger
 * /input/find/{id_input}:
 *   get:
 *     summary: Obtener entrada por ID
 *     tags: [Inputs]
 *     parameters:
 *       - in: path
 *         name: id_input
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detalle de entrada
 */
router.get('/find/:id_input', [
    validarJWT,
], getInputFindOne);

/**
 * @swagger
 * /input:
 *   post:
 *     summary: Registrar nueva entrada
 *     tags: [Inputs]
 *     responses:
 *       201:
 *         description: Entrada registrada
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newInput);

/**
 * @swagger
 * /input/{id_input}:
 *   put:
 *     summary: Actualizar entrada
 *     tags: [Inputs]
 *     parameters:
 *       - in: path
 *         name: id_input
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Entrada actualizada
 */
router.put('/:id_input', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate,
], updateInput);

/**
 * @swagger
 * /input/anular/{id_input}:
 *   delete:
 *     summary: Anular entrada
 *     tags: [Inputs]
 *     parameters:
 *       - in: path
 *         name: id_input
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Entrada anulada
 */
router.delete('/anular/:id_input', [
    validarJWT,
    validateIdInput
], anularInput)

//** REPORTS */
/**
 * @swagger
 * /input/pdf/voucher/{id_input}:
 *   get:
 *     summary: Imprimir voucher de entrada
 *     tags: [Inputs]
 *     parameters:
 *       - in: path
 *         name: id_input
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Voucher PDF generado
 */
router.get('/pdf/voucher/:id_input', [
    validarJWT,
    validateIdInput,
], printInputVoucher);

/**
 * @swagger
 * /input/pdf:
 *   get:
 *     summary: Generar reporte PDF de entradas
 *     tags: [Inputs]
 *     responses:
 *       200:
 *         description: Reporte PDF generado
 */
router.get('/pdf', [
    validarJWT,
], generatePdfReports);

/**
 * @swagger
 * /input/pdf/details:
 *   get:
 *     summary: Generar reporte PDF detallado de entradas
 *     tags: [Inputs]
 *     responses:
 *       200:
 *         description: Reporte PDF detallado generado
 */
router.get('/pdf/details', [
    validarJWT,
], generatePdfDetailsReports);

/**
 * @swagger
 * /input/pdf/details/cpp:
 *   get:
 *     summary: Generar reporte PDF detallado CPP de entradas
 *     tags: [Inputs]
 *     responses:
 *       200:
 *         description: Reporte PDF detallado CPP generado
 */
router.get('/pdf/details/cpp', [
    validarJWT,
], generatePdfDetailsCPPReports);

/**
 * @swagger
 * /input/excel:
 *   get:
 *     summary: Generar reporte Excel de entradas
 *     tags: [Inputs]
 *     responses:
 *       200:
 *         description: Reporte Excel generado
 */
router.get('/excel', [
    validarJWT,
], generateExcelReports);

/**
 * @swagger
 * /input/excel/details:
 *   get:
 *     summary: Generar reporte Excel detallado de entradas
 *     tags: [Inputs]
 *     responses:
 *       200:
 *         description: Reporte Excel detallado generado
 */
router.get('/excel/details', [
    validarJWT,
], generateExcelDetailsReports);


module.exports = router;