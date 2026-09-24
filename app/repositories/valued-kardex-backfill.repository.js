'use strict';

const db = require('../database/config');

class ValuedKardexBackfillRepository {
  constructor(models = db) {
    this.Entry = models.ValuedKardexEntry;
    this.Balance = models.ValuedInventoryBalance;
  }

  upsertEntries(entries, transaction) {
    if (!entries.length) return [];
    return this.Entry.bulkCreate(entries, {
      transaction,
      updateOnDuplicate: [
        'movement_date', 'source_sequence', 'id_user', 'quantity_input', 'quantity_output',
        'applied_unit_cost', 'input_value', 'output_value', 'quantity_after',
        'average_unit_cost_after', 'balance_value_after', 'valuation_status',
        'valuation_reason', 'updatedAt',
      ],
    });
  }

  upsertBalances(balances, transaction) {
    if (!balances.length) return [];
    return this.Balance.bulkCreate(balances, {
      transaction,
      updateOnDuplicate: [
        'quantity', 'average_unit_cost', 'balance_value', 'valuation_status',
        'valuation_reason', 'updatedAt',
      ],
    });
  }
}

module.exports = { ValuedKardexBackfillRepository };
