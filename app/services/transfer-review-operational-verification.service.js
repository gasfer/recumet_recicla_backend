'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  Classified,
  DetailsClassified,
  Transfers,
  DetailsTransfers,
} = require('../database/config');

const EPSILON = 0.0001;
const CLASSIFICATION_TYPE = 'NOTA_CLASIFICACION_MERMA';
const EXCESS_TRANSFER_TYPE = 'NOTA_TRASLADO_ORIGEN';
const SHORTAGE_TRANSFER_TYPE = 'NOTA_TRASLADO_COMPLEMENTARIO';

const verificationError = (message) => Object.assign(new Error(message), { statusCode: 422 });

const findOperationalReference = (reviewType, references) => {
  const allowedTypes = reviewType === 'EXCEDENTE_PARA_REVISION'
    ? [CLASSIFICATION_TYPE, EXCESS_TRANSFER_TYPE]
    : [CLASSIFICATION_TYPE, SHORTAGE_TRANSFER_TYPE];
  const selected = references.find(({ document_type: type }) => allowedTypes.includes(type));
  if (!selected) {
    const action = reviewType === 'EXCEDENTE_PARA_REVISION'
      ? 'realice una clasificación a merma o un traslado de devolución al almacén de origen'
      : 'realice una clasificación a merma o un traslado complementario desde el almacén de origen';
    throw verificationError(`La diferencia aún no está regularizada. Primero ${action} y registre su número.`);
  }
  return selected;
};

const lockOperationalDocument = async (type, id, transaction) => {
  await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
    replacements: { key: `transfer-review:${type}:${id}` },
    transaction,
  });
};

const getUsedQuantity = async (type, id, transaction) => {
  const [rows] = await sequelize.query(`
    SELECT COALESCE(SUM(e.quantity), 0) AS used_quantity
    FROM (
      SELECT a.quantity
      FROM transfer_review_resolution_actions a
      WHERE a.operation_mode = 'VERIFIED_EXISTING'
        AND a.operation_type = :type
        AND a.operation_id = :numericId
        AND a.management_status = 'ACTIVA'
        AND a.operation_status <> 'REVERSED'
      UNION ALL
      SELECT (ev.metadata->>'quantity')::numeric
      FROM transfer_review_events ev
      LEFT JOIN transfer_review_resolution_actions a
        ON a.id = NULLIF(ev.metadata->>'action_id', '')::integer
      WHERE ev.event_type = 'SIN_AJUSTE_INVENTARIO'
        AND ev.metadata->>'operational_verification' = 'true'
        AND ev.metadata->>'operational_document_type' = :type
        AND ev.metadata->>'operational_document_id' = :id
        AND (a.id IS NULL OR a.operation_id IS NULL)
        AND (a.id IS NULL OR a.management_status = 'ACTIVA')
    ) e
  `, {
    replacements: { type, id: String(id), numericId: Number(id) },
    transaction,
  });
  return Number(rows[0]?.used_quantity || 0);
};

const verifyClassification = async ({ note, detail, reference, quantity, transaction }) => {
  const classificationWhere = {
    status: 'ACTIVE',
    id_sucursal: note.id_sucursal,
    id_storage: note.id_storage,
    id_product: detail.id_product,
    [Op.or]: [
      { cod: reference.document_number },
      { number_registry: reference.document_number },
    ],
  };
  if (note.date) classificationWhere.date_classified = { [Op.gte]: note.date };
  const classified = await Classified.findOne({
    where: classificationWhere,
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!classified) {
    throw verificationError('No se encontró una clasificación activa con ese número para el producto, sucursal y almacén de esta diferencia. Primero realice la clasificación a merma.');
  }

  const mermaDetails = await DetailsClassified.findAll({
    where: { id_classified: classified.id, status: 'ACTIVE' },
    include: [{
      association: 'product',
      required: true,
      attributes: ['id'],
      include: [{ association: 'category', required: true, attributes: ['id'], where: { name: 'MERMAS' } }],
    }],
    transaction,
  });
  const documentQuantity = Math.min(
    Number(classified.quantity_product || 0),
    mermaDetails.reduce((total, item) => total + Number(item.quantity || 0), 0),
  );
  await lockOperationalDocument(CLASSIFICATION_TYPE, classified.id, transaction);
  const usedQuantity = await getUsedQuantity(CLASSIFICATION_TYPE, classified.id, transaction);
  if (usedQuantity + quantity - documentQuantity > EPSILON) {
    throw verificationError(`La clasificación ${classified.cod} no cubre la diferencia. Disponible para conciliar: ${Math.max(0, documentQuantity - usedQuantity).toFixed(4)}.`);
  }
  return {
    documentType: CLASSIFICATION_TYPE,
    documentId: classified.id,
    documentNumber: classified.cod,
    documentQuantity,
  };
};

const verifyTransfer = async ({ note, detail, reference, quantity, transaction }) => {
  const originalTransfer = await Transfers.findByPk(note.id_transfer, { transaction });
  if (!originalTransfer) throw verificationError('No se encontró el traslado original de la diferencia.');

  const transferWhere = {
    status: 'RECEIVED',
    id: { [Op.ne]: originalTransfer.id },
    [Op.or]: [
      { cod: reference.document_number },
      { registry_number: reference.document_number },
    ],
  };
  if (note.date) transferWhere.date_send = { [Op.gte]: note.date };
  const correctiveTransfer = await Transfers.findOne({
    where: transferWhere,
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!correctiveTransfer) {
    throw verificationError('No se encontró un traslado recibido con ese número. Primero complete la recepción del traslado correctivo.');
  }

  const isExcess = note.type === 'EXCEDENTE_PARA_REVISION';
  const validRoute = isExcess
    ? Number(correctiveTransfer.id_sucursal_send) === Number(note.id_sucursal)
      && Number(correctiveTransfer.id_storage_send) === Number(note.id_storage)
      && Number(correctiveTransfer.id_sucursal_received) === Number(originalTransfer.id_sucursal_send)
      && Number(correctiveTransfer.id_storage_received) === Number(originalTransfer.id_storage_send)
    : Number(correctiveTransfer.id_sucursal_send) === Number(originalTransfer.id_sucursal_send)
      && Number(correctiveTransfer.id_storage_send) === Number(originalTransfer.id_storage_send)
      && Number(correctiveTransfer.id_sucursal_received) === Number(note.id_sucursal)
      && Number(correctiveTransfer.id_storage_received) === Number(note.id_storage);
  if (!validRoute) {
    throw verificationError(isExcess
      ? 'El traslado indicado no devuelve material desde el almacén destino hacia el almacén de origen.'
      : 'El traslado indicado no es complementario desde el almacén de origen hacia el almacén destino.');
  }

  const transferDetails = await DetailsTransfers.findAll({
    where: { id_transfer: correctiveTransfer.id, id_product: detail.id_product, status: true },
    transaction,
  });
  const documentQuantity = transferDetails.reduce((total, item) => (
    total + Number(item.quantity_received ?? item.quantity ?? 0)
  ), 0);
  const documentType = isExcess ? EXCESS_TRANSFER_TYPE : SHORTAGE_TRANSFER_TYPE;
  await lockOperationalDocument(documentType, correctiveTransfer.id, transaction);
  const usedQuantity = await getUsedQuantity(documentType, correctiveTransfer.id, transaction);
  if (usedQuantity + quantity - documentQuantity > EPSILON) {
    throw verificationError(`El traslado ${correctiveTransfer.cod} no cubre la diferencia. Disponible para conciliar: ${Math.max(0, documentQuantity - usedQuantity).toFixed(4)}.`);
  }
  return {
    documentType,
    documentId: correctiveTransfer.id,
    documentNumber: correctiveTransfer.cod,
    documentQuantity,
  };
};

const verifyOperationalResolution = async ({ note, detail, references, quantity, transaction }) => {
  const reference = findOperationalReference(note.type, references);
  if (reference.document_type === CLASSIFICATION_TYPE) {
    return verifyClassification({ note, detail, reference, quantity, transaction });
  }
  return verifyTransfer({ note, detail, reference, quantity, transaction });
};

module.exports = { verifyOperationalResolution };
