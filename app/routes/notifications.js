const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const { getUserNotifications, markAsRead, getNotificationsHistory } = require('../controllers/notifications.controller');

const router = Router();

/**
 * GET /api/v1/notifications
 * Obtener notificaciones no leídas del usuario logueado
 */
router.get('/', [
    validarJWT
], getUserNotifications);

/**
 * GET /api/v1/notifications/history
 * Obtener historial paginado de notificaciones
 */
router.get('/history', [
    validarJWT
], getNotificationsHistory);

/**
 * PUT /api/v1/notifications/read
 * Marcar notificaciones como leídas
 */
router.put('/read', [
    validarJWT
], markAsRead);

module.exports = router;
