const {response} = require('express');
const jwt = require('jsonwebtoken');
const { User } = require('../../database/config');
const { verifyAssignShift } = require('../../helpers/verify-assign-user');

const validarJWT = async (req, res = response , next) =>{
    try {
        const token = req.header('Authorization');
        if(!token) {
            return res.status(401).json({
                ok: false,
                errors: [{
                        value: token,
                        msg: `Introduce el token en los headers | Authorization`
                    }],
            });
        }
        const { id } = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(id, {  include: [
            { association: 'assign_permission', required:false, attributes:{ exclude: ['createdAt','updatedAt','id_user','status']}},
            { association: 'assign_shift',required:false, attributes: { exclude: ['createdAt','updatedAt','id_user']}},
            { association: 'assign_sucursales',required:false, where: { status: true}, attributes: { exclude: ['createdAt','updatedAt','id_user','status']}}
        ]});
        if (!user.status){
            return res.status(401).json({
                ok: false,
                errors: [{
                        msg: `Op's..! Al parecer ya no tienes acceso | Comunícate con tu superior`
                    }],
            });
        }
        if(!verifyAssignShift(user.assign_shift)){
            return res.status(401).json({
                ok: false,
                errors: [{
                        msg: `Op's..! Al parecer no tienes turno asignado | Comunícate con tu superior`
                    }],
            });
        }
        let {field_sort , order} = req.query;
        field_sort = field_sort || 'id'; order = order || 'DESC';
        const orderNew = field_sort.includes('.') 
                        ? field_sort.split('.').concat(order) 
                        : [field_sort, order];
        req.query.orderNew =  orderNew;               
        req.userAuth = user;
        next();
    } catch (error) {
        console.log(error);
        return res.status(401).json({
            ok: false,
            errors: [{msg: `Opps..! Al parecer ya venció tu sesión`}],
        });
    } 
}

const getMapSortOrder = () => {

}

module.exports = {
    validarJWT
}