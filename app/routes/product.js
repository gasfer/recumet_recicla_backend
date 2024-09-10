const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const expressfileUpload = require('express-fileupload');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getProductPaginate, newProduct, updateProduct, activeInactiveProduct, newPriceProduct, deletePriceProduct, uploadFileProduct, getOneProductSucursal, productAssignatSucursals, getProductCostsSucursal, updateProductsCostos } = require('../controllers/product.controller');
const { getValidateCreate, getValidateUpdate, validateDelete, getValidateCreatePrice, validateDeletePrice } = require('../middlewares/validators/product');
const { filesExist, validateUploadIdProduct, filesValidateSize } = require('../middlewares/validators/validar-files');
const { validatedResponse } = require('../middlewares/validated-response');
const { generateExcelReportsPricesProduct, generatePdfReports } = require('../controllers/reports/products.controller');

const router = Router();
router.use(expressfileUpload());

router.get('/',[
    validarJWT,
],getProductPaginate );

router.get('/sucursals',[
    validarJWT,
], getOneProductSucursal );

router.get('/costs',[
    validarJWT,
], getProductCostsSucursal );

router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newProduct );

router.post('/cost', [
    validarJWT,
],updateProductsCostos );

router.post('/sucursals', [
    validarJWT,
],productAssignatSucursals );

router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
],updateProduct );

router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
],activeInactiveProduct );

router.post('/price', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreatePrice
],newPriceProduct );

router.delete('/price/:id', [
    validarJWT,
    validateDeletePrice
],deletePriceProduct );

router.put('/upload/img',[
    validarJWT,
    filesExist,
    validateUploadIdProduct,
    filesValidateSize,
    validatedResponse
], uploadFileProduct );

//reports
router.get('/excel/costs',[
    validarJWT,
], generateExcelReportsPricesProduct );

router.get('/pdf/costs',[
    validarJWT,
], generatePdfReports );



module.exports = router;