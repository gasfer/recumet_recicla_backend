const { exactAdd } = require('./number-formatter');

// A reprint reads persisted quantities; the current input policy must not
// reinterpret an older receipt.
const roundQuantity = (value) => Number(exactAdd(value || 0, 0));

const productLabel = (product) => product
  ? `${product.cod || ''} - ${product.name || ''}`.trim()
  : '-';

const buildTransferVoucherReconciliation = (reviewNotes = []) => {
  const rows = [];
  const totals = { excess: '0.0000', shortage: '0.0000' };

  for (const note of reviewNotes) {
    const isExcess = note.type === 'EXCEDENTE_PARA_REVISION';
    const type = isExcess ? 'EXCEDENTE' : 'FALTANTE';

    for (const detail of note.details || []) {
      const difference = roundQuantity(detail.quantity_difference);
      const movementReferences = (detail.resolutionActions || [])
        .flatMap((action) => action.movementLinks || [])
        .map((link) => `#${link.id_kardex_movement}`)
        .join(', ') || '-';

      rows.push({
        originProduct: productLabel(detail.product),
        type,
        sent: roundQuantity(detail.quantity_sent),
        received: roundQuantity(detail.quantity_received),
        difference,
        resolved: roundQuantity(detail.quantity_resolved),
        status: detail.reconciliation_status || note.reconciliation_status,
        responsible: note.assignedUser?.full_names || 'SIN ASIGNAR',
        destinationProduct: productLabel(isExcess ? detail.product : note.registeredProduct),
        movementReferences,
      });

      totals[isExcess ? 'excess' : 'shortage'] = exactAdd(totals[isExcess ? 'excess' : 'shortage'], difference);
    }
  }

  return { rows, totals };
};

module.exports = { buildTransferVoucherReconciliation, roundQuantity };
