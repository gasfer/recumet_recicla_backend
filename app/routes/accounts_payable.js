const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getAccountsPayablePaginate, newAbonoAccountPayable, deleteAbonoAccountPayable, getAccountAllProvider, payAccountMultiple, getAbonosAllPayablePaginate } = require('../controllers/accounts_payables.controller');
const { getValidateCreate, validateDelete, getValidateGetForProvider, getValidateGetForProviderGet } = require('../middlewares/validators/accounts_payable');
const { generatePdfReports, generateExcelReports, printAbonoAccountPayableVoucher, printAccountPayableVoucher, generatePdfReportsAbonosAll, generateExcelReportsAbonosAll } = require('../controllers/reports/accounts_payables.controller');
const { printAbonoMultipleAccountPayableVoucher } = require('../controllers/reports/accounts_payable/printBoletaAbonoMultiple');

const router = Router();


router.get('/',[
    validarJWT,
],getAccountsPayablePaginate );

router.get('/forProvider',[
    validarJWT,
    getValidateGetForProviderGet
],getAccountAllProvider );

router.get('/abonos/all',[
    validarJWT,
],getAbonosAllPayablePaginate );

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

router.get('/pdf/abonos',[
    validarJWT,
], generatePdfReportsAbonosAll );

router.get('/excel',[
    validarJWT,
], generateExcelReports );

router.get('/excel/abonos',[
    validarJWT,
], generateExcelReportsAbonosAll );

router.get('/pdf/voucher-abono/:id_abono_account_payable',[
    validarJWT,
], printAbonoAccountPayableVoucher );

router.get('/pdf/voucher-abono-multiple/:id_abono_account_payable_multiple',[
    validarJWT,
], printAbonoMultipleAccountPayableVoucher );

router.get('/pdf/voucher-account-payable/:id_account_payable',[
    validarJWT,
], printAccountPayableVoucher );


module.exports = router;