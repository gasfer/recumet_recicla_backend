const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getOutputsPaginate, newOutput, anularOutput, updateOutput, getOutputFindOne } = require('../controllers/output.controller');
const { getValidateCreate, validateIdOutput, getValidateUpdate } = require('../middlewares/validators/output');
const { printOutputVoucher, generatePdfReports, generateExcelReports, generatePdfDetailsReports, generateExcelDetailsReports } = require('../controllers/reports/output.controller');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Outputs
 *   description: Gestión de salidas de material
 */

/**
 * @swagger
 * /output:
 *   get:
 *     summary: Obtener salidas paginadas
 *     tags: [Outputs]
 *     responses:
 *       200:
 *         description: Lista de salidas
 */
router.get('/', [
    validarJWT,
], getOutputsPaginate);

/**
 * @swagger
 * /output/find/{id_output}:
 *   get:
 *     summary: Obtener salida por ID
 *     tags: [Outputs]
 *     parameters:
 *       - in: path
 *         name: id_output
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detalle de salida
 */
router.get('/find/:id_output', [
    validarJWT,
], getOutputFindOne);

/**
 * @swagger
 * /output:
 *   post:
 *     summary: Registrar nueva salida
 *     tags: [Outputs]
 *     responses:
 *       201:
 *         description: Salida registrada
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newOutput);

/**
 * @swagger
 * /output/{id_output}:
 *   put:
 *     summary: Actualizar salida
 *     tags: [Outputs]
 *     parameters:
 *       - in: path
 *         name: id_output
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Salida actualizada
 */
router.put('/:id_output', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate,
], updateOutput);

/**
 * @swagger
 * /output/anular/{id_output}:
 *   delete:
 *     summary: Anular salida
 *     tags: [Outputs]
 *     parameters:
 *       - in: path
 *         name: id_output
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Salida anulada
 */
router.delete('/anular/:id_output', [
    validarJWT,
    validateIdOutput
], anularOutput)

//** REPORTS */
/**
 * @swagger
 * /output/pdf/voucher/{id_output}:
 *   get:
 *     summary: Imprimir voucher de salida
 *     tags: [Outputs]
 *     parameters:
 *       - in: path
 *         name: id_output
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Voucher PDF generado
 */
router.get('/pdf/voucher/:id_output', [
    validarJWT,
    validateIdOutput,
], printOutputVoucher);

/**
 * @swagger
 * /output/pdf:
 *   get:
 *     summary: Generar reporte PDF de salidas
 *     tags: [Outputs]
 *     responses:
 *       200:
 *         description: Reporte PDF generado
 */
router.get('/pdf', [
    validarJWT,
], generatePdfReports);

/**
 * @swagger
 * /output/pdf/details:
 *   get:
 *     summary: Generar reporte PDF detallado de salidas
 *     tags: [Outputs]
 *     responses:
 *       200:
 *         description: Reporte PDF detallado generado
 */
router.get('/pdf/details', [
    validarJWT,
], generatePdfDetailsReports);

/**
 * @swagger
 * /output/excel:
 *   get:
 *     summary: Generar reporte Excel de salidas
 *     tags: [Outputs]
 *     responses:
 *       200:
 *         description: Reporte Excel generado
 */
router.get('/excel', [
    validarJWT,
], generateExcelReports);

/**
 * @swagger
 * /output/excel/details:
 *   get:
 *     summary: Generar reporte Excel detallado de salidas
 *     tags: [Outputs]
 *     responses:
 *       200:
 *         description: Reporte Excel detallado generado
 */
router.get('/excel/details', [
    validarJWT,
], generateExcelDetailsReports);


module.exports = router;