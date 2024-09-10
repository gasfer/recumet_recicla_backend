const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const toUpperCaseConvert = require('../middlewares/touppercase-convert');
const { getSucursalPaginate, newSucursal, updateSucursal, activeInactiveSucursal } = require('../controllers/sucursal.controller');
const { getValidateCreate, getValidateUpdate, validateDelete } = require('../middlewares/validators/sucursal');

const router = Router();


router.get('/',[
    validarJWT,
],getSucursalPaginate );

router.post('/', [
    validarJWT,
    toUpperCaseConvert,
    getValidateCreate
],newSucursal );

router.put('/:id', [
    validarJWT,
    toUpperCaseConvert,
    getValidateUpdate
],updateSucursal );

router.put('/destroyAndActive/:id', [
    validarJWT,
    validateDelete
],activeInactiveSucursal );


module.exports = router;