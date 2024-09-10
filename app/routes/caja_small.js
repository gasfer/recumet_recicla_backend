
const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { openCajaSmall, closeCajaSmall, newDetailCajaSmall, getCajasSmall, getTotalDetailsCajasSmall, editMontoAperturaCajaSmall } = require('../controllers/caja_small.controller');
const { getValidateOpen, getValidateClose, getValidateDetail } = require('../middlewares/validators/caja_small');
const { printCaja } = require('../controllers/reports/caja.controller');

const router = Router();


router.get('/', [
    validarJWT,
], getCajasSmall );

router.get('/print_caja/:id_caja_small', [
    validarJWT,
], printCaja );

router.get('/totales', [
    validarJWT,
], getTotalDetailsCajasSmall );

router.post('/open', [
    validarJWT,
    toUpperCaseConvert,
    getValidateOpen
], openCajaSmall );

router.put('/update_apertura', [
    validarJWT,
    getValidateOpen
], editMontoAperturaCajaSmall );

router.put('/close', [
    validarJWT,
    toUpperCaseConvert,
    getValidateClose
], closeCajaSmall );

router.post('/new-detail', [
    validarJWT,
    toUpperCaseConvert,
    getValidateDetail
], newDetailCajaSmall );



module.exports = router;