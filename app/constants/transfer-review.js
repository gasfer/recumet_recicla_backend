'use strict';

const REVIEW_STATUSES = Object.freeze({
  IN_REVIEW: 'EN_REVISION',
  PARTIAL: 'PARCIAL',
  COMPLETED: 'COMPLETADO',
});

const DETAIL_REVIEW_STATUSES = Object.freeze({
  IN_REVIEW: 'EN_REVISION',
  COMPLETED: 'COMPLETADO',
});

const REVIEW_HOLD_DISPOSITIONS = Object.freeze({
  IN_REVIEW: 'EN_REVISION',
  RETAINED_WITHOUT_ADJUSTMENT: 'RETENIDO_SIN_AJUSTE',
  RELEASED_BY_ADJUSTMENT: 'LIBERADO_POR_AJUSTE',
});

const DOCUMENTARY_REVIEW_REASONS = Object.freeze({
  EXCEDENTE_PARA_REVISION: Object.freeze({
    DIFERENCIA_BALANZAS: Object.freeze({
      requiresAuthorizer: true,
    }),
    MATERIAL_INCORRECTO: Object.freeze({
      requiredReferences: Object.freeze(['NOTA_CLASIFICACION']),
      requiresAuthorizer: true,
    }),
    DISCREPANCIA_FISICO_SISTEMA: Object.freeze({
      requiredReferences: Object.freeze(['ACTA_REGULARIZACION']),
      requiresAuthorizer: true,
    }),
    ERROR_PESO_REGISTRADO: Object.freeze({
      requiredReferences: Object.freeze(['TICKET_BALANZA']),
      requiresAuthorizer: true,
    }),
    ERROR_DIGITACION: Object.freeze({
      requiredReferences: Object.freeze(['NOTA_CORREGIDA']),
      requiresAuthorizer: true,
    }),
    MAYOR_CANTIDAD_RECIBIDA: Object.freeze({ requiresEvidence: false }),
    TOLERANCIA_ACEPTADA: Object.freeze({ requiresEvidence: false }),
    PROCEDENCIA_DOCUMENTADA: Object.freeze({ requiresEvidence: true }),
    OTRO: Object.freeze({ requiresEvidence: false }),
  }),
  FALTANTE_PARA_REVISION: Object.freeze({
    DIFERENCIA_BALANZAS: Object.freeze({
      requiresAuthorizer: true,
    }),
    MATERIAL_INCORRECTO: Object.freeze({
      requiredReferences: Object.freeze(['NOTA_CLASIFICACION']),
      requiresAuthorizer: true,
    }),
    DISCREPANCIA_FISICO_SISTEMA: Object.freeze({
      requiredReferences: Object.freeze(['ACTA_REGULARIZACION']),
      requiresAuthorizer: true,
    }),
    ERROR_PESO_REGISTRADO: Object.freeze({
      requiredReferences: Object.freeze(['TICKET_BALANZA']),
      requiresAuthorizer: true,
    }),
    PERDIDA_TRANSITO: Object.freeze({
      requiredReferences: Object.freeze(['ACTA_INCIDENCIA']),
      requiresAuthorizer: true,
    }),
    ERROR_DIGITACION: Object.freeze({
      requiredReferences: Object.freeze(['NOTA_CORREGIDA']),
      requiresAuthorizer: true,
    }),
    FALTANTE_CONFIRMADO: Object.freeze({ requiresEvidence: false }),
    PERDIDA_MERMA_DOCUMENTADA: Object.freeze({ requiresEvidence: true }),
    DIFERENCIA_ACEPTADA: Object.freeze({ requiresEvidence: false }),
    OTRO: Object.freeze({ requiresEvidence: false }),
  }),
});

const DOCUMENTARY_REVIEW_OUTCOMES = Object.freeze({
  EXCEDENTE_PARA_REVISION: 'EXCEDENTE_REGULARIZADO_VERIFICADO',
  FALTANTE_PARA_REVISION: 'FALTANTE_REGULARIZADO_VERIFICADO',
});

const REVIEW_PERMISSION_ACTIONS = Object.freeze({
  read: 'view',
  assign: 'create',
  resolve: 'update',
  reopen: 'delete',
  approve: 'reports',
});

const REVIEW_PERMISSION_MODULE = 'TRANSFER_REVIEW';

const AUTOMATIC_RECONCILIATION_REASONS = Object.freeze({
  DIFERENCIA_BALANZAS: Object.freeze({
    label: 'Diferencia de peso entre balanzas',
    requiredReferences: Object.freeze([]),
    solutions: Object.freeze({
      EXCEDENTE_PARA_REVISION: Object.freeze(['CONFIRM_DIFFERENCE', 'TRANSFER_RETURN', 'CLASSIFY_EXCESS']),
      FALTANTE_PARA_REVISION: Object.freeze(['CONFIRM_DIFFERENCE', 'CLASSIFY_SHORTAGE']),
    }),
  }),
  MATERIAL_INCORRECTO: Object.freeze({
    label: 'Material incorrecto o no corresponde',
    requiredReferences: Object.freeze(['NOTA_CLASIFICACION']),
    solutions: Object.freeze({
      EXCEDENTE_PARA_REVISION: Object.freeze(['CLASSIFY_EXCESS']),
      FALTANTE_PARA_REVISION: Object.freeze(['CLASSIFY_SHORTAGE']),
    }),
  }),
  DISCREPANCIA_FISICO_SISTEMA: Object.freeze({
    label: 'Discrepancia física versus sistema',
    requiredReferences: Object.freeze(['ACTA_REGULARIZACION']),
    solutions: Object.freeze({
      EXCEDENTE_PARA_REVISION: Object.freeze(['CONFIRM_DIFFERENCE']),
      FALTANTE_PARA_REVISION: Object.freeze(['CONFIRM_DIFFERENCE']),
    }),
  }),
  ERROR_PESO_REGISTRADO: Object.freeze({
    label: 'Error en el peso registrado',
    requiredReferences: Object.freeze(['TICKET_BALANZA']),
    solutions: Object.freeze({
      EXCEDENTE_PARA_REVISION: Object.freeze(['CONFIRM_DIFFERENCE']),
      FALTANTE_PARA_REVISION: Object.freeze(['CONFIRM_DIFFERENCE']),
    }),
  }),
  ERROR_REGISTRO_RECEPCION: Object.freeze({
    label: 'Error de registro en la recepción',
    requiredReferences: Object.freeze([]),
    solutions: Object.freeze({
      EXCEDENTE_PARA_REVISION: Object.freeze(['REGISTER_RECEIPT_SURPLUS']),
      FALTANTE_PARA_REVISION: Object.freeze(['REGISTER_RECEIPT_SHORTAGE']),
    }),
  }),
  PERDIDA_TRANSITO: Object.freeze({
    label: 'Pérdida o extravío en traslado',
    requiredReferences: Object.freeze(['ACTA_INCIDENCIA']),
    solutions: Object.freeze({
      FALTANTE_PARA_REVISION: Object.freeze(['CONFIRM_DIFFERENCE']),
    }),
  }),
  FALTANTE_LOCALIZADO: Object.freeze({
    label: 'Faltante localizado e ingresado físicamente',
    requiredReferences: Object.freeze([]),
    solutions: Object.freeze({
      FALTANTE_PARA_REVISION: Object.freeze(['LOCATE_SHORTAGE']),
    }),
  }),
  ERROR_DIGITACION: Object.freeze({
    label: 'Error de digitación o carga',
    requiredReferences: Object.freeze(['NOTA_CORREGIDA']),
    solutions: Object.freeze({
      EXCEDENTE_PARA_REVISION: Object.freeze(['CONFIRM_DIFFERENCE', 'CLASSIFY_EXCESS']),
      FALTANTE_PARA_REVISION: Object.freeze(['CONFIRM_DIFFERENCE', 'CLASSIFY_SHORTAGE']),
    }),
  }),
});

const RECONCILIATION_SPECIFIC_EFFECTS = Object.freeze({
  CONFIRM_DIFFERENCE: 'AJUSTAR',
  REGISTER_RECEIPT_SHORTAGE: 'LIBERAR',
  REGISTER_RECEIPT_SURPLUS: 'LIBERAR',
  TRANSFER_RETURN: 'REVERTIR',
  CLASSIFY_SHORTAGE: 'RECLASIFICAR',
  CLASSIFY_EXCESS: 'RECLASIFICAR',
  LOCATE_SHORTAGE: 'RECLASIFICAR',
});

module.exports = {
  REVIEW_STATUSES,
  DETAIL_REVIEW_STATUSES,
  REVIEW_HOLD_DISPOSITIONS,
  DOCUMENTARY_REVIEW_REASONS,
  DOCUMENTARY_REVIEW_OUTCOMES,
  REVIEW_PERMISSION_ACTIONS,
  REVIEW_PERMISSION_MODULE,
  AUTOMATIC_RECONCILIATION_REASONS,
  RECONCILIATION_SPECIFIC_EFFECTS,
};
