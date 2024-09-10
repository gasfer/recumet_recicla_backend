const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getInputsPaginate, newInput, anularInput, updateInput } = require('../controllers/input.controller');
const { getValidateCreate, validateIdInput, getValidateUpdate } = require('../middlewares/validators/input');
const { generatePdfReports, generateExcelReports, generatePdfDetailsReports, generateExcelDetailsReports, printInputVoucher } = require('../controllers/reports/input.controller');

const router = Router();


router.get('/',[
    validarJWT,
],getInputsPaginate );


router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newInput );

router.put('/:id_input', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate,
],updateInput );

router.delete('/anular/:id_input',[
    validarJWT,
    validateIdInput
],anularInput)

//** REPORTS */
router.get('/pdf/voucher/:id_input',[
    validarJWT,
    validateIdInput,
], printInputVoucher );

router.get('/pdf',[
    validarJWT,
], generatePdfReports );

router.get('/pdf/details',[
    validarJWT,
], generatePdfDetailsReports );

router.get('/excel',[
    validarJWT,
], generateExcelReports );

router.get('/excel/details',[
    validarJWT,
], generateExcelDetailsReports );


module.exports = router;