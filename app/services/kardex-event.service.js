const EVENT_DEFINITIONS = Object.freeze({
  INPUT: { event_type: 'PURCHASE', event_label: 'COMPRA / INGRESO' },
  OUTPUT: { event_type: 'SALE', event_label: 'VENTA / SALIDA' },
  CLASIFIED: { event_type: 'CLASSIFICATION', event_label: 'CLASIFICACIÓN' },
});

const KARDEX_HISTORY_ATTRIBUTES = Object.freeze([
  'type', 'date', 'id_movement', 'type_movement', 'registry_number', 'detail', 'sub_detail',
  'id_product', 'id_sucursal', 'id_storage', 'quantity', 'quantity_input', 'quantity_output',
  'cost_unitario', 'cost_input', 'cost_output', 'saldo_inicial', 'saldo', 'cost_saldo',
]);

const includesAny = (value, terms) => terms.some((term) => value.includes(term));

const classifyKardexEvent = ({ type, type_movement, sub_detail, detail } = {}) => {
  const movementType = String(type_movement || '').toUpperCase();
  const description = `${sub_detail || ''} ${detail || ''}`.toUpperCase();
  const direction = type === 'INPUT' ? 'INPUT' : type === 'OUTPUT' ? 'OUTPUT' : 'UNKNOWN';

  if (movementType === 'TRANSFER') {
    return {
      event_type: direction === 'INPUT' ? 'TRANSFER_RECEIVED' : 'TRANSFER_SENT',
      event_label: direction === 'INPUT' ? 'TRASLADO RECIBIDO' : 'TRASLADO ENVIADO',
      event_direction: direction,
      is_reversal: false,
    };
  }

  if (movementType === 'KMOVEMENT') {
    const isReversal = includesAny(description, ['REVERS', 'ANUL']);
    const isReconciliation = includesAny(description, ['CONCILIA', 'FALTANTE', 'EXCEDENTE', 'DIFERENCIA']);
    const isPhysicalAdjustment = includesAny(description, ['AJUSTE', 'CONTEO FÍSICO', 'CONTEO FISICO', 'AKFP']);
    return {
      event_type: isReversal ? 'REVERSAL' : isReconciliation ? 'RECONCILIATION' : isPhysicalAdjustment ? 'PHYSICAL_ADJUSTMENT' : 'MANUAL_MOVEMENT',
      event_label: isReversal ? 'REVERSIÓN' : isReconciliation ? 'CONCILIACIÓN' : isPhysicalAdjustment ? 'AJUSTE FÍSICO' : 'MOVIMIENTO MANUAL',
      event_direction: direction,
      is_reversal: isReversal,
    };
  }

  const definition = EVENT_DEFINITIONS[movementType];
  return {
    event_type: definition?.event_type || 'OTHER',
    event_label: definition?.event_label || 'OTRO MOVIMIENTO',
    event_direction: direction,
    is_reversal: false,
  };
};

const attachKardexEventMetadata = (row) => {
  const values = row?.dataValues || row;
  Object.assign(values, classifyKardexEvent(values));
  return row;
};

module.exports = { KARDEX_HISTORY_ATTRIBUTES, classifyKardexEvent, attachKardexEventMetadata };
