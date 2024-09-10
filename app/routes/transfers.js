const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getTransfersPaginate, newTransfer, deleteTransfer, receivedTransfer } = require('../controllers/transfers.controller');
const { getValidateCreate, validateIdTransferPending, getValidateReceived, validateIdTransfer } = require('../middlewares/validators/transfers');
const { printTransferVoucher, generatePdfReports, generateExcelReports } = require('../controllers/reports/transfers.controller');

const router = Router();


router.get('/',[
    validarJWT,
],getTransfersPaginate );


router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newTransfer );

router.put('/received', [
    validarJWT,
    toUpperCaseConvert,
    getValidateReceived
],receivedTransfer );

router.delete('/destroy/:id_transfer',[
    validarJWT,
    validateIdTransferPending
],deleteTransfer)

//** REPORTS */
router.get('/pdf/voucher/:id_transfer',[
    validarJWT,
    validateIdTransfer,
], printTransferVoucher );

router.get('/pdf',[
    validarJWT,
], generatePdfReports );

router.get('/excel',[
    validarJWT,
], generateExcelReports );

module.exports = router;