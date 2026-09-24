'use strict';

const db = require('../database/config');
const { MissingCostBasisError, ValuedBalanceDiscontinuityError } = require('../errors/valued-kardex.error');
const { ValuedInventoryRepository } = require('../repositories/valued-inventory.repository');
const { SOURCE_CONTRACTS, VALUATION_STATUS } = require('./valued-kardex-contract.service');
const { applyEntry, applyOutput, round, valueOf } = require('./weighted-average.service');

class ValuedKardexService {
  constructor({ sequelize = db.sequelize, repository = new ValuedInventoryRepository() } = {}) {
    this.sequelize = sequelize;
    this.repository = repository;
  }

  async executeAtomic({ operation, movement }) {
    return this.sequelize.transaction(async (transaction) => {
      const operationResult = await operation(transaction);
      const entry = await this.recordMovement({ ...movement, transaction });
      return { operationResult, entry };
    });
  }

  async recordMovement({
    sourceType, sourceId, sourceDetailId = null, effectType,
    id_product, id_sucursal, id_storage, id_user = null,
    direction, quantity, unitCost = null, movementDate = new Date(),
    expectedQuantityBefore, originalEntryId = null, allowUnvalued = false, historicalUnitCost = null,
    transaction,
  }) {
    if (!transaction) throw new TypeError('La valoración debe ejecutarse dentro de una transacción.');
    // Allows legacy deployments and isolated unit doubles to keep operating until the
    // valued-ledger migration is available. Production always exposes both models.
    if (this.repository instanceof ValuedInventoryRepository
      && (!this.repository.Entry?.findOne || !this.repository.Balance?.findOne || !transaction.LOCK || !transaction.uuid)) return null;
    const source = {
      source_type: sourceType,
      source_id: String(sourceId),
      source_detail_id: sourceDetailId == null ? null : String(sourceDetailId),
      effect_type: effectType,
    };
    const existing = await this.repository.findEntry(source, transaction);
    if (existing) return existing;

    const location = { id_product, id_sucursal, id_storage };
    const balance = await this.repository.lockBalance(location, transaction);
    const quantityBefore = Number(balance.quantity || 0);
    const valueBefore = Number(balance.balance_value || 0);
    const averageBefore = balance.average_unit_cost == null ? null : Number(balance.average_unit_cost);
    if (expectedQuantityBefore !== undefined && round(expectedQuantityBefore) !== round(quantityBefore)) {
      throw new ValuedBalanceDiscontinuityError(location);
    }

    let result;
    let status = VALUATION_STATUS.VALUED;
    let reason = null;
    try {
      if (direction === 'INPUT') {
        if (unitCost === null || unitCost === undefined) throw new MissingCostBasisError(location);
        result = applyEntry({ quantityBefore, valueBefore, quantity, unitCost });
      } else if (direction === 'OUTPUT') {
        result = applyOutput({ quantityBefore, valueBefore, quantity, averageBefore,
          appliedUnitCost: historicalUnitCost === null ? averageBefore : historicalUnitCost });
      } else {
        throw new TypeError(`Dirección de valoración no soportada: ${direction}`);
      }
    } catch (error) {
      if (!allowUnvalued || !['VALUED_KARDEX_COST_BASIS_MISSING'].includes(error.code)) throw error;
      status = VALUATION_STATUS.UNVALUED;
      reason = error.message;
      result = {
        quantityAfter: direction === 'INPUT' ? round(quantityBefore + Number(quantity)) : round(quantityBefore - Number(quantity)),
        valueAfter: null,
        averageAfter: null,
        appliedUnitCost: null,
        outputValue: null,
      };
    }

    const contract = SOURCE_CONTRACTS[sourceType] || SOURCE_CONTRACTS.ADJUSTMENT;
    const inputValue = direction === 'INPUT' && result.appliedUnitCost !== null
      ? valueOf(quantity, result.appliedUnitCost) : null;
    const outputValue = direction === 'OUTPUT' ? result.outputValue : null;
    const entry = await this.repository.createEntry({
      movement_date: movementDate,
      source_sequence: contract.sequence,
      ...source,
      ...location,
      id_user,
      quantity_input: direction === 'INPUT' ? quantity : 0,
      quantity_output: direction === 'OUTPUT' ? quantity : 0,
      applied_unit_cost: result.appliedUnitCost,
      input_value: inputValue,
      output_value: outputValue,
      quantity_after: result.quantityAfter,
      average_unit_cost_after: result.averageAfter,
      balance_value_after: result.valueAfter,
      valuation_status: status,
      valuation_reason: reason,
      original_entry_id: originalEntryId,
    }, transaction);

    await this.repository.saveBalance(balance, {
      quantity: result.quantityAfter,
      average_unit_cost: result.averageAfter,
      balance_value: result.valueAfter ?? 0,
      valuation_status: status,
      valuation_reason: reason,
      last_entry_id: entry.id,
    }, transaction);
    return entry;
  }

  async recordReversal({ originalEntry, sourceType, sourceId, sourceDetailId = null, effectType = 'REVERSAL', id_user, movementDate = new Date(), transaction }) {
    if (!originalEntry) throw new TypeError('La reversión requiere el movimiento valorado original.');
    const originalDirection = Number(originalEntry.quantity_input || 0) > 0 ? 'INPUT' : 'OUTPUT';
    return this.recordMovement({
      sourceType, sourceId, sourceDetailId, effectType, id_user, movementDate, transaction,
      id_product: originalEntry.id_product, id_sucursal: originalEntry.id_sucursal, id_storage: originalEntry.id_storage,
      direction: originalDirection === 'INPUT' ? 'OUTPUT' : 'INPUT',
      quantity: Number(originalEntry.quantity_input || originalEntry.quantity_output),
      unitCost: originalEntry.applied_unit_cost,
      historicalUnitCost: originalEntry.applied_unit_cost,
      originalEntryId: originalEntry.id,
    });
  }

  async reverseOriginal({ originalSourceType, originalSourceId, originalSourceDetailId = null, originalEffectType = 'ORIGINAL', ...command }) {
    if (this.repository instanceof ValuedInventoryRepository
      && (!this.repository.Entry?.findOne || !this.repository.Balance?.findOne || !command.transaction?.LOCK || !command.transaction?.uuid)) return null;
    const originalEntry = await this.repository.findEntry({
      source_type: originalSourceType,
      source_id: String(originalSourceId),
      source_detail_id: originalSourceDetailId == null ? null : String(originalSourceDetailId),
      effect_type: originalEffectType,
    }, command.transaction);
    if (!originalEntry) throw new MissingCostBasisError({
      id_product: command.id_product, id_sucursal: command.id_sucursal, id_storage: command.id_storage,
    });
    return this.recordReversal({ originalEntry, ...command });
  }
}

module.exports = { ValuedKardexService };
