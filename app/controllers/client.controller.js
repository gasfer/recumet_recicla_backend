const { response, request } = require('express');
const { Client, sequelize, Output } = require('../database/config');
const paginate = require('../helpers/paginate');
const get_num_request = require('../helpers/generate-cod');
const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');

const getClientPaginate = async (req = request, res = response) => {
    try {
        let {query, page, limit, type, status, orderNew, clientType, date1, date2, search } = req.query;
        let isSearchPos = type === 'pos' ? true : false;   
        let optionsDb = {
            order: orderNew ? [orderNew] : [['id', 'DESC']],
            where: { status },
        };
        if (clientType) optionsDb.where.type = clientType;
        if (search) optionsDb.where[Op.or] = [
            { full_names: { [Op.iLike]: `%${search}%` } },
            { number_document: { [Op.iLike]: `%${search}%` } },
            sequelize.where(sequelize.cast(sequelize.col('cellphone'), 'TEXT'), { [Op.iLike]: `%${search}%` }),
        ];
        if (date1 || date2) {
            optionsDb.include = [{ association: 'outputs', required: true, attributes: [], where: {
                status: 'ACTIVE',
                ...(date1 ? { date_output: { [Op.gte]: new Date(`${date1}T00:00:00`) } } : {}),
                ...(date2 ? { date_output: { [Op.lte]: new Date(`${date2}T23:59:59.999`) } } : {}),
            } }];
            optionsDb.distinct = true;
        }
        if(isSearchPos) type = null;
        if(isSearchPos) optionsDb.where[Op.or] = [
            { cod: { [Op.iLike]: `%${query}%`}},
            { full_names: { [Op.iLike]: `%${query}%`}},
            { number_document: { [Op.iLike]: `%${query}%`}},
            { razon_social: { [Op.iLike]: `%${query}%`}},
            { business_name: { [Op.iLike]: `%${query}%`}},
        ];
        let clients = await paginate(Client, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            clients
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getClientSalesHistory = async (req = request, res = response) => {
    try {
        const client = await Client.findByPk(req.params.id, { attributes: ['id', 'cod', 'full_names', 'number_document', 'type'] });
        if (!client) return res.status(404).json({ ok: false, errors: [{ msg: 'Cliente no encontrado' }] });
        const { date1, date2, filterBy, type_registry, type_output, type_pay, id_sucursal, id_storage } = req.query;
        const where = { id_client: client.id, status: 'ACTIVE',
            ...(type_registry ? { type_registry } : {}),
            ...(type_output ? { voucher: type_output } : {}),
            ...(type_pay ? { type_output: type_pay } : {}),
            ...(id_sucursal ? { id_sucursal } : {}),
            ...(id_storage ? { id_storage } : {}),
            ...(filterBy ? { date_output: whereDateForType(filterBy, date1, date2, '"Output"."date_output"') } : date1 || date2 ? { date_output: {
                ...(date1 ? { [Op.gte]: new Date(`${date1}T00:00:00`) } : {}),
                ...(date2 ? { [Op.lte]: new Date(`${date2}T23:59:59.999`) } : {}),
            } } : {}) };
        const sales = await Output.findAll({ where, order: [['date_output', 'DESC'], ['id', 'DESC']],
            attributes: ['id', 'cod', 'date_output', 'total', 'type_voucher', 'type_output', 'type_payment', 'status'],
            include: [{ association: 'user', attributes: ['full_names'] }, { association: 'sucursal', attributes: ['name'] }] });
        const summary = sales.reduce((result, sale) => {
            result.count += 1; result.total += Number(sale.total) || 0; return result;
        }, { count: 0, total: 0 });
        return res.json({ ok: true, client, summary, sales });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo cargar el historial de ventas' }] });
    }
};

const exportClientsExcel = async (req = request, res = response) => {
    try {
        const ExcelJS = require('exceljs');
        const { status = 'true', clientType, date1, date2, search } = req.query;
        const where = { status: status === 'true' };
        if (clientType) where.type = clientType;
        if (search) where[Op.or] = [
            { full_names: { [Op.iLike]: `%${search}%` } },
            { number_document: { [Op.iLike]: `%${search}%` } },
            sequelize.where(sequelize.cast(sequelize.col('cellphone'), 'TEXT'), { [Op.iLike]: `%${search}%` }),
        ];
        const options = { where, order: [['full_names', 'ASC']] };
        if (date1 || date2) {
            options.include = [{ association: 'outputs', required: true, attributes: [], where: { status: 'ACTIVE', date_output: {
                ...(date1 ? { [Op.gte]: new Date(`${date1}T00:00:00`) } : {}),
                ...(date2 ? { [Op.lte]: new Date(`${date2}T23:59:59.999`) } : {}),
            } } }]; options.distinct = true;
        }
        const clients = await Client.findAll(options);
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Clientes');
        sheet.columns = [
            { header: 'Código', key: 'cod', width: 16 }, { header: 'Nombre', key: 'name', width: 32 },
            { header: 'CI / NIT', key: 'document', width: 20 }, { header: 'Celular', key: 'cellphone', width: 18 },
            { header: 'Tipo', key: 'type', width: 16 }, { header: 'Negocio', key: 'business', width: 28 },
        ];
        clients.forEach(client => sheet.addRow({ cod: client.cod, name: client.full_names, document: client.number_document, cellphone: client.cellphone, type: client.type, business: client.business_name }));
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176B4D' } };
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="listado_clientes.xlsx"');
        await workbook.xlsx.write(res); res.end();
    } catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo exportar el listado de clientes' }] });
    }
};

const newClient = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        const body = req.body;
        const client = await Client.create(body, { transaction: t });
        let num = get_num_request('CLI',Number(client.id),5);
        await client.update({cod:num},{ where: {id: client.id}, transaction: t});
        await t.commit();
        return res.status(201).json({
            ok: true,
            client
        });
    } catch (error) {
        await t.rollback();
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateClient = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const body = req.body;
        const client = await Client.findByPk(id,{ transaction: t });
        await client.update(body,{ transaction: t });
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Cliente modificado exitosamente'
        });   
    } catch (error) {
        await t.rollback();
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const activeInactiveClient = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const client = await Client.findByPk(id);
        await client.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Cliente activo exitosamente' : 'Cliente inactivo exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

module.exports = {
    getClientPaginate,
    getClientSalesHistory,
    exportClientsExcel,
    newClient,
    updateClient,
    activeInactiveClient
};
