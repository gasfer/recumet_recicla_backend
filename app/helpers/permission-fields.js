'use strict';

const readPermissionField = (permission, field) => {
  if (!permission) return undefined;
  if (typeof permission.get === 'function') return permission.get(field);
  return permission[field];
};

const isPermissionActionGranted = (permission, action) => (
  readPermissionField(permission, action) === true
);

module.exports = {
  readPermissionField,
  isPermissionActionGranted,
};
