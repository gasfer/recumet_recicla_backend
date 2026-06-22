const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const { getKardexPaginate, getKardexFisicoPaginate, getTotalStockRecumet } = require("../controllers/kardex.controller");
const { generatePdfReports, generateExcelReports, generatePdfReportsKardexFisico, generateExcelReportsKardexFisico, generatePdfReportsExistencia, generateExcelReportsExistencia } = require('../controllers/reports/kardex.controller');
const { generatePdfReportsTotalStock, generateExcelReportsTotalStock } = require('../controllers/reports/total-stock-recumet.controller');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Kardex
 *   description: Gestión de kardex de inventario
 */

/**
 * @swagger
 * /kardex/total-stock-recumet:
 *   get:
 *     summary: Obtener el saldo total físico consolidado de materia prima y productos terminados agrupado por producto
 *     tags: [Kardex]
 *     responses:
 *       200:
 *         description: Lista consolidada de stock por producto
 */
router.get('/total-stock-recumet', [
    validarJWT,
], getTotalStockRecumet);

router.get('/total-stock-recumet/pdf', [
    validarJWT,
], generatePdfReportsTotalStock);

router.get('/total-stock-recumet/excel', [
    validarJWT,
], generateExcelReportsTotalStock);

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
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Cantidad de items por página
 *       - in: query
 *         name: category_ids
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Lista de IDs de categorías (permite filtro múltiple)
 *       - in: query
 *         name: category_types
 *         schema:
 *           type: string
 *         description: Tipos de categoría (ej. RAW_MATERIAL, FINISHED_PRODUCT)
 *       - in: query
 *         name: field_sort
 *         schema:
 *           type: string
 *         description: Campo por el cual ordenar (ej. product.cod)
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Orden ascendente o descendente
 *       - in: query
 *         name: type_kardex
 *         schema:
 *           type: string
 *         description: Tipo de kardex
 *       - in: query
 *         name: id_sucursal
 *         schema:
 *           type: integer
 *         description: ID de la sucursal
 *       - in: query
 *         name: id_storage
 *         schema:
 *           type: integer
 *         description: ID del almacén
 *       - in: query
 *         name: id_provider
 *         schema:
 *           type: integer
 *         description: ID del proveedor
 *       - in: query
 *         name: id_product
 *         schema:
 *           type: integer
 *         description: ID del producto
 *       - in: query
 *         name: filterBy
 *         schema:
 *           type: string
 *           enum: [RANGE, DAY, MONTH, YEAR]
 *         description: Tipo de filtro de fecha
 *       - in: query
 *         name: date1
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha inicio (DD-MM-YYYY)
 *       - in: query
 *         name: date2
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha fin (DD-MM-YYYY)
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
 *     parameters:
 *       - in: query
 *         name: filterBy
 *         schema:
 *           type: string
 *           enum: [RANGE, DAY, MONTH, YEAR]
 *         description: Tipo de filtro de fecha
 *       - in: query
 *         name: date1
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha inicio (DD-MM-YYYY)
 *       - in: query
 *         name: date2
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha fin (DD-MM-YYYY)
 *       - in: query
 *         name: category_ids
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         style: form
 *         explode: true
 *         description: Lista de IDs de categorías
 *       - in: query
 *         name: category_types
 *         schema:
 *           type: string
 *         description: Tipos de categoría
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
