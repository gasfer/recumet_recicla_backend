const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getAccountsPayablePaginate, newAbonoAccountPayable, deleteAbonoAccountPayable, getAccountAllProvider, payAccountMultiple, getAbonosAllPayablePaginate, deleteAbonoMultipleAccountPayable, uploadFileVoucherAbono } = require('../controllers/accounts_payables.controller');
const { getValidateCreate, validateDelete, getValidateGetForProvider, getValidateGetForProviderGet, validateDeleteMultiple } = require('../middlewares/validators/accounts_payable');
const { generatePdfReports, generateExcelReports, printAbonoAccountPayableVoucher, printAccountPayableVoucher, generatePdfReportsAbonosAll, generateExcelReportsAbonosAll } = require('../controllers/reports/accounts_payables.controller');
const { printAbonoMultipleAccountPayableVoucher } = require('../controllers/reports/accounts_payable/printBoletaAbonoMultiple');
const expressfileUpload = require('express-fileupload');
const { filesExist, filesValidateSize } = require('../middlewares/validators/validar-files');

const router = Router();


/**
 * @swagger
 * tags:
 *   name: AccountsPayable
 *   description: Gestión de cuentas por pagar
 */

/**
 * @swagger
 * /accounts_payable:
 *   get:
 *     summary: Obtener cuentas por pagar paginadas
 *     tags: [AccountsPayable]
 *     responses:
 *       200:
 *         description: Lista de cuentas por pagar
 */
router.get('/', [
    validarJWT,
], getAccountsPayablePaginate);

/**
 * @swagger
 * /accounts_payable/forProvider:
 *   get:
 *     summary: Obtener cuentas por pagar por proveedor
 *     tags: [AccountsPayable]
 *     responses:
 *       200:
 *         description: Cuentas del proveedor
 */
router.get('/forProvider', [
    validarJWT,
    getValidateGetForProviderGet
], getAccountAllProvider);

/**
 * @swagger
 * /accounts_payable/abonos/all:
 *   get:
 *     summary: Obtener historial de abonos
 *     tags: [AccountsPayable]
 *     responses:
 *       200:
 *         description: Historial de abonos
 */
router.get('/abonos/all', [
    validarJWT,
], getAbonosAllPayablePaginate);

/**
 * @swagger
 * /accounts_payable/payMultiProvider:
 *   post:
 *     summary: Pagar múltiples cuentas a proveedor
 *     tags: [AccountsPayable]
 *     responses:
 *       200:
 *         description: Pago realizado
 */
router.post('/payMultiProvider', [
    validarJWT,
    getValidateGetForProvider
], payAccountMultiple);

/**
 * @swagger
 * /accounts_payable/new-abono:
 *   post:
 *     summary: Registrar nuevo abono
 *     tags: [AccountsPayable]
 *     responses:
 *       201:
 *         description: Abono registrado
 */
router.post('/new-abono', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
], newAbonoAccountPayable);

router.put('/upload/voucher', [
    validarJWT,
    expressfileUpload(),
    filesExist,
    filesValidateSize
], uploadFileVoucherAbono);

/**
 * @swagger
 * /accounts_payable/destroy-abono/{id_abono}:
 *   delete:
 *     summary: Eliminar un abono
 *     tags: [AccountsPayable]
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
], deleteAbonoAccountPayable);

/**
 * @swagger
 * /accounts_payable/destroy-abono-multiple/{id_abono_multiple}:
 *   delete:
 *     summary: Eliminar abono múltiple
 *     tags: [AccountsPayable]
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
], deleteAbonoMultipleAccountPayable);

//reports
router.get('/pdf', [
    validarJWT,
], generatePdfReports);

router.get('/pdf/abonos', [
    validarJWT,
], generatePdfReportsAbonosAll);

router.get('/excel', [
    validarJWT,
], generateExcelReports);

router.get('/excel/abonos', [
    validarJWT,
], generateExcelReportsAbonosAll);

router.get('/pdf/voucher-abono/:id_abono_account_payable', [
    validarJWT,
], printAbonoAccountPayableVoucher);

router.get('/pdf/voucher-abono-multiple/:id_abono_account_payable_multiple', [
    validarJWT,
], printAbonoMultipleAccountPayableVoucher);

router.get('/pdf/voucher-account-payable/:id_account_payable', [
    validarJWT,
], printAccountPayableVoucher);


module.exports = router;