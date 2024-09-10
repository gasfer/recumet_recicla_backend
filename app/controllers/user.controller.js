
const bcrypt = require('bcrypt');
const generarJWT = require('../helpers/jwt');
const { response, request } = require('express');
const { User , assignPermission, assignShift, assignSucursales} = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require("sequelize");

const getUsers = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, status,orderNew} = req.query;
        const optionsDb = {
            attributes: { exclude: ['password','createdAt'] },
            order: [orderNew],
            where: {
                status,
                role:{
                    [Op.ne]: 'DESARROLLADOR'
                }
            },
            include: [
                { association: 'assign_permission',required: false , attributes:{ exclude: ['createdAt','updatedAt','id_user']}},
                { association: 'assign_shift',required: false, attributes: { exclude: ['createdAt','updatedAt','id_user']}},
                { association: 'assign_sucursales',required: false, where: { status: true},attributes: { exclude: ['createdAt','updatedAt','id_user']}}
            ]
        };
        let users = await paginate(User, page, limit, type, query, optionsDb); 
        res.status(200).json({
            ok: true,
            users
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newUser = async (req = request, res = response ) => {
    try {
        const body = req.body;
        const salt = bcrypt.genSaltSync();
        body.password = bcrypt.hashSync(body.password, salt);
        const token = await generarJWT(body.id);
        const userNew = await User.create(body);
        res.status(201).json({
            ok: true,
            userNew,
            token
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateUser = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const salt = bcrypt.genSaltSync();
        body.password = bcrypt.hashSync(body.password, salt);
        const user = await User.findByPk(id);
        await user.update(body);
        return res.status(201).json({
            ok: true,
            msg: 'Usuario modificado exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
        });
    }
}

const activeInactiveUser = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const user = await User.findByPk(id);
        await user.update({status});
        res.status(201).json({
            ok: true,
            msg: status ? 'Usuario activado exitosamente' : 'Usuario inactivo exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}


const updateAssignPermissions = async (req = request, res = response) => {
    try {
        const { permissions } = req.body;
        for (const permission of permissions) {
            const assign_permission = await assignPermission.update({
                view: permission.view,
                create: permission.create,
                update: permission.update,
                delete: permission.delete,
                reports: permission.reports,        
                status: permission.status,        
            },{where: {id_user:permission.id_user,module:permission.module}});
            if(!assign_permission[0]){
                await assignPermission.create(permission);
            } 
        }
        return res.status(201).json({
            ok: true,
            msg: 'Permisos exitosamente asignados'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateAssignShift = async (req = request, res = response) => {
    try {
        const { shifts } = req.body;
        for (const shift of shifts) {
            const assign_shift = await assignShift.update({
                number_day: shift.number_day,
                hour_start: shift.hour_start,       
                hour_end: shift.hour_end,       
                status: shift.status       
            },{where: {id_user:shift.id_user,day:shift.day}});
            if(!assign_shift[0]){
                await assignShift.create(shift);
            } 
        }
        return res.status(201).json({
            ok: true,
            msg: 'Horarios exitosamente asignados'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateAssignSucursales = async (req = request, res = response) => {
    try {
        const { sucursales } = req.body;
        for (const sucursal of sucursales) {
            const assign_sucursal = await assignSucursales.update({
                status: sucursal.status       
            },{where: {id_user:sucursal.id_user,id_sucursal:sucursal.id_sucursal}});
            if(!assign_sucursal[0]){
                await assignSucursales.create(sucursal);
            } 
        }
        return res.status(201).json({
            ok: true,
            msg: 'Sucursal exitosamente asignados'
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
    getUsers,
    newUser,
    updateUser,
    activeInactiveUser,
    updateAssignPermissions,
    updateAssignShift,
    updateAssignSucursales
};