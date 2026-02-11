const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const { getKardexPaginate, getKardexFisicoPaginate } = require("../controllers/kardex.controller");
const { generatePdfReports, generateExcelReports, generatePdfReportsKardexFisico, generateExcelReportsKardexFisico, generatePdfReportsExistencia, generateExcelReportsExistencia } = require('../controllers/reports/kardex.controller');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Kardex
 *   description: Gestión de kardex de inventario
 */

/**
 * @swagger
 * /kardex:
 *   get:
 *     summary: Obtener kardex paginado
 *     tags: [Kardex]
 *     responses:
 *       200:
 *         description: Lista de movimientos de kardex
 */
router.get('/', [
    validarJWT,
], getKardexPaginate);

/**
 * @swagger
 * /kardex/fisico:
 *   get:
 *     summary: Obtener kardex físico paginado
 *     tags: [Kardex]
 *     responses:
 *       200:
 *         description: Lista de movimientos físicos
 */
router.get('/fisico', [
    validarJWT,
], getKardexFisicoPaginate);

//** REPORTS */
/**
 * @swagger
 * /kardex/pdf:
 *   get:
 *     summary: Generar reporte PDF de kardex
 *     tags: [Kardex]
 *     responses:
 *       200:
 *         description: Reporte PDF generado
 */
router.get('/pdf', [
    validarJWT,
], generatePdfReports);

/**
 * @swagger
 * /kardex/pdf/fisico:
 *   get:
 *     summary: Generar reporte PDF de kardex físico
 *     tags: [Kardex]
 *     responses:
 *       200:
 *         description: Reporte PDF de kardex físico generado
 */
router.get('/pdf/fisico', [
    validarJWT,
], generatePdfReportsKardexFisico);

/**
 * @swagger
 * /kardex/pdf/existencia:
 *   get:
 *     summary: Generar reporte PDF de existencias
 *     tags: [Kardex]
 *     responses:
 *       200:
 *         description: Reporte PDF de existencias generado
 */
router.get('/pdf/existencia', [
    validarJWT,
], generatePdfReportsExistencia);

/**
 * @swagger
 * /kardex/excel:
 *   get:
 *     summary: Generar reporte Excel de kardex
 *     tags: [Kardex]
 *     responses:
 *       200:
 *         description: Reporte Excel generado
 */
router.get('/excel', [
    validarJWT,
], generateExcelReports);

/**
 * @swagger
 * /kardex/excel/fisico:
 *   get:
 *     summary: Generar reporte Excel de kardex físico
 *     tags: [Kardex]
 *     responses:
 *       200:
 *         description: Reporte Excel de kardex físico generado
 */
router.get('/excel/fisico', [
    validarJWT,
], generateExcelReportsKardexFisico);

/**
 * @swagger
 * /kardex/excel/existencia:
 *   get:
 *     summary: Generar reporte Excel de existencias
 *     tags: [Kardex]
 *     responses:
 *       200:
 *         description: Reporte Excel de existencias generado
 */
router.get('/excel/existencia', [
    validarJWT,
], generateExcelReportsExistencia);


module.exports = router;
