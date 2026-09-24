const { response, request } = require('express');
const { Category, Product, ProductSucursals, sequelize } = require('../database/config');
const { Op } = require('sequelize');
const paginate = require('../helpers/paginate');
const {
    intersectAllowedCategoryTypes,
} = require('../services/product-category-access.service');

const getCategoryPaginate = async (req = request, res = response) => {
    try {
        const { query, page, limit, type, status, orderNew, category_type } = req.query;
        const operationalContext = req.productAccessContext;
        const optionsDb = {
            order: [orderNew],
            where: { status },
        };
        if (operationalContext) {
            optionsDb.where.type = {
                [Op.in]: intersectAllowedCategoryTypes(
                    req.userAuth,
                    operationalContext,
                    category_type ? [category_type] : [],
                ),
            };
        } else if (category_type) {
            optionsDb.where.type = category_type;
        }
        let categories = await paginate(Category, page, limit, type, query, optionsDb);
        return res.status(200).json({
            ok: true,
            categories
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
        });
    }
}

const newCategory = async (req = request, res = response) => {
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
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
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
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
        });
    }
}

const activeInactiveCategory = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const category = await Category.findByPk(id);
        await category.update({ status });
        return res.status(201).json({
            ok: true,
            msg: status ? 'Categoría activada exitosamente' : 'Categoría inactiva exitosamente'
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
        });
    }
}

const getCategoriesForSelect = async (req = request, res = response) => {
    try {
        const { category_type, id_sucursal } = req.query;
        const operationalContext = req.productAccessContext;
        const where = { status: true };

        if (operationalContext) {
            where.type = {
                [Op.in]: intersectAllowedCategoryTypes(
                    req.userAuth,
                    operationalContext,
                    category_type ? [category_type] : [],
                ),
            };
        } else if (category_type) {
            where.type = category_type;
        }

        if (id_sucursal) {
            const allowedBranch = req.userAuth?.role === 'ADMINISTRADOR'
                || req.userAuth?.assign_sucursales?.some(item => Number(item.id_sucursal) === Number(id_sucursal));
            if (!allowedBranch) return res.status(403).json({ ok: false, errors: [{ msg: 'No tiene acceso a la sucursal seleccionada.' }] });
            const assignedProducts = await ProductSucursals.findAll({ where: { id_sucursal, status: true }, attributes: ['id_product'] });
            const productIds = assignedProducts.map(item => item.id_product);
            const products = productIds.length ? await Product.findAll({ where: { id: { [Op.in]: productIds }, status: true }, attributes: ['id_category'] }) : [];
            where.id = { [Op.in]: [...new Set(products.map(product => product.id_category))] };
        }

        const categories = await Category.findAll({
            where,
            attributes: ['id', 'name', 'type']
        });

        return res.status(200).json({
            ok: true,
            categories
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
        });
    }
}

module.exports = {
    getCategoryPaginate,
    newCategory,
    updateCategory,
    activeInactiveCategory,
    getCategoriesForSelect
};
