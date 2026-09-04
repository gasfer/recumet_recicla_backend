const { actionLabel, sendPermissionDenied } = require('../helpers/permission-denied');
const { readPermissionField, isPermissionActionGranted } = require('../helpers/permission-fields');

const authorizeModulePermission = (module, action = 'view') => {
  const middleware = (req, res, next) => {
    const user = req.userAuth;
    if (user?.role === 'ADMINISTRADOR') return next();

    const permissions = Array.isArray(user?.assign_permission)
      ? user.assign_permission
      : [];
    const permission = permissions.find(item => (
      readPermissionField(item, 'module') === module
      && readPermissionField(item, 'status') !== false
    ));

    if (!isPermissionActionGranted(permission, action)) {
      return sendPermissionDenied(res, `${actionLabel(action)} el módulo ${module}`);
    }

    return next();
  };

  middleware.modulePermission = Object.freeze({ module, action });
  return middleware;
};

module.exports = {
  authorizeModulePermission,
};
