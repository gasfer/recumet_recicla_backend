const { response, request } = require('express');
const notificationService = require('../services/notification.service');

const getUserNotifications = async (req = request, res = response) => {
    try {
        const id_user = req.userAuth.id;
        const notifications = await notificationService.getUserNotifications(id_user);
        return res.status(200).json({
            ok: true,
            notifications
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: 'Ocurrió un imprevisto interno | hable con soporte' }]
        });
    }
};

const markAsRead = async (req = request, res = response) => {
    try {
        const id_user = req.userAuth.id;
        const { notificationIds } = req.body;
        await notificationService.markAsRead(id_user, notificationIds);
        return res.status(200).json({
            ok: true,
            msg: 'Notificaciones marcadas como leídas'
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: 'Ocurrió un imprevisto interno | hable con soporte' }]
        });
    }
};

const getNotificationsHistory = async (req = request, res = response) => {
    try {
        const id_user = req.userAuth.id;
        const { page = 1, limit = 10, type = '', query = '', level = '' } = req.query;
        const notifications = await notificationService.getNotificationsPaginate(id_user, page, limit, type, query, level);
        return res.status(200).json({
            ok: true,
            notifications
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: 'Ocurrió un imprevisto interno | hable con soporte' }]
        });
    }
};

module.exports = {
    getUserNotifications,
    markAsRead,
    getNotificationsHistory
};
