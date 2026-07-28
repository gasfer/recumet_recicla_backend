const { Notification, User } = require('../database/config');
const { Op } = require('sequelize');
const paginate = require('../helpers/paginate');

class NotificationService {
  /**
   * Notifica a todos los usuarios con rol 'ADMINISTRADOR', opcionalmente excluyendo a uno (excludeUserId)
   */
  async notifyAdmins({ title, message, type, level = 'INFO', id_reference = null }, transaction = null, excludeUserId = null) {
    try {
      const whereCondition = {
        role: 'ADMINISTRADOR',
        status: true
      };

      if (excludeUserId) {
        whereCondition.id = { [Op.ne]: excludeUserId };
      }

      const admins = await User.findAll({
        where: whereCondition,
        attributes: ['id']
      });

      if (!admins || admins.length === 0) {
        return [];
      }

      const notificationsData = admins.map(admin => ({
        id_user: admin.id,
        title,
        message,
        type,
        level,
        id_reference,
        is_read: false,
        status: true
      }));

      const options = transaction ? { transaction } : {};
      const createdNotifications = await Notification.bulkCreate(notificationsData, options);

      // Emitir evento por Socket.io en tiempo real a los clientes conectados
      try {
        const Server = require('../models/server');
        if (Server.instance && Server.instance.io) {
          Server.instance.io.emit('new-notification', {
            type,
            level,
            title
          });
        }
      } catch (err) {
        console.error('Error al emitir evento socket:', err);
      }

      return createdNotifications;
    } catch (error) {
      console.error('Error al notificar administradores:', error);
      throw error;
    }
  }

  /**
   * Obtiene notificaciones no leídas de atención prioritaria (DANGER y WARNING) para la campana del topbar
   */
  async getUserNotifications(id_user, limit = 20) {
    return await Notification.findAll({
      where: {
        id_user,
        status: true,
        is_read: false,
        level: { [Op.in]: ['DANGER', 'WARNING'] }
      },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  /**
   * Marca una o varias notificaciones como leídas
   */
  async markAsRead(id_user, notificationIds = []) {
    const whereCondition = {
      id_user,
      status: true
    };

    if (notificationIds && notificationIds.length > 0) {
      whereCondition.id = { [Op.in]: notificationIds };
    }

    return await Notification.update(
      { is_read: true },
      { where: whereCondition }
    );
  }

  /**
   * Obtiene notificaciones paginadas para el historial
   */
  async getNotificationsPaginate(id_user, page = 1, limit = 10, type = '', query = '', level = '') {
    const whereConditions = [
      { id_user },
      { status: true }
    ];

    if (level) {
      whereConditions.push({ level });
    }

    const optionsDb = {
      order: [['createdAt', 'DESC']],
      where: {
        [Op.and]: whereConditions
      }
    };

    return await paginate(Notification, page, limit, type, query, optionsDb);
  }
}

module.exports = new NotificationService();
