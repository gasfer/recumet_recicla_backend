'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS view_kardex_detalle;');
    await queryInterface.sequelize.query(`
      CREATE VIEW view_kardex_detalle AS
        SELECT
            ROW_NUMBER() OVER (ORDER BY movimientos.date, movimientos.type, movimientos.id_movement, movimientos.id) AS id,
            movimientos.type,
            movimientos.date,
            movimientos.id_movement,
            movimientos.type_movement,
            movimientos.registry_number,
            movimientos.detail,
            movimientos.sub_detail,
            movimientos.id_product,
            movimientos.id_sucursal,
            movimientos.id_storage,
            movimientos.quantity AS quantity,

            CASE WHEN movimientos.type = 'INPUT' THEN movimientos.quantity ELSE 0 END AS quantity_input,
            CASE WHEN movimientos.type = 'OUTPUT' THEN movimientos.quantity ELSE 0 END AS quantity_output,

            movimientos.costo_unitario as cost_unitario,

            CASE WHEN movimientos.type = 'INPUT' THEN movimientos.quantity * movimientos.costo_unitario ELSE 0 END AS cost_input,
            CASE WHEN movimientos.type = 'OUTPUT' THEN movimientos.quantity * movimientos.costo_unitario ELSE 0 END AS cost_output,

            -- Saldo inicial por línea
            COALESCE(SUM(CASE WHEN movimientos.type = 'INPUT' THEN movimientos.quantity ELSE -movimientos.quantity END)
            OVER (
                PARTITION BY movimientos.id_product, movimientos.id_sucursal, movimientos.id_storage
                ORDER BY movimientos.date, movimientos.type, movimientos.id_movement, movimientos.id
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ), 0) AS saldo_inicial,

            -- Saldos acumulados
            SUM(CASE WHEN movimientos.type = 'INPUT' THEN movimientos.quantity ELSE -movimientos.quantity END)
                OVER (PARTITION BY movimientos.id_product, movimientos.id_sucursal, movimientos.id_storage ORDER BY movimientos.date, movimientos.type, movimientos.id_movement, movimientos.id) AS saldo,

            SUM(CASE
                WHEN movimientos.type = 'INPUT' THEN movimientos.quantity * movimientos.costo_unitario
                ELSE -movimientos.quantity * movimientos.costo_unitario
            END)
                OVER (PARTITION BY movimientos.id_product, movimientos.id_sucursal, movimientos.id_storage ORDER BY movimientos.date, movimientos.type, movimientos.id_movement, movimientos.id) AS cost_saldo

        FROM (
            -- Compras
            SELECT
                di.id_product,
                di.quantity,
                'INPUT' AS type,
                di.cost AS costo_unitario,
                i.date_voucher AS date,
                i.id AS id_movement,
                'INPUT' AS type_movement,
                i.registry_number AS registry_number,
                COALESCE(prov.number_document, '0') || ' - ' || COALESCE(prov.full_names, 'SIN PROVEEDOR') AS detail,
                'COMPRA #' || i.cod AS sub_detail,
                i.id_sucursal,
                i.id_storage,
                di.id AS id
            FROM details_inputs di
            JOIN inputs i ON i.id = di.id_input
            LEFT JOIN providers prov on i.id_provider = prov.id
            WHERE i.status = 'ACTIVE'

            UNION ALL
            -- Traspasos entrada
            SELECT
                dt.id_product,
                dt.quantity,
                'INPUT' AS type,
                dt.cost AS costo_unitario,
                tr.date_received,
                tr.id AS id_movement,
                'TRANSFER' AS type_movement,
                '-',
                susend.name AS detail,
                'TRASPASO RECIBIDO #' || tr.cod AS sub_detail,
                tr.id_sucursal_received,
                tr.id_storage_received,
                dt.id
            FROM details_transfers dt
            JOIN transfers tr ON tr.id = dt.id_transfer
            JOIN sucursals susend on tr.id_sucursal_send = susend.id
            WHERE tr.status = 'RECEIVED'

            UNION ALL
            -- clasificados ENTRADA
            SELECT
                dc.id_product,
                dc.quantity,
                'INPUT' AS type,
                dc.cost,
                cl.date_classified,
                cl.id AS id_movement,
                'CLASIFIED' AS type_movement,
                cl.number_registry as registry_number,
                prod.name as detail,
                'A PARTIR DE CLASIFICADO #' || cl.cod AS sub_detail,
                cl.id_sucursal,
                cl.id_storage,
                dc.id
            FROM details_classifieds dc
            JOIN classifieds cl ON cl.id = dc.id_classified
            JOIN products prod ON prod.id = cl.id_product
            WHERE cl.status = 'ACTIVE'

            UNION ALL

            -- Ventas
            SELECT
                dot.id_product,
                dot.quantity,
                'OUTPUT' AS type,
                dot.cost AS costo_unitario,
                o.date_output,
                o.id AS id_movement,
                'OUTPUT' AS type_movement,
                o.number_registry as registry_number,
                COALESCE(cli.number_document, '0') || ' - ' || COALESCE(cli.full_names, 'SIN CLIENTE') AS detail,
                'VENTA #' || o.cod AS sub_detail,
                o.id_sucursal,
                o.id_storage,
                dot.id
            FROM details_outputs dot
            JOIN outputs o ON o.id = dot.id_output
            LEFT JOIN clients cli on o.id_client = cli.id
            WHERE o.status = 'ACTIVE'

            UNION ALL

            -- Traspasos salida
            SELECT
                dt.id_product,
                dt.quantity,
                'OUTPUT' AS type,
                dt.cost AS costo_unitario,
                tr.date_send,
                tr.id AS id_movement,
                'TRANSFER' AS type_movement,
                '-',
                sucrec.name AS detail,
                'TRASPASO ENVIADO #' || tr.cod AS sub_detail,
                tr.id_sucursal_send,
                tr.id_storage_send,
                dt.id
            FROM details_transfers dt
            JOIN transfers tr ON tr.id = dt.id_transfer
            JOIN sucursals sucrec on tr.id_sucursal_received = sucrec.id
            WHERE tr.status IN ('PENDING', 'RECEIVED')

            UNION ALL

            -- clasificados SALIDA
            SELECT
                classifieds.id_product,
                classifieds.quantity_product,
                'OUTPUT' AS type,
                classifieds.cost_product,
                classifieds.date_classified,
                classifieds.id AS id_movement,
                'CLASIFIED' AS type_movement,
                classifieds.number_registry as registry_number,
                'CLASIFICADO' as detail,
                'CLASIFICADO #' || classifieds.cod AS sub_detail,
                classifieds.id_sucursal,
                classifieds.id_storage,
                classifieds.id
            FROM classifieds
            WHERE classifieds.status = 'ACTIVE'

            UNION ALL
            -- kardex_movements
            SELECT
                km.id_product,
                km.quantity,
                km.type,
                km.cost,
                km.date,
                km.id AS id_movement,
                'KMOVEMENT' AS type_movement,
                '-',
                km.details as detail,
                km.details,
                km.id_sucursal,
                km.id_storage,
                km.id
            FROM kardex_movements km
            WHERE km.status = true
        ) movimientos
        JOIN products p ON p.id = movimientos.id_product;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS view_kardex_detalle;');
  }
};
