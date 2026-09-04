'use strict';

const FUNCTION_NAME = 'reconciliation_has_explicit_kardex';

// Only the document's original legs are replaced. A transfer's eventual receipt
// still comes from its ordinary document; explicit compensation remains visible.
const useExplicitReconciliationMovements = (definition, functionName = FUNCTION_NAME) => {
  if (!/^(?:pg_temp\.)?reconciliation_has_explicit_kardex$/.test(functionName)) {
    throw new Error('Invalid Kardex predicate function');
  }
  const branches = definition.split(/\bUNION ALL\b/);
  let changed = 0;
  const result = branches.map((branch) => {
    let predicate;
    if (/FROM\s+(?:\w+\.)?details_transfers dt/.test(branch) && /'OUTPUT'(?:::text)? AS type/.test(branch)) {
      predicate = `${functionName}('TRANSFER', tr.id)`;
    } else if (/FROM\s+(?:\w+\.)?details_classifieds dc/.test(branch)) {
      predicate = `${functionName}('CLASSIFIED', cl.id)`;
    } else if (/FROM\s+(?:\w+\.)?classifieds\s+WHERE/.test(branch)) {
      predicate = `${functionName}('CLASSIFIED', classifieds.id)`;
    }
    if (!predicate) return branch;
    if (branch.includes(FUNCTION_NAME)) throw new Error('Kardex reconciliation predicate already installed');
    changed += 1;
    return branch.replace(/\s+$/, '') + ` AND NOT ${predicate}\n        `;
  }).join('UNION ALL');
  if (changed !== 3) throw new Error(`Expected three operational Kardex branches, found ${changed}`);
  return result;
};

const removeExplicitReconciliationMovements = (definition) => {
  let removed = 0;
  const result = definition.replace(
    /\s+AND NOT (?:(?:public|pg_temp(?:_\d+)?)\.)?reconciliation_has_explicit_kardex\('(TRANSFER|CLASSIFIED)'(?:::text)?,\s*(?:tr|cl|classifieds)\.id\)/g,
    () => { removed += 1; return ''; },
  );
  if (removed !== 3) throw new Error(`Expected three Kardex predicates to remove, found ${removed}`);
  return result;
};

const explicitKardexFunctionSql = (functionName = FUNCTION_NAME) => {
  if (!/^(?:pg_temp\.)?reconciliation_has_explicit_kardex$/.test(functionName)) throw new Error('Invalid Kardex predicate function');
  return `CREATE FUNCTION ${functionName}(document_type text, document_id integer)
    RETURNS boolean LANGUAGE sql STABLE AS $function$
      SELECT EXISTS (
        SELECT 1
        FROM transfer_review_resolution_actions a
        JOIN transfer_review_action_movements link
          ON link.id_transfer_review_resolution_action = a.id
        JOIN kardex_movements km ON km.id = link.id_kardex_movement
        WHERE a.operation_mode = 'CREATED_AUTOMATICALLY'
          AND a.operation_type = document_type AND a.operation_id = document_id
          AND link.movement_role = 'ORIGINAL' AND km.status = true
      )
    $function$;`;
};

module.exports = { FUNCTION_NAME, explicitKardexFunctionSql, useExplicitReconciliationMovements, removeExplicitReconciliationMovements };
