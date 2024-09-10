const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const { getKardexPaginate, getKardexFisicoPaginate } = require("../controllers/kardex.controller");
const { generatePdfReports, generateExcelReports, generatePdfReportsKardexFisico, generateExcelReportsKardexFisico, generatePdfReportsExistencia, generateExcelReportsExistencia } = require('../controllers/reports/kardex.controller');

const router = Router();


router.get('/',[
    validarJWT,
],getKardexPaginate );

router.get('/fisico',[
    validarJWT,
],getKardexFisicoPaginate );

//** REPORTS */
router.get('/pdf',[
    validarJWT,
], generatePdfReports );

router.get('/pdf/fisico',[
    validarJWT,
], generatePdfReportsKardexFisico );

router.get('/pdf/existencia',[
    validarJWT,
], generatePdfReportsExistencia );

router.get('/excel',[
    validarJWT,
], generateExcelReports );

router.get('/excel/fisico',[
    validarJWT,
], generateExcelReportsKardexFisico );

router.get('/excel/existencia',[
    validarJWT,
], generateExcelReportsExistencia );


module.exports = router;
