'use strict';

const db = require('../database/config');

const locationWhere = ({ id_product, id_sucursal, id_storage }) => ({ id_product, id_sucursal, id_storage });

class ValuedInventoryRepository {
  constructor(models = db) {
    this.Balance = models.ValuedInventoryBalance;
    this.Entry = models.ValuedKardexEntry;
  }

  async lockBalance(location, transaction) {
    const where = locationWhere(location);
    let balance = await this.Balance.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
    if (!balance) {
      await this.Balance.create({
        ...where, quantity: 0, balance_value: 0,
        average_unit_cost: null, valuation_status: 'UNVALUED',
        valuation_reason: 'Saldo pendiente de primera entrada valorada.',
      }, { transaction });
      balance = await this.Balance.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
    }
    return balance;
  }

  async findEntry(source, transaction) {
    return this.Entry.findOne({
      where: {
        source_type: source.source_type,
        source_id: String(source.source_id),
        source_detail_id: source.source_detail_id == null ? null : String(source.source_detail_id),
        effect_type: source.effect_type,
      },
      transaction,
    });
  }

  async createEntry(values, transaction) {
    return this.Entry.create(values, { transaction });
  }

  async saveBalance(balance, values, transaction) {
    return balance.update(values, { transaction });
  }
}

module.exports = { ValuedInventoryRepository, locationWhere };
