const { Router } = require('express');
const { validatedResponse } = require('../middlewares/validated-response');
const { validateShowFile } = require('../middlewares/validators/validar-files');
const { showFile } = require('../controllers/showfiles.controller');

const router = Router();


router.get('/:type/:name',[
    validateShowFile,
    validatedResponse
],showFile);

module.exports = router;