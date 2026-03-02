const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getAccountsReceivablePaginate, newAbonoAccountReceivable, deleteAbonoAccountReceivable, getAccountAllClient, payAccountMultiple, getAbonosAllReceivablesPaginate, deleteAbonoMultipleAccountReceivable } = require('../controllers/accounts_receivable.controller');
const { getValidateCreate, validateDelete, getValidateGetForClient, getValidateGetForClientGet, validateDeleteMultiple } = require('../middlewares/validators/accounts_receivable');
const { generatePdfReports, generateExcelReports, printAbonoAccountReceivableVoucher, printAccountReceivableVoucher, generatePdfReportsAbonosAll, generateExcelReportsAbonosAll } = require('../controllers/reports/accounts_receivable.controller');
const { printAbonoMultipleAccountReceivableVoucher } = require('../controllers/reports/account_receivable/printBoletaAbonoMultiple');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: AccountsReceivable
 *   description: Gestión de cuentas por cobrar
 */

/**
 * @swagger
 * /accounts_receivable:
 *   get:
 *     summary: Obtener cuentas por cobrar paginadas
 *     tags: [AccountsReceivable]
 *     responses:
 *       200:
 *         description: Lista de cuentas por cobrar
 */
router.get('/', [
    validarJWT,
], getAccountsReceivablePaginate);

/**
 * @swagger
 * /accounts_receivable/forClient:
 *   get:
 *     summary: Obtener cuentas por cobrar por cliente
 *     tags: [AccountsReceivable]
 *     responses:
 *       200:
 *         description: Cuentas del cliente
 */
router.get('/forClient', [
    validarJWT,
    getValidateGetForClientGet
], getAccountAllClient);

/**
 * @swagger
 * /accounts_receivable/abonos/all:
 *   get:
 *     summary: Obtener historial de abonos
 *     tags: [AccountsReceivable]
 *     responses:
 *       200:
 *         description: Historial de abonos
 */
router.get('/abonos/all', [
    validarJWT,
], getAbonosAllReceivablesPaginate);

/**
 * @swagger
 * /accounts_receivable/payMultiClient:
 *   post:
 *     summary: Registrar pago de múltiples cuentas de cliente
 *     tags: [AccountsReceivable]
 *     responses:
 *       200:
 *         description: Pago registrado
 */
router.post('/payMultiClient', [
    validarJWT,
    getValidateGetForClient
], payAccountMultiple);

/**
 * @swagger
 * /accounts_receivable/new-abono:
 *   post:
 *     summary: Registrar nuevo abono
 *     tags: [AccountsReceivable]
 *     responses:
 *       201:
 *         description: Abono registrado
 */
router.post('/new-abono', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newAbonoAccountReceivable);

/**
 * @swagger
 * /accounts_receivable/destroy-abono/{id_abono}:
 *   delete:
 *     summary: Eliminar un abono
 *     tags: [AccountsReceivable]
 *     parameters:
 *       - in: path
 *         name: id_abono
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Abono eliminado
 */
router.delete('/destroy-abono/:id_abono', [
    validarJWT,
    validateDelete
], deleteAbonoAccountReceivable);

/**
 * @swagger
 * /accounts_receivable/destroy-abono-multiple/{id_abono_multiple}:
 *   delete:
 *     summary: Eliminar abono múltiple
 *     tags: [AccountsReceivable]
 *     parameters:
 *       - in: path
 *         name: id_abono_multiple
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Abono múltiple eliminado
 */
router.delete('/destroy-abono-multiple/:id_abono_multiple', [
    validarJWT,
    validateDeleteMultiple
], deleteAbonoMultipleAccountReceivable);


//reports
/**
 * @swagger
 * /accounts_receivable/pdf:
 *   get:
 *     summary: Generar reporte PDF de cuentas por cobrar
 *     tags: [AccountsReceivable]
 *     responses:
 *       200:
 *         description: Reporte PDF generado
 */
router.get('/pdf', [
    validarJWT,
], generatePdfReports);

/**
 * @swagger
 * /accounts_receivable/excel:
 *   get:
 *     summary: Generar reporte Excel de cuentas por cobrar
 *     tags: [AccountsReceivable]
 *     responses:
 *       200:
 *         description: Reporte Excel generado
 */
router.get('/excel', [
    validarJWT,
], generateExcelReports);

/**
 * @swagger
 * /accounts_receivable/pdf/abonos:
 *   get:
 *     summary: Generar reporte PDF de abonos
 *     tags: [AccountsReceivable]
 *     responses:
 *       200:
 *         description: Reporte PDF de abonos generado
 */
router.get('/pdf/abonos', [
    validarJWT,
], generatePdfReportsAbonosAll);

/**
 * @swagger
 * /accounts_receivable/excel/abonos:
 *   get:
 *     summary: Generar reporte Excel de abonos
 *     tags: [AccountsReceivable]
 *     responses:
 *       200:
 *         description: Reporte Excel de abonos generado
 */
router.get('/excel/abonos', [
    validarJWT,
], generateExcelReportsAbonosAll);

/**
 * @swagger
 * /accounts_receivable/pdf/voucher-abono/{id_abono_account_receivable}:
 *   get:
 *     summary: Imprimir voucher de abono
 *     tags: [AccountsReceivable]
 *     parameters:
 *       - in: path
 *         name: id_abono_account_receivable
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Voucher PDF generado
 */
router.get('/pdf/voucher-abono/:id_abono_account_receivable', [
    validarJWT,
], printAbonoAccountReceivableVoucher);

/**
 * @swagger
 * /accounts_receivable/pdf/voucher-abono-multiple/{id_abono_account_receivable_multiple}:
 *   get:
 *     summary: Imprimir voucher de abono múltiple
 *     tags: [AccountsReceivable]
 *     parameters:
 *       - in: path
 *         name: id_abono_account_receivable_multiple
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Voucher PDF generado
 */
router.get('/pdf/voucher-abono-multiple/:id_abono_account_receivable_multiple', [
    validarJWT,
], printAbonoMultipleAccountReceivableVoucher);

/**
 * @swagger
 * /accounts_receivable/pdf/voucher-account-receivable/{id_account_receivable}:
 *   get:
 *     summary: Imprimir voucher de cuenta por cobrar
 *     tags: [AccountsReceivable]
 *     parameters:
 *       - in: path
 *         name: id_account_receivable
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Voucher PDF generado
 */
router.get('/pdf/voucher-account-receivable/:id_account_receivable', [
    validarJWT,
], printAccountReceivableVoucher);

module.exports = router;