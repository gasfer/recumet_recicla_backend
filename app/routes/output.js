const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getOutputsPaginate, newOutput, anularOutput, updateOutput } = require('../controllers/output.controller');
const { getValidateCreate, validateIdOutput, getValidateUpdate } = require('../middlewares/validators/output');
const { printOutputVoucher, generatePdfReports, generateExcelReports, generatePdfDetailsReports, generateExcelDetailsReports } = require('../controllers/reports/output.controller');

const router = Router();


router.get('/',[
    validarJWT,
],getOutputsPaginate );


router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newOutput );

router.put('/:id_output', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate,
],updateOutput );

router.delete('/anular/:id_output',[
    validarJWT,
    validateIdOutput
],anularOutput)

//** REPORTS */
router.get('/pdf/voucher/:id_output',[
    validarJWT,
    validateIdOutput,
], printOutputVoucher );

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