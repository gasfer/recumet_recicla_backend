'use strict';

const { classifySource, stableMovementKey, VALUATION_STATUS } = require('./valued-kardex-contract.service');
const { applyEntry, applyOutput, round, valueOf } = require('./weighted-average.service');

const locationKey = ({ id_product, id_sucursal, id_storage }) => `${id_product}:${id_sucursal}:${id_storage}`;

const emptyState = () => ({ quantity: 0, value: 0, average: null, status: VALUATION_STATUS.UNVALUED });

class ValuedKardexRebuilder {
  preview(rows) {
    const states = new Map();
    const entries = [];
    const exceptions = [];
    const sorted = [...rows].sort((left, right) => stableMovementKey(left).localeCompare(stableMovementKey(right)));

    for (const row of sorted) {
      const key = locationKey(row);
      const before = states.get(key) || emptyState();
      const direction = row.type;
      const quantity = Number(row.quantity ?? (direction === 'INPUT' ? row.quantity_input : row.quantity_output));
      const cost = row.cost_unitario == null ? null : Number(row.cost_unitario);
      let result;
      let status = VALUATION_STATUS.VALUED;
      let reason = null;
      try {
        if (!(quantity > 0)) throw Object.assign(new Error('La cantidad no es positiva.'), { code: 'INVALID_QUANTITY' });
        result = direction === 'INPUT'
          ? applyEntry({ quantityBefore: before.quantity, valueBefore: before.value, quantity, unitCost: cost })
          : applyOutput({ quantityBefore: before.quantity, valueBefore: before.value, quantity, averageBefore: before.average });
        if (result.quantityAfter < -0.0001) {
          throw Object.assign(new Error('El movimiento produce saldo físico negativo.'), { code: 'NEGATIVE_BALANCE' });
        }
        if (row.saldo != null && Math.abs(round(row.saldo) - result.quantityAfter) > 0.0001) {
          throw Object.assign(new Error('El saldo proyectado no coincide con el saldo físico del Kardex.'), { code: 'BALANCE_DISCONTINUITY' });
        }
      } catch (error) {
        status = VALUATION_STATUS.UNVALUED;
        reason = error.message;
        result = {
          quantityAfter: direction === 'INPUT' ? round(before.quantity + quantity) : round(before.quantity - quantity),
          valueAfter: before.value,
          averageAfter: before.average,
          appliedUnitCost: null,
          outputValue: null,
        };
        exceptions.push({
          code: error.code || 'VALUATION_ERROR', reason,
          registry_number: row.registry_number || null,
          id_product: row.id_product, id_sucursal: row.id_sucursal, id_storage: row.id_storage,
          id_movement: row.id_movement ?? null,
        });
      }

      const state = {
        quantity: result.quantityAfter,
        value: status === VALUATION_STATUS.VALUED ? result.valueAfter : before.value,
        average: status === VALUATION_STATUS.VALUED ? result.averageAfter : before.average,
        status,
      };
      states.set(key, state);
      entries.push({
        ...row,
        source_type: classifySource(row),
        stable_key: stableMovementKey(row),
        applied_unit_cost: result.appliedUnitCost,
        input_value: direction === 'INPUT' && result.appliedUnitCost !== null
          ? valueOf(quantity, result.appliedUnitCost) : null,
        output_value: direction === 'OUTPUT' ? result.outputValue : null,
        quantity_after: state.quantity,
        average_unit_cost_after: status === VALUATION_STATUS.VALUED ? state.average : null,
        balance_value_after: status === VALUATION_STATUS.VALUED ? state.value : null,
        valuation_status: status,
        valuation_reason: reason,
      });
    }
    return { entries, exceptions, balances: states, mutated: false };
  }

  comparePhysical(preview, physicalRows) {
    const differences = [];
    for (const row of physicalRows) {
      const key = locationKey(row);
      const valued = preview.balances.get(key);
      const physical = Number(row.stock);
      const reconstructed = valued ? Number(valued.quantity) : 0;
      if (Math.abs(round(physical) - round(reconstructed)) > 0.0001) {
        differences.push({
          id_product: row.id_product, id_sucursal: row.id_sucursal, id_storage: row.id_storage,
          physical_stock: physical, reconstructed_stock: reconstructed,
          difference: round(physical - reconstructed),
        });
      }
    }
    return { valid: differences.length === 0, differences };
  }

  validatedLocations(preview, parity) {
    const invalid = new Set([
      ...preview.exceptions.map(locationKey),
      ...parity.differences.map(locationKey),
    ]);
    return new Set([...preview.balances.keys()].filter((key) => !invalid.has(key)));
  }

  async applyValidated({ preview, parity, writer, transaction }) {
    const validLocations = this.validatedLocations(preview, parity);
    const entries = preview.entries
      .filter((entry) => validLocations.has(locationKey(entry)))
      .map((entry) => ({
        movement_date: entry.date,
        source_sequence: Number(entry.stable_key.split('|')[1]),
        source_type: entry.source_type,
        source_id: String(entry.id_movement),
        source_detail_id: String(entry.id),
        effect_type: `BACKFILL_${entry.type}`,
        id_product: entry.id_product,
        id_sucursal: entry.id_sucursal,
        id_storage: entry.id_storage,
        id_user: entry.id_user ?? null,
        quantity_input: Number(entry.quantity_input || 0),
        quantity_output: Number(entry.quantity_output || 0),
        applied_unit_cost: entry.applied_unit_cost,
        input_value: entry.input_value,
        output_value: entry.output_value,
        quantity_after: entry.quantity_after,
        average_unit_cost_after: entry.average_unit_cost_after,
        balance_value_after: entry.balance_value_after,
        valuation_status: entry.valuation_status,
        valuation_reason: entry.valuation_reason,
        original_entry_id: null,
      }));
    const balances = [...preview.balances.entries()]
      .filter(([key]) => validLocations.has(key))
      .map(([key, balance]) => {
        const [id_product, id_sucursal, id_storage] = key.split(':').map(Number);
        return {
          id_product, id_sucursal, id_storage,
          quantity: balance.quantity,
          average_unit_cost: balance.average,
          balance_value: balance.value,
          valuation_status: balance.status,
          valuation_reason: null,
        };
      });
    await writer.upsertEntries(entries, transaction);
    await writer.upsertBalances(balances, transaction);
    return { locations: validLocations.size, entries: entries.length, balances: balances.length };
  }
}

module.exports = { ValuedKardexRebuilder, locationKey };
