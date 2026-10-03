'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();

const getDecimalPolicy = () => context.getStore();
const withDecimalPolicy = (policy, operation) => {
  if (!Number.isInteger(policy.places) || policy.places < 0 || policy.places > 4) {
    throw new TypeError('Los decimales deben ser un entero entre 0 y 4.');
  }
  return context.run(Object.freeze({ ...policy, storagePlaces: 4 }), operation);
};

module.exports = { getDecimalPolicy, withDecimalPolicy };
