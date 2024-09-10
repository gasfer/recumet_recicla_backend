const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const { getAllHistory } = require('../controllers/history.controller');

const router = Router();


router.get('/',[
    validarJWT,
], getAllHistory );


module.exports = router;