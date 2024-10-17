const bcrypt = require('bcrypt');
const generarJWT = require('../helpers/jwt');
const { response } = require('express');
const { User, History } = require('../database/config');
const { getNumberDecimal } = require('../helpers/company');
const { verifyAssignShift } = require('../helpers/verify-assign-user');

const login = async (req, res = response) => {
    const {email, password} = req.body;
    try {
        const history = await History.create({
            module: 'AUTENTICACION',
            query: JSON.stringify({email, password}),
            status: true
        });
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
            history.type = 'NO EXISTE USUARIO';
            history.description = `SE INTENTO AUTENTICAR UN USUARIO NO EXISTENTE: ${email}`;
            await history.save();
            return res.status(401).json({
                ok: false,
                errors: [{
                        msg: `El correo y/o contraseña son incorrectos`
                    }],
            });
        }
        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword){
            history.id_user = user.id;
            history.type = 'CONTRASEÑA INCORRECTA';
            history.description = `SE INTENTO AUTENTICAR EL USUARIO ${user.full_names} SIN ÉXITO YA QUE NO ES LA CONTRASEÑA CORRECTA`;
            await history.save();
            return res.status(401).json({
                ok: false,
                errors: [{
                        msg: `El correo y/o contraseña son incorrectos`
                    }],
            });
        }
        if (!user.status){
            history.id_user = user.id;
            history.type = 'USUARIO INACTIVO';
            history.description = `SE INTENTO AUTENTICAR EL USUARIO ${user.full_names} SIN ÉXITO YA QUE SE ENCUENTRA EN ESTO INACTIVO`;
            await history.save();
            return res.status(401).json({
                ok: false,
                errors: [{
                        msg: `Op's..! Al parecer ya no tienes acceso | Comunícate con tu superior`
                    }],
            });
        }
        if(!verifyAssignShift(user.assign_shift)  && user.role != 'ADMINISTRADOR'){
            history.id_user = user.id;
            history.type = 'HORARIO NO ASIGNADO';
            history.description = `SE INTENTO AUTENTICAR EL USUARIO ${user.full_names} SIN ÉXITO YA QUE NO PUEDE INGRESAR POR SUS TURNOS`;
            await history.save();
            return res.status(401).json({
                ok: false,
                errors: [{
                        msg: `Op's..! Al parecer no tienes turno asignado | Comunícate con tu superior`
                    }],
            });
        }
        const decimals = await getNumberDecimal();
        const token = await generarJWT(user.id);
        delete user.dataValues.password;
        history.id_user = user.id;
        history.query = JSON.stringify({email});
        history.type = 'INGRESO AL SISTEMA';
        history.description = `EL USUARIO: ${user.full_names} INGRESO Al SISTEMA`;
        await history.save();
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