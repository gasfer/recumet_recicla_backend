const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getAccountsReceivablePaginate, newAbonoAccountReceivable, deleteAbonoAccountReceivable } = require('../controllers/accounts_receivable.controller');
const { getValidateCreate, validateDelete } = require('../middlewares/validators/accounts_receivable');
const { generatePdfReports, generateExcelReports, printAbonoAccountReceivableVoucher, printAccountReceivableVoucher } = require('../controllers/reports/accounts_receivable.controller');

const router = Router();


router.get('/',[
    validarJWT,
],getAccountsReceivablePaginate );

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

router.get('/pdf/voucher-abono/:id_abono_account_receivable',[
    validarJWT,
], printAbonoAccountReceivableVoucher );

router.get('/pdf/voucher-account-receivable/:id_account_receivable',[
    validarJWT,
], printAccountReceivableVoucher );

module.exports = router;