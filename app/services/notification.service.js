const { Notification, User } = require('../database/config');
const { Op } = require('sequelize');
const paginate = require('../helpers/paginate');

class NotificationService {
  async notifyTransferReviewStakeholders({ note, title, message, type, level = 'WARNING', eventKey, assignedUserId = null, reviewChanged = true }, transaction = null, excludeUserId = null) {
    const users = await User.findAll({
      where: { status: true },
      attributes: ['id', 'role'],
      include: [
        { association: 'assign_sucursales', required: false, attributes: ['id_sucursal', 'status'] },
        { association: 'assign_permission', required: false, attributes: ['module', 'view', 'status'] },
      ],
      transaction,
    });
    const recipientIds = [...new Set(users.filter((user) => {
      if (excludeUserId && Number(user.id) === Number(excludeUserId)) return false;
      if (user.role === 'ADMINISTRADOR' || Number(user.id) === Number(assignedUserId || note.id_assigned_user)) return true;
      const hasBranch = user.assign_sucursales.some(({ id_sucursal, status }) => status !== false && Number(id_sucursal) === Number(note.id_sucursal));
      const canRead = user.assign_permission.some(({ module, view, status }) => module === 'TRANSFER_REVIEW' && view === true && status !== false);
      return hasBranch && canRead;
    }).map(({ id }) => Number(id)))];

    if (recipientIds.length === 0) return [];
    const rows = recipientIds.map((userId) => ({
      id_user: userId,
      title,
      message,
      type,
      level,
      id_reference: note.id_transfer,
      idempotency_key: `${eventKey}:${userId}`,
      is_read: false,
      status: true,
    }));
    const created = await Notification.bulkCreate(rows, { transaction, ignoreDuplicates: true, returning: true });
    const createdRecipientIds = created
      .filter(({ id }) => Boolean(id))
      .map(({ id_user }) => Number(id_user));
    if (createdRecipientIds.length === 0) return created;
    try {
      const Server = require('../models/server');
      if (Server.instance?.io) {
        const eventName = reviewChanged ? 'transfer-review-updated' : 'new-notification';
        Server.instance.io.emit(eventName, reviewChanged ? {
          transfer_id: note.id_transfer,
          review_note_id: note.id,
          sucursal_id: note.id_sucursal,
          recipient_ids: createdRecipientIds,
          type,
        } : {
          type,
          level,
          title,
          message,
          recipient_ids: createdRecipientIds,
        });
      }
    } catch (error) {
      console.error('Error al emitir actualización de revisión:', error);
    }
    return created;
  }

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
