const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getAccountsReceivablePaginate, newAbonoAccountReceivable, deleteAbonoAccountReceivable, getAccountAllClient, payAccountMultiple, getAbonosAllReceivablesPaginate } = require('../controllers/accounts_receivable.controller');
const { getValidateCreate, validateDelete, getValidateGetForClient, getValidateGetForClientGet } = require('../middlewares/validators/accounts_receivable');
const { generatePdfReports, generateExcelReports, printAbonoAccountReceivableVoucher, printAccountReceivableVoucher, generatePdfReportsAbonosAll, generateExcelReportsAbonosAll } = require('../controllers/reports/accounts_receivable.controller');

const router = Router();


router.get('/',[
    validarJWT,
],getAccountsReceivablePaginate );

router.get('/forClient',[
    validarJWT,
    getValidateGetForClientGet
],getAccountAllClient );

router.get('/abonos/all',[
    validarJWT,
],getAbonosAllReceivablesPaginate );

router.post('/payMultiClient',[
    validarJWT,
    getValidateGetForClient
],payAccountMultiple );

router.post('/new-abono', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newAbonoAccountReceivable );

router.delete('/destroy-abono/:id_abono', [
    validarJWT,
    validateDelete
],deleteAbonoAccountReceivable );

//reports
router.get('/pdf',[
    validarJWT,
], generatePdfReports );

router.get('/excel',[
    validarJWT,
], generateExcelReports );

router.get('/pdf/abonos',[
    validarJWT,
], generatePdfReportsAbonosAll );

router.get('/excel/abonos',[
    validarJWT,
], generateExcelReportsAbonosAll );

router.get('/pdf/voucher-abono/:id_abono_account_receivable',[
    validarJWT,
], printAbonoAccountReceivableVoucher );

router.get('/pdf/voucher-account-receivable/:id_account_receivable',[
    validarJWT,
], printAccountReceivableVoucher );

module.exports = router;