'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mapOpenReviewNote } = require('../services/open-reception-review-query.service');
const { buildTransferVoucherSummary } = require('../helpers/transfer-reception');
const workflowService = require('../services/transfer-review-workflow.service');

test('4.1 mapOpenReviewNote excluye ítems dentro de tolerancia aceptados', () => {
  const note = {
    id: 10,
    registry_number: 'NTR-000010',
    type: 'EXCEDENTE_PARA_REVISION',
    reconciliation_status: 'EN_REVISION',
    details: [
      {
        id: 1,
        id_detail_transfer: 101,
        quantity_difference: 0.5,
        quantity_resolved: 0,
        reconciliation_status: 'EN_REVISION',
        transferDetail: { id: 101, tolerance_decision: 'ACCEPTED', accounting_status: 'CONTABILIZADO' },
      },
      {
        id: 2,
        id_detail_transfer: 102,
        quantity_difference: 15,
        quantity_resolved: 0,
        reconciliation_status: 'EN_REVISION',
        transferDetail: { id: 102, tolerance_decision: 'REQUIRES_REVIEW', accounting_status: 'PENDIENTE_CONCILIACION' },
      },
    ],
  };

  const mapped = mapOpenReviewNote(note);
  assert.equal(mapped.details.length, 1);
  assert.equal(mapped.details[0].id, 2);
  assert.equal(mapped.details[0].quantity_difference, 15);
  assert.equal(mapped.pending_items, 1);
});

test('4.2 getTransferTraceability refleja medición física, recepción normal, diferencia bloqueada, documento y estado en boleta mixta', async (t) => {
  const mockTransfer = {
    id: 99,
    cod: 'TRAS-00099',
    status: 'RECEIVED',
    id_sucursal_received: 2,
    id_storage_received: 3,
    sucursal_send: { id: 1, name: 'ORIGEN' },
    sucursal_received: { id: 2, name: 'DESTINO' },
    storage_send: { id: 1, name: 'ALM ORIGEN' },
    storage_received: { id: 3, name: 'ALM DESTINO' },
    user_send: { id: 1, full_names: 'USUARIO ENVIA' },
    user_received: { id: 2, full_names: 'USUARIO RECIBE' },
    detailsTransfers: [
      {
        id: 201,
        id_product: 10,
        quantity: '100',
        quantity_received: '100.5',
        tolerance_decision: 'ACCEPTED',
        accounting_status: 'CONTABILIZADO',
        receipt_difference_percentage: '0.50',
        product: { id: 10, cod: 'P-10', name: 'PRODUCTO EXACTO' },
      },
      {
        id: 202,
        id_product: 11,
        quantity: '100',
        quantity_received: '115',
        tolerance_decision: 'REQUIRES_REVIEW',
        accounting_status: 'PENDIENTE_CONCILIACION',
        receipt_difference_percentage: '15.00',
        product: { id: 11, cod: 'P-11', name: 'PRODUCTO EXCEDENTE' },
      },
      {
        id: 203,
        id_product: 12,
        quantity: '100',
        quantity_received: '90',
        tolerance_decision: 'REQUIRES_REVIEW',
        accounting_status: 'PENDIENTE_CONCILIACION',
        receipt_difference_percentage: '-10.00',
        product: { id: 12, cod: 'P-12', name: 'PRODUCTO FALTANTE' },
      },
    ],
    reviewNotes: [
      {
        id: 501,
        registry_number: 'NTR-000501',
        type: 'EXCEDENTE_PARA_REVISION',
        reconciliation_status: 'COMPLETADO',
        details: [
          {
            id: 1,
            id_detail_transfer: 202,
            id_product: 11,
            quantity_difference: '15',
            reconciliation_status: 'COMPLETADO',
            product: { id: 11, cod: 'P-11', name: 'PRODUCTO EXCEDENTE' },
          },
        ],
        resolutionActions: [
          { id: 1, strategy: 'CONFIRM_DIFFERENCE', quantity: '15', movementLinks: [] },
        ],
      },
      {
        id: 502,
        registry_number: 'NTR-000502',
        type: 'FALTANTE_PARA_REVISION',
        reconciliation_status: 'EN_REVISION',
        details: [
          {
            id: 2,
            id_detail_transfer: 203,
            id_product: 12,
            quantity_difference: '10',
            reconciliation_status: 'EN_REVISION',
            product: { id: 12, cod: 'P-12', name: 'PRODUCTO FALTANTE' },
          },
        ],
        resolutionActions: [],
      },
    ],
  };

  const { Transfers } = require('../database/config');
  const historicalService = require('../services/historical-transfer-difference.service');
  const stockAvail = require('../services/stock-availability.service');

  t.mock.method(Transfers, 'findByPk', async () => mockTransfer);
  t.mock.method(historicalService, 'getProjection', async () => null);
  t.mock.method(stockAvail, 'getStockKardexIrregularities', async () => [
    {
      id_product: 99,
      cod: 'IRR-01',
      traceable_transfers: [{ transfer_id: 99 }],
      physical_stock: 50,
      kardex_balance: 40,
    },
  ]);

  const trace = await workflowService.getTransferTraceability(99);

  // Verificación de irregularidades independientes visibles
  assert.equal(trace.stock_kardex_irregularities.length, 1);
  assert.equal(trace.stock_kardex_irregularities[0].cod, 'IRR-01');

  // Verificación de ítem dentro de tolerancia (aceptado)
  const item1 = trace.detailsTransfers.find((d) => d.id === 201);
  assert.equal(item1.quantity_sent, 100);
  assert.equal(item1.quantity_physical_received, 100.5);
  assert.equal(item1.quantity_normal_received, 100.5);
  assert.equal(item1.quantity_blocked_difference, 0);
  assert.equal(item1.receipt_difference_percentage, 0.5);
  assert.equal(item1.release_status, 'ACEPTADO');
  assert.equal(item1.blocked_document, null);

  // Verificación de excedente fuera de tolerancia resuelto (liberado)
  const item2 = trace.detailsTransfers.find((d) => d.id === 202);
  assert.equal(item2.quantity_sent, 100);
  assert.equal(item2.quantity_physical_received, 115);
  assert.equal(item2.quantity_normal_received, 100);
  assert.equal(item2.quantity_blocked_difference, 15);
  assert.equal(item2.release_status, 'LIBERADO');
  assert.equal(item2.blocked_document.registry_number, 'NTR-000501');

  // Verificación de faltante fuera de tolerancia pendiente (bloqueado)
  const item3 = trace.detailsTransfers.find((d) => d.id === 203);
  assert.equal(item3.quantity_sent, 100);
  assert.equal(item3.quantity_physical_received, 90);
  assert.equal(item3.quantity_normal_received, 90);
  assert.equal(item3.quantity_blocked_difference, 10);
  assert.equal(item3.release_status, 'BLOQUEADO');
  assert.equal(item3.blocked_document.registry_number, 'NTR-000502');
});

test('4.3 Guía de recepción: cálculo por ítem y total contable en impresión inicial y reimpresión', () => {
  const mixedDetails = [
    {
      id: 1,
      quantity: 100,
      quantity_received: 100.5,
      tolerance_decision: 'ACCEPTED',
      accounting_status: 'CONTABILIZADO',
      product: { unit: { siglas: 'KGR' } },
      observation: 'Dentro de rango',
    },
    {
      id: 2,
      quantity: 100,
      quantity_received: 115,
      tolerance_decision: 'REQUIRES_REVIEW',
      accounting_status: 'PENDIENTE_CONCILIACION',
      product: { unit: { siglas: 'KGR' } },
      observation: 'Excedente en revisión',
    },
    {
      id: 3,
      quantity: 100,
      quantity_received: 90,
      tolerance_decision: 'REQUIRES_REVIEW',
      accounting_status: 'PENDIENTE_CONCILIACION',
      product: { unit: { siglas: 'KGR' } },
      observation: 'Faltante en revisión',
    },
  ];

  // Caso 1: Impresión inicial (notas abiertas en revisión)
  const initialNotes = [
    {
      id: 1,
      reconciliation_status: 'EN_REVISION',
      details: [{ id_detail_transfer: 2, reconciliation_status: 'EN_REVISION' }],
    },
    {
      id: 2,
      reconciliation_status: 'EN_REVISION',
      details: [{ id_detail_transfer: 3, reconciliation_status: 'EN_REVISION' }],
    },
  ];

  const initialSummary = buildTransferVoucherSummary(mixedDetails, 'RECEIVED', initialNotes);
  assert.equal(initialSummary.rows[0].status, 'ACEPTADO');
  assert.equal(initialSummary.rows[0].normal, 100.5);
  assert.equal(initialSummary.rows[0].blocked, 0);

  assert.equal(initialSummary.rows[1].status, 'EN REVISIÓN');
  assert.equal(initialSummary.rows[1].normal, 100);
  assert.equal(initialSummary.rows[1].blocked, 15);

  assert.equal(initialSummary.rows[2].status, 'EN REVISIÓN');
  assert.equal(initialSummary.rows[2].normal, 90);
  assert.equal(initialSummary.rows[2].blocked, 10);

  // Total contable disponible inicial = solo normal + aceptado = 100.5 + 100 + 90 = 290.5
  assert.equal(initialSummary.totals.normal, 290.5);
  assert.equal(initialSummary.totals.blocked, 25);
  assert.equal(initialSummary.totals.accountedTotal, 290.5);

  // Caso 2: Reimpresión tras resolución del ítem 2
  const resolvedNotes = [
    {
      id: 1,
      reconciliation_status: 'COMPLETADO',
      details: [{ id_detail_transfer: 2, reconciliation_status: 'COMPLETADO' }],
    },
    {
      id: 2,
      reconciliation_status: 'EN_REVISION',
      details: [{ id_detail_transfer: 3, reconciliation_status: 'EN_REVISION' }],
    },
  ];

  const resolvedSummary = buildTransferVoucherSummary(mixedDetails, 'RECEIVED', resolvedNotes);
  assert.equal(resolvedSummary.rows[1].status, 'LIBERADO');
  // Total contable disponible incluye ahora la diferencia liberada de 15 kg: 290.5 + 15 = 305.5
  assert.equal(resolvedSummary.totals.accountedTotal, 305.5);
  assert.equal(resolvedSummary.totals.blocked, 10);
});
