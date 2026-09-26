const bcrypt = require('bcryptjs');
const generarJWT = require('../helpers/jwt');
const { response } = require('express');
const { User, History } = require('../database/config');
const { getNumberDecimal } = require('../helpers/company');
const { verifyAssignShift } = require('../helpers/verify-assign-user');

const login = async (req, res = response) => {
    const {email, password} = req.body;
    try {
        const historyData = {
            module: 'AUTENTICACION',
            query: JSON.stringify({email}),
            status: true
        };
        let user = await User.findOne({
            where:{ email },
            attributes: {exclude: ['updatedAt','createdAt']},
            include: [
                { association: 'assign_permission', required:false, attributes:{ exclude: ['createdAt','updatedAt','id_user','status']}},
                { association: 'assign_shift',required:false, attributes: { exclude: ['createdAt','updatedAt','id_user']}},
                { association: 'assign_sucursales',required:false, where: { status: true}, attributes: { exclude: ['createdAt','updatedAt','id_user','status']}}
            ]
        });
        if(!user) {
            await History.create({ ...historyData, type: 'NO EXISTE USUARIO', description: `SE INTENTO AUTENTICAR UN USUARIO NO EXISTENTE: ${email}` });
            return res.status(401).json({
                ok: false,
                errors: [{
                        msg: `El correo y/o contraseña son incorrectos`
                    }],
            });
        }
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword){
            await History.create({ ...historyData, id_user: user.id, type: 'CONTRASEÑA INCORRECTA', description: `SE INTENTO AUTENTICAR EL USUARIO ${user.full_names} SIN ÉXITO YA QUE NO ES LA CONTRASEÑA CORRECTA` });
            return res.status(401).json({
                ok: false,
                errors: [{
                        msg: `El correo y/o contraseña son incorrectos`
                    }],
            });
        }
        if (!user.status){
            await History.create({ ...historyData, id_user: user.id, type: 'USUARIO INACTIVO', description: `SE INTENTO AUTENTICAR EL USUARIO ${user.full_names} SIN ÉXITO YA QUE SE ENCUENTRA EN ESTADO INACTIVO` });
            return res.status(401).json({
                ok: false,
                errors: [{
                        msg: `Op's..! Al parecer ya no tienes acceso | Comunícate con tu superior`
                    }],
            });
        }
        if(!verifyAssignShift(user.assign_shift)  && user.role != 'ADMINISTRADOR'){
            await History.create({ ...historyData, id_user: user.id, type: 'HORARIO NO ASIGNADO', description: `SE INTENTO AUTENTICAR EL USUARIO ${user.full_names} SIN ÉXITO YA QUE NO PUEDE INGRESAR POR SUS TURNOS` });
            return res.status(401).json({
                ok: false,
                errors: [{
                        msg: `Op's..! Al parecer no tienes turno asignado | Comunícate con tu superior`
                    }],
            });
        }
        const [decimals, token] = await Promise.all([getNumberDecimal(), generarJWT(user.id)]);
        delete user.dataValues.password;
        await History.create({ ...historyData, id_user: user.id, type: 'INGRESO AL SISTEMA', description: `EL USUARIO: ${user.full_names} INGRESO AL SISTEMA` });
        res.status(200).json({
            ok: true,
            user,
            token,
            company: { decimals }
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{
                msg: `Ocurrió un imprevisto interno | hable con soporte`
            }],
        });
    }
}


const renewToken = async (req , res = response) => {
    try {
        const id = req.userAuth.id;
        const decimals = await getNumberDecimal();
        const token = await generarJWT(id);
        const user = await User.findByPk(id, { include: [
            { association: 'assign_permission', required:false, attributes:{ exclude: ['createdAt','updatedAt','id_user','status']}},
            { association: 'assign_shift', required:false, attributes: { exclude: ['createdAt','updatedAt','id_user','status']}},
            { association: 'assign_sucursales', required:false, where: { status: true}, attributes: { exclude: ['createdAt','updatedAt','id_user','status']}}
        ]});
        delete user.dataValues.password;
        res.status(200).json({
            ok: true,
            user,
            token,
            company: { decimals }
        });     
    } catch (error) {
        console.log(error);
        return res.status(401).json({
            ok: false,
            errors: [{
                    msg: `Op's..! Al parecer ya no tienes acceso | Comunícate con tu superior`
                }],
        });
    }
}

module.exports = {
    login,
    renewToken
}
