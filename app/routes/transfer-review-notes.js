const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const { getReviewNote, printReviewNote } = require('../controllers/transfer_review_notes.controller');

const router = Router();
router.get('/:id', [validarJWT], getReviewNote);
router.get('/:id/pdf', [validarJWT], printReviewNote);

module.exports = router;
