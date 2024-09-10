const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getClassifiedsPaginate, newClassified, destroyClassified } = require('../controllers/classified.controller');
const { getValidateCreate, validateIdClassified } = require('../middlewares/validators/classified');
const { printClassifiedVoucher, generatePdfReports, generatePdfDetailsReports, generateExcelReports, generateExcelDetailsReports } = require('../controllers/reports/classified.controller');

const router = Router();


router.get('/',[
    validarJWT,
],getClassifiedsPaginate );

router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newClassified );

router.delete('/destroy/:id_classified', [
    validarJWT,
    validateIdClassified
],destroyClassified );

//** REPORTS */
router.get('/pdf/voucher/:id_classified',[
    validarJWT,
    validateIdClassified,
], printClassifiedVoucher );

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