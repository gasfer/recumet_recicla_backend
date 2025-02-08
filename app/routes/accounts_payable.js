const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getAccountsPayablePaginate, newAbonoAccountPayable, deleteAbonoAccountPayable, getAccountAllProvider, payAccountMultiple } = require('../controllers/accounts_payables.controller');
const { getValidateCreate, validateDelete, getValidateGetForProvider } = require('../middlewares/validators/accounts_payable');
const { generatePdfReports, generateExcelReports, printAbonoAccountPayableVoucher, printAccountPayableVoucher } = require('../controllers/reports/accounts_payables.controller');

const router = Router();


router.get('/',[
    validarJWT,
],getAccountsPayablePaginate );

router.get('/forProvider',[
    validarJWT,
    getValidateGetForProvider
],getAccountAllProvider );

router.post('/payMultiProvider',[
    validarJWT,
    getValidateGetForProvider
],payAccountMultiple );

router.post('/new-abono', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newAbonoAccountPayable );

router.delete('/destroy-abono/:id_abono', [
    validarJWT,
    validateDelete
],deleteAbonoAccountPayable );

//reports
router.get('/pdf',[
    validarJWT,
], generatePdfReports );

router.get('/excel',[
    validarJWT,
], generateExcelReports );

router.get('/pdf/voucher-abono/:id_abono_account_payable',[
    validarJWT,
], printAbonoAccountPayableVoucher );

router.get('/pdf/voucher-account-payable/:id_account_payable',[
    validarJWT,
], printAccountPayableVoucher );


module.exports = router;