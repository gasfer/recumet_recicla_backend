const { response, request } = require('express');
const { Category, sequelize } = require('../database/config');
const paginate = require('../helpers/paginate');

const getCategoryPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, status,orderNew} = req.query;
        const optionsDb = {
            order: [orderNew],
            where: { status },
        };
        let categories = await paginate(Category, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            categories
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newCategory = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        const body = req.body;
        const category = await Category.create(body, { transaction: t });
        await t.commit();
        return res.status(201).json({
            ok: true,
            category
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

const updateCategory = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const body = req.body;
        const category = await Category.findByPk(id, { transaction: t });
        await category.update(body, { transaction: t });
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Categoría modificada exitosamente'
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

const activeInactiveCategory = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const category = await Category.findByPk(id);
        await category.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Categoría activada exitosamente' : 'Categoría inactiva exitosamente'
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
    getCategoryPaginate,
    newCategory,
    updateCategory,
    activeInactiveCategory
};
