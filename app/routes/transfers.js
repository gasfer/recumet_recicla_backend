const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getTransfersPaginate, newTransfer, deleteTransfer, receivedTransfer, getTransferFindOne } = require('../controllers/transfers.controller');
const { getValidateCreate, validateIdTransferPending, getValidateReceived, validateIdTransfer } = require('../middlewares/validators/transfers');
const { printTransferVoucher, generatePdfReports, generateExcelReports } = require('../controllers/reports/transfers.controller');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: Transfers
 *   description: Gestión de transferencias
 */

/**
 * @swagger
 * /transfers:
 *   get:
 *     summary: Obtener transferencias paginadas
 *     tags: [Transfers]
 *     responses:
 *       200:
 *         description: Lista de transferencias
 */
router.get('/', [
    validarJWT,
], getTransfersPaginate);

/**
 * @swagger
 * /transfers/find/{id_transfer}:
 *   get:
 *     summary: Obtener transferencia por ID
 *     tags: [Transfers]
 *     parameters:
 *       - in: path
 *         name: id_transfer
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detalle de transferencia
 */
router.get('/find/:id_transfer', [
    validarJWT,
], getTransferFindOne);

/**
 * @swagger
 * /transfers:
 *   post:
 *     summary: Crear nueva transferencia
 *     tags: [Transfers]
 *     responses:
 *       201:
 *         description: Transferencia creada
 */
router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newTransfer);

/**
 * @swagger
 * /transfers/received:
 *   put:
 *     summary: Recibir transferencia
 *     tags: [Transfers]
 *     responses:
 *       200:
 *         description: Transferencia recibida
 */
router.put('/received', [
    validarJWT,
    toUpperCaseConvert,
    getValidateReceived
], receivedTransfer);

/**
 * @swagger
 * /transfers/destroy/{id_transfer}:
 *   delete:
 *     summary: Eliminar transferencia
 *     tags: [Transfers]
 *     parameters:
 *       - in: path
 *         name: id_transfer
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transferencia eliminada
 */
router.delete('/destroy/:id_transfer', [
    validarJWT,
    validateIdTransferPending
], deleteTransfer)

//** REPORTS */
/**
 * @swagger
 * /transfers/pdf/voucher/{id_transfer}:
 *   get:
 *     summary: Imprimir voucher de transferencia
 *     tags: [Transfers]
 *     parameters:
 *       - in: path
 *         name: id_transfer
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Voucher PDF generado
 */
router.get('/pdf/voucher/:id_transfer', [
    validarJWT,
    validateIdTransfer,
], printTransferVoucher);

/**
 * @swagger
 * /transfers/pdf:
 *   get:
 *     summary: Generar reporte PDF de transferencias
 *     tags: [Transfers]
 *     responses:
 *       200:
 *         description: Reporte PDF generado
 */
router.get('/pdf', [
    validarJWT,
], generatePdfReports);

/**
 * @swagger
 * /transfers/excel:
 *   get:
 *     summary: Generar reporte Excel de transferencias
 *     tags: [Transfers]
 *     responses:
 *       200:
 *         description: Reporte Excel generado
 */
router.get('/excel', [
    validarJWT,
], generateExcelReports);

module.exports = router;