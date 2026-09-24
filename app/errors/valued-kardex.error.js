'use strict';

class ValuedKardexError extends Error {
  constructor(code, message, location = {}) {
    super(message);
    this.name = 'ValuedKardexError';
    this.code = code;
    this.location = {
      id_product: location.id_product ?? null,
      id_sucursal: location.id_sucursal ?? null,
      id_storage: location.id_storage ?? null,
    };
  }
}

class MissingCostBasisError extends ValuedKardexError {
  constructor(location) {
    super('VALUED_KARDEX_COST_BASIS_MISSING', 'No existe una base de costo válida para registrar el movimiento.', location);
  }
}

class ValuedBalanceDiscontinuityError extends ValuedKardexError {
  constructor(location) {
    super('VALUED_KARDEX_BALANCE_DISCONTINUITY', 'El saldo físico y el saldo valorado no son continuos.', location);
  }
}

module.exports = { MissingCostBasisError, ValuedBalanceDiscontinuityError, ValuedKardexError };
