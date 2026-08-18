'use strict';

const replaceExpected = (source, pattern, replacement, label) => {
  const result = source.replace(pattern, replacement);
  if (result === source) {
    throw new Error(`No se encontró ${label} al actualizar view_kardex_detalle.`);
  }
  return result;
};

module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT pg_get_viewdef('view_kardex_detalle'::regclass, true) AS definition;"
    );
    const previousDefinition = rows[0].definition;
    let definition = previousDefinition;
    definition = replaceExpected(
      definition,
      /movimientos\.date, movimientos\.type, movimientos\.id_movement, movimientos\.id/g,
      'movimientos.date, movimientos.movement_order, movimientos.id_movement, movimientos.id',
      'el orden de saldo de la vista'
    );

    for (const source of ['di.id', 'dt.id', 'dc.id', 'dot.id', 'classifieds.id']) {
      definition = replaceExpected(
        definition,
        new RegExp(`(${source.replace('.', '\\.')})\\n\\s+FROM`, 'g'),
        '$1,\n            0 AS movement_order\n           FROM',
        `el movimiento ${source}`
      );
    }
    definition = replaceExpected(
      definition,
      /km\.id\n\s+FROM kardex_movements km/,
      "km.id,\n            CASE WHEN km.details LIKE 'EXCEDENTE TRASPASO #%' THEN 1 ELSE 0 END AS movement_order\n           FROM kardex_movements km",
      'los movimientos de excedente'
    );

    await queryInterface.sequelize.query(`CREATE OR REPLACE VIEW view_kardex_detalle AS ${definition};`);
  },

  async down(queryInterface) {
    throw new Error('La reversión requiere restaurar la definición anterior de view_kardex_detalle.');
  }
};
