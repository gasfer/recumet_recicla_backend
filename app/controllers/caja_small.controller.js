const { response, request } = require('express');
const { CajaSmall,sequelize, DetailsCajaSmall,History, CjCaja, CjAccount, CjAccountAssignment, CjSessionBalance, CjLedger, CjDailyClose, CjDailyCloseDetail, CjExpense, CjExpenseCategory, CjExpenseAttachment, PlantPersonnel, PlantPersonnelBranch, Sucursal } = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');
const { validaOpenCajaSmall } = require('../middlewares/validators/caja_small');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NotificationService = require('../services/notification.service');
const { normalizeAccountAmounts, assertAccountsMatch } = require('../services/caja-account-balances.service');

const money = value => Number(Number(value || 0).toFixed(4));
const apiError = (res, status, msg) => res.status(status).json({ ok: false, errors: [{ msg }] });
const canAccessBranch = (user, branchId) => ['ADMINISTRADOR', 'DESARROLLADOR'].includes(user?.role)
    || (user?.assign_sucursales || []).some(assignment => assignment.status !== false && Number(assignment.id_sucursal) === Number(branchId));
const normalizeCashboxType = value => String(value || 'CHICA').trim().toUpperCase() === 'MAYOR' ? 'MAYOR' : 'CHICA';
const validCashboxType = value => value == null || value === '' || ['CHICA', 'MAYOR'].includes(String(value).trim().toUpperCase());
const invalidRequestedCashboxType = value => value != null && value !== '' && !validCashboxType(value);
const canAccessCashbox = (user, type = 'CHICA', action = 'view') => {
    const cashboxType = normalizeCashboxType(type);
    if (user?.role === 'ADMINISTRADOR') return true;
    if (cashboxType === 'CHICA' && user?.role === 'LIQUIDACION_CAJA') return true;
    return (user?.assign_permission || []).some(permission => {
        const module = String(permission?.module || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
        const isCashPermission = cashboxType === 'MAYOR'
            ? module === 'CAJAMAYOR'
            : ['CAJA', 'CAJACHICA'].includes(module);
        return isCashPermission && permission.status !== false && Boolean(permission[action]);
    });
};
const canManagePersonnel = (user, action = 'view') =>
    canAccessCashbox(user, 'CHICA', action) || canAccessCashbox(user, 'MAYOR', action);

const getAssignedAccounts = (idCaja, transaction, lock = false) => CjAccount.findAll({
    include: [{ model: CjAccountAssignment, as: 'assignments', where: { id_caja: idCaja, is_active: true }, attributes: [] }],
    where: { is_active: true }, order: [['id', 'ASC']], transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {})
});
const accountsForCashbox = (accounts, type) => accounts.filter(account => {
    const currency = String(account.currency || '').toUpperCase();
    const accountType = String(account.type || '').toUpperCase();
    if (type === 'CHICA') return currency === 'BOB' && ['CASH', 'BANK'].includes(accountType);
    return ['BOB', 'USD'].includes(currency) && ['CASH', 'BANK', 'QR'].includes(accountType);
});

const attachAllPersonnelBranches = async (rows, user) => Promise.all(rows.map(async person => {
    const assignments = await PlantPersonnelBranch.findAll({
        where: { id_personal: person.id },
        include: [{ model: Sucursal, as: 'branch', attributes: ['id', 'name', 'city'] }],
    });
    person.setDataValue('branches', assignments.map(assignment => assignment.branch).filter(branch => branch && canAccessBranch(user, branch.id)));
    return person;
}));

const getSessionAccounts = async (session, transaction, lock = false) => {
    const balances = await CjSessionBalance.findAll({ where: { id_caja_small: session.id }, attributes: ['id_cuenta'], transaction });
    const allowedIds = new Set(balances.map(row => Number(row.id_cuenta)));
    return (await getAssignedAccounts(session.id_caja, transaction, lock)).filter(account => allowedIds.has(Number(account.id)));
};

const canAccessSession = (user, session) => canAccessCashbox(user, session?.cashbox_type || 'CHICA', 'view') || canAccessCashbox(user, session?.cashbox_type || 'CHICA', 'create');
const canViewExpenseManagement = (user, type = 'CHICA') => {
    if (normalizeCashboxType(type) === 'MAYOR') return canAccessCashbox(user, 'MAYOR', 'view') || canAccessCashbox(user, 'MAYOR', 'create');
    if (canAccessCashbox(user, 'CHICA', 'view')) return true;
    return (user?.assign_permission || []).some(permission => {
        const module = String(permission?.module || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
        return module === 'GASTOS' && permission.status !== false && Boolean(permission.view);
    });
};

const getAccountExpected = async (sessionId, accountId, transaction) => {
    const opening = await CjSessionBalance.findOne({ where: { id_caja_small: sessionId, id_cuenta: accountId }, transaction });
    const rows = await CjLedger.findAll({ where: { id_caja_small: sessionId, id_cuenta: accountId }, attributes: ['direction', 'amount'], transaction });
    return money(Number(opening?.opening_amount || 0) + rows.reduce((sum, row) => sum + (row.direction === 'IN' ? 1 : -1) * Number(row.amount), 0));
};

const getCajasSmall = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, id_sucursal,id_user, filterBy, date1, date2,orderNew, cashbox_type = 'CHICA'} = req.query;
        const cashboxType = normalizeCashboxType(cashbox_type);
        if (!canAccessCashbox(req.userAuth, cashboxType, 'view') && !canAccessCashbox(req.userAuth, cashboxType, 'create')) return apiError(res, 403, `No tienes permiso para consultar Caja ${cashboxType}.`);
        if (id_sucursal && !canAccessBranch(req.userAuth, id_sucursal)) return apiError(res, 403, 'No tienes permiso para consultar esta sucursal.');
        if (invalidRequestedCashboxType(cashbox_type)) return apiError(res, 422, 'cashbox_type debe ser CHICA o MAYOR.');
        const allowedBranches = (req.userAuth.assign_sucursales || []).filter(item => item.status !== false).map(item => item.id_sucursal);
        const branchFilter = id_sucursal ? { id_sucursal } : ['ADMINISTRADOR', 'DESARROLLADOR'].includes(req.userAuth.role) ? {} : { id_sucursal: { [Op.in]: allowedBranches.length ? allowedBranches : [-1] } };
        const whereDate = whereDateForType(filterBy,date1, date2, '"CajaSmall"."date_apertura"');
        const optionsDb = {
            order: [orderNew],
            where: {
                [Op.and]: [
                    branchFilter,
                    { cashbox_type: cashboxType },
                    id_user     ? { id_user } : {},
                    { date_apertura: whereDate }
                ]
            },
            include: [ 
                { association: 'sucursal',attributes: ['name'] },
                { association: 'user', attributes: ['full_names','number_document']},
            ]
        };
        let cajas_small = await paginate(CajaSmall, page, limit, type, query, optionsDb); 
        for (const caja_small of cajas_small.data) {
            caja_small.dataValues.total_movements =  await getTotalesAndMovements(caja_small.id,caja_small.monto_apertura);
        }
        return res.status(200).json({
            ok: true,
            cajas_small
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }    
}

const getTotalDetailsCajasSmall = async (req = request, res = response) => {
    try {
        const {id_sucursal} = req.query;
        if (invalidRequestedCashboxType(req.query.cashbox_type)) return apiError(res, 422, 'cashbox_type debe ser CHICA o MAYOR.');
        const cashboxType = normalizeCashboxType(req.query.cashbox_type);
        if (!canAccessCashbox(req.userAuth, cashboxType, 'view') && !canAccessCashbox(req.userAuth, cashboxType, 'create')) return apiError(res, 403, `No tienes permiso para consultar Caja ${cashboxType}.`);
        if (!canAccessBranch(req.userAuth, id_sucursal)) return apiError(res, 403, 'No tienes permiso para consultar la Caja de esta sucursal.');
        const id_user = req.userAuth.id;
        const caja_small = await validaOpenCajaSmall(id_sucursal,id_user,cashboxType);
        if(!caja_small) {
            return res.status(422).json({
                ok: false,
                errors: [{ msg: `La caja para el usuario y sucursal no esta ABIERTO`}],
            });
        }
        if (!canAccessSession(req.userAuth, caja_small)) return apiError(res, 403, 'No tienes permiso para consultar esta Caja.');
        const total_movements = await getTotalesAndMovements(caja_small.id,caja_small.monto_apertura);
        return res.status(200).json({
            ok: true,
            id_caja_small: caja_small.id,
            ...total_movements
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    } 
}

const getCajaAccounts = async (req = request, res = response) => {
    try {
        const id_sucursal = Number(req.query.id_sucursal);
        if (invalidRequestedCashboxType(req.query.cashbox_type)) return apiError(res, 422, 'cashbox_type debe ser CHICA o MAYOR.');
        const cashboxType = normalizeCashboxType(req.query.cashbox_type);
        if (!id_sucursal) return apiError(res, 422, 'Indica la sucursal para consultar Caja.');
        if (!canAccessCashbox(req.userAuth, cashboxType, 'view') && !canAccessCashbox(req.userAuth, cashboxType, 'create')) return apiError(res, 403, `No tienes permiso para consultar Caja ${cashboxType}.`);
        if (!canAccessBranch(req.userAuth, id_sucursal)) return apiError(res, 403, 'No tienes permiso para consultar la Caja de esta sucursal.');
        const caja = await CjCaja.findOne({ where: { id_sucursal, cashbox_type: cashboxType, status: true }, include: [{ association: 'sucursal', attributes: ['name', 'city'] }] });
        if (!caja) return apiError(res, 404, 'No existe una Caja activa para la sucursal.');
        const session = await CajaSmall.findOne({ where: { id_sucursal, cashbox_type: cashboxType, session_state: 'OPEN' }, include: [{ association: 'user', attributes: ['full_names'] }] });
        if (session && !canAccessSession(req.userAuth, session)) return apiError(res, 403, 'No tienes permiso para acceder a esta Caja.');
        const assigned = accountsForCashbox(await getAssignedAccounts(caja.id), cashboxType);
        const accounts = session ? accountsForCashbox(await getSessionAccounts(session), cashboxType) : assigned;
        const result = await Promise.all(accounts.map(async account => {
            const opening = session ? await CjSessionBalance.findOne({ where: { id_caja_small: session.id, id_cuenta: account.id } }) : null;
            const ledger = session ? await CjLedger.findAll({ where: { id_caja_small: session.id, id_cuenta: account.id }, attributes: ['direction', 'amount'] }) : [];
            const inflows = money(ledger.filter(x => x.direction === 'IN').reduce((s, x) => s + Number(x.amount), 0));
            const outflows = money(ledger.filter(x => x.direction === 'OUT').reduce((s, x) => s + Number(x.amount), 0));
            return { id_cuenta: account.id, code: account.code, name: account.name, type: account.type, currency: account.currency,
                opening_amount: money(opening?.opening_amount), inflows, outflows, expected_amount: money(Number(opening?.opening_amount || 0) + inflows - outflows) };
        }));
        const totalsByCurrency = [...result.reduce((totals, account) => {
            const total = totals.get(account.currency) || { currency: account.currency, opening_amount: 0, inflows: 0, outflows: 0, expected_amount: 0 };
            total.opening_amount = money(total.opening_amount + account.opening_amount);
            total.inflows = money(total.inflows + account.inflows);
            total.outflows = money(total.outflows + account.outflows);
            total.expected_amount = money(total.expected_amount + account.expected_amount);
            totals.set(account.currency, total); return totals;
        }, new Map()).values()];
        return res.status(200).json({ ok: true, id_caja_small: session?.id || null, session_state: session?.session_state || 'CLOSED', session: session ? { id: session.id, date_apertura: session.date_apertura, responsible: session.user?.full_names || '-', cashbox_type: session.cashbox_type || 'CHICA' } : null, branch: { name: caja.sucursal?.name || '', city: caja.sucursal?.city || '' }, accounts: result, availableAccounts: session ? undefined : assigned.map(account => ({ id_cuenta: account.id, code: account.code, name: account.name, type: account.type, currency: account.currency })), totalsByCurrency });
    } catch (error) {
        console.log(error);
        return apiError(res, 500, 'Ocurrió un problema al consultar las cuentas de Caja.');
    }
}

const saveCajaAccount = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        if (req.userAuth.role !== 'ADMINISTRADOR') { await t.rollback(); return apiError(res, 403, 'Solo un administrador puede configurar cuentas de Caja.'); }
        if (!validCashboxType(req.body.cashbox_type)) { await t.rollback(); return apiError(res, 422, 'cashbox_type debe ser CHICA o MAYOR.'); }
        const { id_cuenta, code, name, type, id_bank, account_reference } = req.body;
        const id_sucursal = Number(req.body.id_sucursal);
        const cajaType = normalizeCashboxType(req.body.cashbox_type);
        const currency = String(req.body.currency || 'BOB').trim().toUpperCase();
        const active = ![false, 'false', 0, '0'].includes(req.body.is_active);
        if (!Number.isInteger(id_sucursal) || id_sucursal < 1) { await t.rollback(); return apiError(res, 422, 'Indica una sucursal válida.'); }
        const caja = await CjCaja.findOne({ where: { id_sucursal, cashbox_type: cajaType, status: true }, transaction: t, lock: t.LOCK.UPDATE });
        if (!caja) { await t.rollback(); return apiError(res, 404, `No existe Caja ${cajaType} activa para la sucursal.`); }
        if (await CajaSmall.findOne({ where: { id_sucursal, cashbox_type: cajaType, session_state: 'OPEN' }, transaction: t })) { await t.rollback(); return apiError(res, 422, `Cierra Caja ${cajaType} antes de modificar sus cuentas.`); }
        if (!['CASH', 'BANK', 'QR'].includes(type)) { await t.rollback(); return apiError(res, 422, 'Tipo de cuenta inválido.'); }
        if (!name?.trim() || !['BOB', 'USD'].includes(currency) || (!id_cuenta && !code?.trim())) { await t.rollback(); return apiError(res, 422, 'Completa código, nombre y una moneda permitida (BOB o USD).'); }
        if (type === 'BANK' && !id_bank) { await t.rollback(); return apiError(res, 422, 'Vincula la institución bancaria para esta cuenta.'); }
        if (cajaType === 'CHICA' && (currency !== 'BOB' || !['CASH', 'BANK'].includes(type))) { await t.rollback(); return apiError(res, 422, 'Caja Chica admite efectivo BOB y una cuenta bancaria BOB.'); }

        let account = id_cuenta ? await CjAccount.findByPk(id_cuenta, { transaction: t, lock: t.LOCK.UPDATE }) : null;
        if (id_cuenta && !account) { await t.rollback(); return apiError(res, 404, 'No se encontró la cuenta indicada.'); }
        const assignment = account ? await CjAccountAssignment.findOne({ where: { id_caja: caja.id, id_cuenta: account.id }, transaction: t, lock: t.LOCK.UPDATE }) : null;
        if (account && !assignment) { await t.rollback(); return apiError(res, 422, 'La cuenta no está asignada a esta Caja.'); }
        const otherAssignments = account ? await CjAccountAssignment.findAll({ where: { id_cuenta: account.id, id_caja: { [Op.ne]: caja.id } }, transaction: t }) : [];
        const shared = otherAssignments.some(row => row.is_active);
        if (account && shared && (account.name !== name || account.type !== type || account.currency !== currency || Number(account.id_bank || 0) !== Number(id_bank || 0))) {
            await t.rollback(); return apiError(res, 422, 'Esta cuenta comparte historial con otra Caja. Crea una cuenta independiente para cambiar sus datos.');
        }

        const existingAccounts = await getAssignedAccounts(caja.id, t, true);
        const duplicateKind = existingAccounts.some(item => Number(item.id) !== Number(id_cuenta || 0) && item.type === type && (type !== 'CASH' || item.currency === currency));
        if (active && type === 'BANK' && cajaType === 'CHICA' && duplicateKind) { await t.rollback(); return apiError(res, 422, 'Caja Chica solo puede tener una cuenta bancaria activa. Desactiva primero la cuenta anterior.'); }
        if (active && type === 'CASH' && duplicateKind) { await t.rollback(); return apiError(res, 422, `Ya existe una cuenta de efectivo ${currency} activa en Caja ${cajaType}.`); }

        if (account) {
            await account.update({ name, type, currency, id_bank: id_bank || null, account_reference: account_reference || null, is_active: active || shared }, { transaction: t });
            await assignment.update({ is_active: active, assigned_by: req.userAuth.id }, { transaction: t });
        } else {
            account = await CjAccount.create({ code, name, type, currency, id_bank: id_bank || null, account_reference: account_reference || null, is_active: active }, { transaction: t });
            await CjAccountAssignment.create({ id_caja: caja.id, id_cuenta: account.id, is_active: active, assigned_by: req.userAuth.id }, { transaction: t });
        }
        await t.commit();
        return res.status(200).json({ ok: true, cashbox_type: cajaType, account });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') return apiError(res, 422, 'El código de cuenta ya existe.');
        if (error.name === 'SequelizeDatabaseError' && /CJ_ACCOUNT_POLICY/.test(error.message || '')) return apiError(res, 422, error.message);
        console.log(error);
        return apiError(res, 500, 'Ocurrió un problema al guardar la cuenta.');
    }
}
const getExpenseCategories = async (req = request, res = response) => {
    const cashboxType = normalizeCashboxType(req.query.cashbox_type);
    if (invalidRequestedCashboxType(req.query.cashbox_type)) return apiError(res, 422, 'cashbox_type debe ser CHICA o MAYOR.');
    if (!canViewExpenseManagement(req.userAuth, cashboxType)) return apiError(res, 403, `No tienes permiso para consultar categor�as de Caja ${cashboxType}.`);
    const categories = await CjExpenseCategory.findAll({ where: { is_active: true, cashbox_type: cashboxType }, order: [['name', 'ASC']] });
    return res.status(200).json({ ok: true, categories });
}

const getCajaPersonnel = async (req = request, res = response) => {
    try {
        const cashboxType = normalizeCashboxType(req.query.cashbox_type);
        const branchId = Number(req.query.id_sucursal);
        if (invalidRequestedCashboxType(req.query.cashbox_type)) return apiError(res, 422, 'cashbox_type debe ser CHICA o MAYOR.');
        if (!Number.isInteger(branchId) || branchId < 1) return apiError(res, 422, 'Selecciona una sucursal válida.');
        if (!canAccessBranch(req.userAuth, branchId)) return apiError(res, 403, 'No tienes permiso para consultar el personal de esta sucursal.');
        const management = String(req.query.management || '') === '1';
        if (management ? !canManagePersonnel(req.userAuth, 'view') && !canManagePersonnel(req.userAuth, 'create') : !canAccessCashbox(req.userAuth, cashboxType, 'view') && !canAccessCashbox(req.userAuth, cashboxType, 'create')) return apiError(res, 403, 'No tienes permiso para consultar personal de planta.');

        const where = { is_active: String(req.query.status || 'ACTIVE').toUpperCase() !== 'INACTIVE' };
        const search = String(req.query.search || '').trim();
        if (search) where[Op.or] = ['full_name', 'ci', 'cellphone', 'job_title', 'area'].map(field => ({ [field]: { [Op.iLike]: `%${search}%` } }));
        const query = {
            where,
            include: [{ model: Sucursal, as: 'branches', where: { id: branchId, status: true }, attributes: ['id', 'name', 'city'], through: { attributes: [] }, required: true }],
            order: [['full_name', 'ASC']],
        };
        const all = String(req.query.all || '') === '1';
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        if (all) {
            const personnel = await PlantPersonnel.findAll(query);
            return res.status(200).json({ ok: true, personnel: await attachAllPersonnelBranches(personnel, req.userAuth) });
        }
        const result = await PlantPersonnel.findAndCountAll({ ...query, limit, offset: (page - 1) * limit, distinct: true });
        return res.status(200).json({ ok: true, personnel: await attachAllPersonnelBranches(result.rows, req.userAuth), page: { current: page, limit, total: result.count, pages: Math.ceil(result.count / limit) } });
    } catch (error) {
        console.log(error);
        return apiError(res, 500, 'No se pudo cargar el personal de planta.');
    }
};

const createCajaPersonnel = async (req = request, res = response) => {
    const transaction = await sequelize.transaction();
    try {
        const cashboxType = normalizeCashboxType(req.body.cashbox_type);
        if (invalidRequestedCashboxType(req.body.cashbox_type)) { await transaction.rollback(); return apiError(res, 422, 'cashbox_type debe ser CHICA o MAYOR.'); }
        if (!canManagePersonnel(req.userAuth, 'create') && !canViewExpenseManagement(req.userAuth, cashboxType)) { await transaction.rollback(); return apiError(res, 403, 'No tienes permiso para registrar personal de planta.'); }

        const fullName = String(req.body.full_name || '').trim().replace(/\s+/g, ' ');
        const ci = String(req.body.ci || '').trim().toUpperCase();
        const cellphone = String(req.body.cellphone || '').trim();
        const branchIds = [...new Set((Array.isArray(req.body.branch_ids) ? req.body.branch_ids : []).map(Number).filter(Number.isInteger))];
        if (fullName.length < 3 || fullName.length > 160) { await transaction.rollback(); return apiError(res, 422, 'Ingresa el nombre completo de la persona (3 a 160 caracteres).'); }
        if (!/^[A-Z0-9][A-Z0-9./ -]{2,31}$/.test(ci)) { await transaction.rollback(); return apiError(res, 422, 'Ingresa un CI válido.'); }
        if (!/^\+?[0-9][0-9 ()-]{6,22}$/.test(cellphone)) { await transaction.rollback(); return apiError(res, 422, 'Ingresa un número celular válido.'); }
        if (!branchIds.length) { await transaction.rollback(); return apiError(res, 422, 'Asigna a la persona a una o más sucursales.'); }
        if (branchIds.some(id => !canAccessBranch(req.userAuth, id))) { await transaction.rollback(); return apiError(res, 403, 'Solo puedes asignar personal a sucursales autorizadas.'); }
        const branches = await Sucursal.findAll({ where: { id: branchIds, status: true }, attributes: ['id'], transaction });
        if (branches.length !== branchIds.length) { await transaction.rollback(); return apiError(res, 422, 'Una o más sucursales no existen o están inactivas.'); }
        const existing = await PlantPersonnel.findOne({ where: sequelize.where(sequelize.fn('LOWER', sequelize.col('ci')), ci.toLowerCase()), transaction });
        if (existing) { await transaction.rollback(); return apiError(res, 409, 'Ya existe una persona registrada con ese CI.'); }

        const clean = (value, max) => value == null ? null : String(value).trim().slice(0, max) || null;
        const email = clean(req.body.email, 160);
        if (email && !/^\S+@\S+\.\S+$/.test(email)) { await transaction.rollback(); return apiError(res, 422, 'El correo electrónico no es válido.'); }
        const person = await PlantPersonnel.create({
            full_name: fullName, ci, cellphone, email, address: clean(req.body.address, 240),
            job_title: clean(req.body.job_title, 120), area: clean(req.body.area, 120),
            emergency_name: clean(req.body.emergency_name, 160), emergency_phone: clean(req.body.emergency_phone, 24),
            emergency_relationship: clean(req.body.emergency_relationship, 80), notes: clean(req.body.notes, 2000),
            ...personnelFichaFields(req.body, clean),
            is_active: true, created_by: req.userAuth.id,
        }, { transaction });
        if (!person.record_number) await person.update({ record_number: `PP-${String(person.id).padStart(6, '0')}` }, { transaction });
        await PlantPersonnelBranch.bulkCreate(branchIds.map(id_sucursal => ({ id_personal: person.id, id_sucursal, assigned_by: req.userAuth.id })), { transaction });
        await transaction.commit();
        return res.status(201).json({ ok: true, personnel: person, branch_ids: branchIds });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') return apiError(res, 409, 'Ya existe una persona registrada con ese CI.');
        console.log(error);
        return apiError(res, 500, 'No se pudo registrar a la persona de planta.');
    }
};

const personnelFichaFields = (body, clean = (value, max) => value == null ? null : String(value).trim().slice(0, max) || null) => ({
    registration_date: body.registration_date || null, birth_date: body.birth_date || null,
    nationality: clean(body.nationality, 100), corporate_phone: clean(body.corporate_phone, 24),
    home_phone: clean(body.home_phone, 24), marital_status: clean(body.marital_status, 40),
    corporate_email: clean(body.corporate_email, 160), city: clean(body.city, 100),
    province: clean(body.province, 100), zone: clean(body.zone, 120),
    has_children: Boolean(body.has_children), children: Array.isArray(body.children) ? body.children.slice(0, 5) : [],
    company_family: Array.isArray(body.company_family) ? body.company_family.slice(0, 2) : [],
    has_company_family: Boolean(body.has_company_family), emergency2_name: clean(body.emergency2_name, 160),
    emergency2_phone: clean(body.emergency2_phone, 24), profession: clean(body.profession, 160),
    academic_institution: clean(body.academic_institution, 160), graduation_year: clean(body.graduation_year, 12),
    studying: Boolean(body.studying), study_nationality: clean(body.study_nationality, 100),
    general_experience_years: body.general_experience_years === '' ? null : body.general_experience_years || null,
    specific_experience_years: body.specific_experience_years === '' ? null : body.specific_experience_years || null,
    hire_date: body.hire_date || null, retirement_date: body.retirement_date || null,
    salary: body.salary === '' ? null : body.salary || null, contract_type: clean(body.contract_type, 80),
    bank_account: clean(body.bank_account, 80), bank_name: clean(body.bank_name, 120),
    guarantor_name: clean(body.guarantor_name, 160), guarantor_ci: clean(body.guarantor_ci, 32),
    guarantor_address: clean(body.guarantor_address, 240), guarantor_phone: clean(body.guarantor_phone, 24),
    document_checklist: Array.isArray(body.document_checklist) ? body.document_checklist.slice(0, 13) : [],
    observations: clean(body.observations, 4000),
});

const getCajaPersonnelDetail = async (req = request, res = response) => {
    try {
        const id = Number(req.params.id_personal);
        if (!Number.isInteger(id) || id < 1) return apiError(res, 422, 'La persona indicada no es válida.');
        const person = await PlantPersonnel.findByPk(id, { include: [{ model: Sucursal, as: 'branches', attributes: ['id', 'name', 'city'], through: { attributes: [] } }] });
        if (!person || !person.branches.some(branch => canAccessBranch(req.userAuth, branch.id))) return apiError(res, 404, 'No se encontró la persona en tus sucursales autorizadas.');
        if (!canManagePersonnel(req.userAuth, 'view') && !canManagePersonnel(req.userAuth, 'create')) return apiError(res, 403, 'No tienes permiso para consultar personal de planta.');
        person.setDataValue('branches', person.branches.filter(branch => canAccessBranch(req.userAuth, branch.id)));
        return res.status(200).json({ ok: true, personnel: person });
    } catch (error) {
        console.log(error);
        return apiError(res, 500, 'No se pudo consultar la ficha de personal.');
    }
};

const updateCajaPersonnel = async (req = request, res = response) => {
    const transaction = await sequelize.transaction();
    try {
        const id = Number(req.params.id_personal);
        const person = await PlantPersonnel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!person) { await transaction.rollback(); return apiError(res, 404, 'No se encontró la persona de planta.'); }
        if (!canManagePersonnel(req.userAuth, 'update')) { await transaction.rollback(); return apiError(res, 403, 'No tienes permiso para editar personal de planta.'); }
        const fullName = String(req.body.full_name || '').trim().replace(/\s+/g, ' ');
        const ci = String(req.body.ci || '').trim().toUpperCase();
        const cellphone = String(req.body.cellphone || '').trim();
        const branchIds = [...new Set((Array.isArray(req.body.branch_ids) ? req.body.branch_ids : []).map(Number).filter(Number.isInteger))];
        if (fullName.length < 3 || fullName.length > 160 || !/^[A-Z0-9][A-Z0-9./ -]{2,31}$/.test(ci) || !/^\+?[0-9][0-9 ()-]{6,22}$/.test(cellphone)) { await transaction.rollback(); return apiError(res, 422, 'Revisa nombre completo, CI y número celular.'); }
        if (!branchIds.length || branchIds.some(branchId => !canAccessBranch(req.userAuth, branchId))) { await transaction.rollback(); return apiError(res, 403, 'Asigna a la persona solo a sucursales autorizadas.'); }
        const branches = await Sucursal.findAll({ where: { id: branchIds, status: true }, attributes: ['id'], transaction });
        if (branches.length !== branchIds.length) { await transaction.rollback(); return apiError(res, 422, 'Una o más sucursales no existen o están inactivas.'); }
        const priorAssignments = await PlantPersonnelBranch.findAll({ where: { id_personal: id }, attributes: ['id_sucursal'], transaction });
        const protectedBranchIds = priorAssignments.map(row => Number(row.id_sucursal)).filter(branchId => !canAccessBranch(req.userAuth, branchId));
        const nextBranchIds = [...new Set([...branchIds, ...protectedBranchIds])];
        const existing = await PlantPersonnel.findOne({ where: { id: { [Op.ne]: id }, [Op.and]: [sequelize.where(sequelize.fn('LOWER', sequelize.col('ci')), ci.toLowerCase())] }, transaction });
        if (existing) { await transaction.rollback(); return apiError(res, 409, 'Ya existe otra persona registrada con ese CI.'); }
        const clean = (value, max) => value == null ? null : String(value).trim().slice(0, max) || null;
        const email = clean(req.body.email, 160);
        if (email && !/^\S+@\S+\.\S+$/.test(email)) { await transaction.rollback(); return apiError(res, 422, 'El correo electrónico no es válido.'); }
        await person.update({ full_name: fullName, ci, cellphone, email, address: clean(req.body.address, 240), job_title: clean(req.body.job_title, 120), area: clean(req.body.area, 120), emergency_name: clean(req.body.emergency_name, 160), emergency_phone: clean(req.body.emergency_phone, 24), emergency_relationship: clean(req.body.emergency_relationship, 80), notes: clean(req.body.notes, 2000), ...personnelFichaFields(req.body, clean) }, { transaction });
        await PlantPersonnelBranch.destroy({ where: { id_personal: id }, transaction });
        await PlantPersonnelBranch.bulkCreate(nextBranchIds.map(id_sucursal => ({ id_personal: id, id_sucursal, assigned_by: req.userAuth.id })), { transaction });
        await transaction.commit();
        const updated = await PlantPersonnel.findByPk(id, { include: [{ model: Sucursal, as: 'branches', attributes: ['id', 'name', 'city'], through: { attributes: [] } }] });
        const [visibleUpdated] = await attachAllPersonnelBranches([updated], req.userAuth);
        return res.status(200).json({ ok: true, personnel: visibleUpdated, branch_ids: nextBranchIds });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') return apiError(res, 409, 'Ya existe otra persona registrada con ese CI.');
        console.log(error);
        return apiError(res, 500, 'No se pudo actualizar la ficha de personal.');
    }
};

const deleteCajaPersonnel = async (req = request, res = response) => {
    try {
        const id = Number(req.params.id_personal);
        const person = await PlantPersonnel.findByPk(id, { include: [{ model: Sucursal, as: 'branches', attributes: ['id'], through: { attributes: [] } }] });
        if (!person || !person.branches.some(branch => canAccessBranch(req.userAuth, branch.id))) return apiError(res, 404, 'No se encontró la persona en tus sucursales autorizadas.');
        if (!canManagePersonnel(req.userAuth, 'delete')) return apiError(res, 403, 'No tienes permiso para dar de baja personal de planta.');
        await person.update({ is_active: false });
        return res.status(200).json({ ok: true });
    } catch (error) {
        console.log(error);
        return apiError(res, 500, 'No se pudo dar de baja a la persona.');
    }
};

const getCajaExpenses = async (req = request, res = response) => {
    try {
        if (req.query.cashbox_type && !['CHICA', 'MAYOR'].includes(String(req.query.cashbox_type).trim().toUpperCase())) return apiError(res, 422, 'cashbox_type debe ser CHICA o MAYOR.');
        const cashboxType = normalizeCashboxType(req.query.cashbox_type);
        if (!canViewExpenseManagement(req.userAuth, cashboxType)) return apiError(res, 403, `No tienes permiso para consultar gastos de Caja ${cashboxType}.`);

        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
        const branchId = req.query.id_sucursal ? Number.parseInt(req.query.id_sucursal, 10) : null;
        const categoryId = req.query.id_categoria ? Number.parseInt(req.query.id_categoria, 10) : null;
        const accountId = req.query.id_cuenta ? Number.parseInt(req.query.id_cuenta, 10) : null;
        const status = String(req.query.status || '').trim().toUpperCase();
        const search = String(req.query.search || '').trim();

        if (req.query.id_sucursal && (!Number.isInteger(branchId) || branchId < 1)) return apiError(res, 422, 'La sucursal indicada no es válida.');
        if (branchId && !canAccessBranch(req.userAuth, branchId)) return apiError(res, 403, 'No tienes permiso para consultar gastos de esta sucursal.');
        if (req.query.id_categoria && (!Number.isInteger(categoryId) || categoryId < 1)) return apiError(res, 422, 'La categoría indicada no es válida.');
        if (req.query.id_cuenta && (!Number.isInteger(accountId) || accountId < 1)) return apiError(res, 422, 'La cuenta indicada no es válida.');
        if (status && !['ACTIVE', 'REVERSED'].includes(status)) return apiError(res, 422, 'El estado debe ser ACTIVE o REVERSED.');

        const where = {};
        if (categoryId) where.id_categoria = categoryId;
        if (accountId) where.id_cuenta = accountId;
        const createdAt = {};
        const parseDate = value => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
            const date = new Date(`${value}T00:00:00.000Z`);
            return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
        };
        if (req.query.date_from) {
            const from = parseDate(req.query.date_from);
            if (!from) return apiError(res, 422, 'date_from debe tener formato YYYY-MM-DD.');
            createdAt[Op.gte] = from;
        }
        if (req.query.date_to) {
            const to = parseDate(req.query.date_to);
            if (!to) return apiError(res, 422, 'date_to debe tener formato YYYY-MM-DD.');
            to.setUTCHours(23, 59, 59, 999);
            createdAt[Op.lte] = to;
        }
        if (createdAt[Op.gte] && createdAt[Op.lte] && createdAt[Op.gte] > createdAt[Op.lte]) return apiError(res, 422, 'El rango de fechas no es válido.');
        if (Object.keys(createdAt).length) where.expense_date = createdAt;
        if (search) where[Op.or] = [
            { description: { [Op.iLike]: `%${search}%` } },
            { concept: { [Op.iLike]: `%${search}%` } },
            { provider_name: { [Op.iLike]: `%${search}%` } },
            { provider_tax_id: { [Op.iLike]: `%${search}%` } },
            { receipt_number: { [Op.iLike]: `%${search}%` } },
            { responsible: { [Op.iLike]: `%${search}%` } },
            { '$category.name$': { [Op.iLike]: `%${search}%` } },
            { '$account.name$': { [Op.iLike]: `%${search}%` } },
            { '$user.full_names$': { [Op.iLike]: `%${search}%` } },
        ];
        if (status) {
            const reversedExpense = `EXISTS (SELECT 1 FROM cj_ledger reversal JOIN cj_ledger source ON source.id = reversal.reversal_of WHERE source.source_type = 'EXPENSE' AND source.source_id = "CjExpense"."id"::text AND reversal.source_type = 'REVERSAL')`;
            where[Op.and] = [sequelize.literal(status === 'REVERSED' ? reversedExpense : `NOT ${reversedExpense}`)];
        }

        const userRole = req.userAuth?.role;
        const assignedBranches = (req.userAuth?.assign_sucursales || []).filter(item => item.status !== false).map(item => Number(item.id_sucursal));
        const branchWhere = branchId ? { id_sucursal: branchId } : ['ADMINISTRADOR', 'DESARROLLADOR'].includes(userRole)
            ? {} : { id_sucursal: { [Op.in]: assignedBranches.length ? assignedBranches : [-1] } };
        const result = await CjExpense.findAndCountAll({
            where,
            include: [
                { association: 'session', required: true, where: { cashbox_type: cashboxType, ...branchWhere }, attributes: ['id', 'id_sucursal', 'cashbox_type', 'date_apertura', 'date_cierre', 'session_state'], include: [{ association: 'sucursal', attributes: ['id', 'name'] }] },
                { association: 'account', required: true, attributes: ['id', 'code', 'name', 'type', 'currency'] },
                { association: 'category', required: true, attributes: ['id', 'name'] },
                { association: 'user', required: true, attributes: ['id', 'full_names'] },
                { association: 'attachments', required: false, attributes: ['id', 'file_name', 'mime_type', 'file_size', 'uploaded_by', 'createdAt'] },
            ],
            distinct: true,
            order: [['createdAt', 'DESC'], ['id', 'DESC']],
            offset: (page - 1) * limit,
            limit,
        });
        const expenseIds = result.rows.map(expense => String(expense.id));
        const originals = expenseIds.length ? await CjLedger.findAll({ where: { source_type: 'EXPENSE', source_id: { [Op.in]: expenseIds } }, attributes: ['id', 'source_id'] }) : [];
        const originalIds = originals.map(item => item.id);
        const reversals = originalIds.length ? await CjLedger.findAll({ where: { reversal_of: { [Op.in]: originalIds } }, attributes: ['id', 'reversal_of', 'reason', 'posted_at', 'id_user'] }) : [];
        const sourceByLedgerId = new Map(originals.map(item => [Number(item.id), String(item.source_id)]));
        const reversalByExpenseId = new Map(reversals.map(item => [sourceByLedgerId.get(Number(item.reversal_of)), item]).filter(([expenseId]) => expenseId));
        const total = typeof result.count === 'number' ? result.count : result.count.length;
        return res.status(200).json({
            ok: true,
            page: { current: page, limit, total, pages: Math.ceil(total / limit) },
            data: result.rows.map(expense => {
                const reversal = reversalByExpenseId.get(String(expense.id));
                return { ...expense.toJSON(), status: reversal ? 'REVERSED' : 'ACTIVE', reversal: reversal ? { id: reversal.id, reason: reversal.reason, date: reversal.posted_at, id_user: reversal.id_user } : null };
            }),
        });
    } catch (error) {
        console.error('Error al consultar gastos de Caja:', error);
        return apiError(res, 500, 'No se pudo consultar la gestión de gastos.');
    }
}

const createCajaExpense = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id_sucursal, id_cuenta, id_categoria, description, amount } = req.body;
        const cleanText = (value, max) => value == null ? null : String(value).trim().slice(0, max) || null;
        const registerType = String(req.body.register_type || 'GASTO').trim().toUpperCase();
        const expenseDate = req.body.expense_date ? new Date(req.body.expense_date) : new Date();
        const receiptDate = req.body.receipt_date ? new Date(req.body.receipt_date) : null;
        const concept = cleanText(req.body.concept, 200);
        const responsible = cleanText(req.body.responsible, 160);
        const receiptType = cleanText(req.body.receipt_type, 24);
        if (!['GASTO', 'ACTIVO'].includes(registerType)) { await t.rollback(); return apiError(res, 422, 'Selecciona un tipo de registro válido.'); }
        if (Number.isNaN(expenseDate.getTime()) || (receiptDate && Number.isNaN(receiptDate.getTime()))) { await t.rollback(); return apiError(res, 422, 'La fecha del gasto o comprobante no es válida.'); }
        if (!concept || !responsible || !String(description || '').trim()) { await t.rollback(); return apiError(res, 422, 'El concepto, la descripción y el responsable son obligatorios.'); }
        if (receiptType && !['FACTURA', 'RECIBO', 'NOTA_DEBITO', 'TICKET', 'SIN_COMPROBANTE'].includes(receiptType)) { await t.rollback(); return apiError(res, 422, 'El tipo de comprobante no es válido.'); }
        if (receiptType !== 'SIN_COMPROBANTE' && !receiptType) { await t.rollback(); return apiError(res, 422, 'Selecciona el tipo de comprobante.'); }
        const cashboxType = normalizeCashboxType(req.body.cashbox_type);
        if (invalidRequestedCashboxType(req.body.cashbox_type)) { await t.rollback(); return apiError(res, 422, 'cashbox_type debe ser CHICA o MAYOR.'); }
        if (!canAccessCashbox(req.userAuth, cashboxType, 'create')) { await t.rollback(); return apiError(res, 403, `No tienes permiso para registrar gastos en Caja ${cashboxType}.`); }
        if (!canAccessBranch(req.userAuth, id_sucursal)) { await t.rollback(); return apiError(res, 403, 'No tienes permiso para registrar gastos en esta sucursal.'); }
        const idempotencyKey = req.get('Idempotency-Key');
        if (idempotencyKey) {
            const prior = await CjLedger.findOne({ where: { idempotency_key: `EXPENSE-${idempotencyKey}` }, transaction: t });
            if (prior) { await t.commit(); return res.status(200).json({ ok: true, repeated: true, id_gasto: prior.source_id }); }
        }
        const session = await CajaSmall.findOne({ where: { id_sucursal, cashbox_type: cashboxType, session_state: 'OPEN' }, transaction: t, lock: t.LOCK.UPDATE });
        if (!session) { await t.rollback(); return apiError(res, 422, 'Debe existir una sesión de Caja abierta para registrar el gasto.'); }
        if (!canAccessSession(req.userAuth, session)) { await t.rollback(); return apiError(res, 403, 'No tienes permiso para operar esta Caja.'); }
        const account = (await getSessionAccounts(session, t, true)).find(item => item.id === Number(id_cuenta));
        if (!account) { await t.rollback(); return apiError(res, 422, 'La cuenta no está activa o asignada a esta sucursal.'); }
        const category = await CjExpenseCategory.findOne({ where: { id: id_categoria, is_active: true, cashbox_type: cashboxType }, transaction: t });
        if (!category) { await t.rollback(); return apiError(res, 422, 'Selecciona una categoría de gasto activa.'); }
        const value = money(amount);
        if (!(value > 0)) { await t.rollback(); return apiError(res, 422, 'El importe del gasto debe ser mayor que cero.'); }
        const expected = await getAccountExpected(session.id, account.id, t);
        if (value > expected) { await t.rollback(); return apiError(res, 422, `Saldo insuficiente en ${account.name}. Disponible: ${expected.toFixed(2)} ${account.currency}.`); }
        const expenseDetails = req.body.expense_details && typeof req.body.expense_details === 'object' && !Array.isArray(req.body.expense_details) ? req.body.expense_details : {};
        const expense = await CjExpense.create({ id_caja_small: session.id, id_cuenta: account.id, id_categoria: category.id,
            description: cleanText(description, 500), concept, register_type: registerType, expense_date: expenseDate, responsible,
            provider_name: cleanText(req.body.provider_name, 160), provider_tax_id: cleanText(req.body.provider_tax_id, 32),
            receipt_type: receiptType, receipt_number: cleanText(req.body.receipt_number, 80), receipt_date: receiptDate,
            expense_details: expenseDetails, amount: value, currency: account.currency, id_user: req.userAuth.id }, { transaction: t });
        const movement = await DetailsCajaSmall.create({ id_caja_small: session.id, id_cuenta: account.id, id_user: req.userAuth.id,
            date: new Date(), type: 'GASTO', type_payment: account.type === 'CASH' ? 'EFECTIVO' : account.type,
            id_bank: account.id_bank || null, monto: value, description, status: true, source_type: 'EXPENSE', source_id: String(expense.id) }, { transaction: t });
        expense.id_detail_caja_small = movement.id; await expense.save({ transaction: t });
        await CjLedger.create({ id_caja_small: session.id, id_cuenta: account.id, id_detail_caja_small: movement.id, direction: 'OUT', amount: value,
            currency: account.currency, source_type: 'EXPENSE', source_id: String(expense.id), idempotency_key: idempotencyKey ? `EXPENSE-${idempotencyKey}` : `EXPENSE-${expense.id}`,
            id_user: req.userAuth.id, posted_at: new Date() }, { transaction: t });
        await History.create({ id_user: req.userAuth.id, description: `GASTO DE CAJA: ${description}`, type: 'NUEVO GASTO', module: 'CAJA',
            id_sucursal, action: 'create', id_reference: expense.id, status: true }, { transaction: t });
        await t.commit();
        return res.status(201).json({ ok: true, expense });
    } catch (error) {
        if (!t.finished) await t.rollback();
        console.log(error);
        return apiError(res, error.statusCode || 500, error.statusCode ? error.message : 'Ocurrió un problema al registrar el gasto.');
    }
}

const reverseCajaMovement = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { reason } = req.body;
        if (!reason?.trim() || reason.trim().length < 5) { await t.rollback(); return apiError(res, 422, 'Explica el motivo de la corrección (mínimo 5 caracteres).'); }
        const original = await CjLedger.findByPk(req.params.id_movimiento, { transaction: t, lock: t.LOCK.UPDATE });
        if (!original) { await t.rollback(); return apiError(res, 404, 'No se encontró el movimiento de Caja.'); }
        if (original.reversal_of) { await t.rollback(); return apiError(res, 422, 'Una reversión no puede revertirse directamente.'); }
        const existing = await CjLedger.findOne({ where: { reversal_of: original.id }, transaction: t });
        if (existing) { await t.rollback(); return apiError(res, 422, 'El movimiento ya tiene una reversión registrada.'); }
        const session = await CajaSmall.findByPk(original.id_caja_small, { transaction: t, lock: t.LOCK.UPDATE });
        if (!session || session.session_state !== 'OPEN') { await t.rollback(); return apiError(res, 422, 'El movimiento pertenece a una sesión cerrada; su arqueo es inmutable.'); }
        if (!canAccessSession(req.userAuth, session)) { await t.rollback(); return apiError(res, 403, 'No tienes permiso para operar esta Caja.'); }
        const account = await CjAccount.findByPk(original.id_cuenta, { transaction: t });
        const direction = original.direction === 'IN' ? 'OUT' : 'IN';
        if (direction === 'OUT') {
            const expected = await getAccountExpected(session.id, original.id_cuenta, t);
            if (Number(original.amount) > expected) { await t.rollback(); return apiError(res, 422, `No se puede revertir: saldo disponible ${expected.toFixed(2)} ${original.currency} es menor al importe.`); }
        }
        const movement = await DetailsCajaSmall.create({ id_caja_small: session.id, id_cuenta: original.id_cuenta, id_user: req.userAuth.id,
            date: new Date(), type: direction === 'IN' ? 'INGRESO' : 'GASTO', type_payment: account?.type === 'CASH' ? 'EFECTIVO' : account?.type || 'EFECTIVO', id_bank: account?.id_bank || null, monto: original.amount,
            description: `REVERSIÓN MOVIMIENTO #${original.id}: ${reason.trim()}`, status: true, source_type: 'REVERSAL', source_id: String(original.id), idempotency_key: `REVERSAL-${original.id}` }, { transaction: t });
        const reversal = await CjLedger.create({ id_caja_small: session.id, id_cuenta: original.id_cuenta, id_detail_caja_small: movement.id,
            direction, amount: original.amount, currency: original.currency, source_type: 'REVERSAL', source_id: String(original.id),
            idempotency_key: `REVERSAL-${original.id}`, id_user: req.userAuth.id, posted_at: new Date(), reversal_of: original.id, reason: reason.trim() }, { transaction: t });
        await History.create({ id_user: req.userAuth.id, description: `REVERSIÓN DE MOVIMIENTO DE CAJA #${original.id}: ${reason.trim()}`,
            type: 'REVERSIÓN CAJA', module: 'CAJA', id_sucursal: session.id_sucursal, action: 'reverse', id_reference: reversal.id, status: true }, { transaction: t });
        await t.commit();
        return res.status(201).json({ ok: true, msg: 'Reversión registrada. El movimiento original se conserva.', reversal });
    } catch (error) {
        if (!t.finished) await t.rollback();
        console.log(error);
        return apiError(res, error.name === 'SequelizeUniqueConstraintError' ? 422 : 500, error.name === 'SequelizeUniqueConstraintError' ? 'El movimiento ya tiene una reversión registrada.' : 'Ocurrió un problema al revertir el movimiento.');
    }
}

const uploadExpenseAttachment = async (req = request, res = response) => {
    let storedPath;
    try {
        const id_gasto = Number(req.params.id_gasto);
        const file = req.file || Object.values(req.files || {})[0];
        if (!file) return apiError(res, 422, 'Selecciona el comprobante que deseas adjuntar.');
        if (file.size > 8_033_987) return apiError(res, 422, 'El archivo no puede superar los 8 MB.');
        const mime = file.mimetype || file.mimetype;
        if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mime)) return apiError(res, 422, 'Solo se permiten comprobantes PDF, JPG o PNG.');
        const expense = await CjExpense.findByPk(id_gasto, { include: [{ association: 'session' }] });
        if (!expense) return apiError(res, 404, 'No se encontró el gasto para adjuntar el comprobante.');
        if (!canAccessSession(req.userAuth, expense.session)) return apiError(res, 403, 'No tienes permiso para acceder a este comprobante de Caja.');
        if (!canAccessCashbox(req.userAuth, expense.session?.cashbox_type, 'create')) return apiError(res, 403, 'No tienes permiso para adjuntar documentos en esta Caja.');
        if (!canAccessBranch(req.userAuth, expense.session?.id_sucursal)) return apiError(res, 403, 'No tienes acceso a los documentos de esta sucursal.');
        const uploadRoot = process.env.RESOURCES_PATH ? path.resolve(process.env.RESOURCES_PATH) : path.join(__dirname, '../../uploads');
        const directory = path.join(uploadRoot, 'caja-gastos');
        fs.mkdirSync(directory, { recursive: true });
        const extension = mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg';
        const fileName = `${crypto.randomUUID()}${extension}`;
        storedPath = path.join(directory, fileName);
        if (typeof file.mv === 'function') await file.mv(storedPath);
        else fs.writeFileSync(storedPath, file.data);
        const t = await sequelize.transaction();
        try {
            const attachment = await CjExpenseAttachment.create({ id_gasto, file_name: file.name || file.originalname || fileName,
                file_path: path.join('caja-gastos', fileName), mime_type: mime, file_size: file.size, uploaded_by: req.userAuth.id }, { transaction: t });
            await t.commit();
            return res.status(201).json({ ok: true, attachment });
        } catch (error) { await t.rollback(); throw error; }
    } catch (error) {
        if (storedPath && fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
        console.log(error);
        return apiError(res, 500, 'No se pudo guardar el documento adjunto.');
    }
}

const getExpenseAttachments = async (req = request, res = response) => {
    try {
        const attachment = await CjExpenseAttachment.findOne({ where: { id: req.params.id_adjunto, id_gasto: req.params.id_gasto }, include: [{ association: 'expense', include: [{ association: 'session' }] }] });
        if (!attachment) return apiError(res, 404, 'No se encontró el documento adjunto.');
        if (!canAccessSession(req.userAuth, attachment.expense?.session)) return apiError(res, 403, 'No tienes permiso para acceder a este comprobante de Caja.');
        if (!canAccessBranch(req.userAuth, attachment.expense?.session?.id_sucursal)) return apiError(res, 403, 'No tienes acceso a este documento.');
        const uploadRoot = process.env.RESOURCES_PATH ? path.resolve(process.env.RESOURCES_PATH) : path.join(__dirname, '../../uploads');
        return res.sendFile(path.resolve(uploadRoot, attachment.file_path));
    } catch (error) {
        console.log(error);
        return apiError(res, 500, 'No se pudo recuperar el documento adjunto.');
    }
}


const getTotalesAndMovements = async (id_caja_small, monto_apertura) => {
    const total_ingresos = await DetailsCajaSmall.sum('monto', { where: {id_caja_small, type: 'INGRESO', status: true } }); // 50
    const total_gastos = await DetailsCajaSmall.sum('monto', { where: {id_caja_small, type: 'GASTO', status: true } }); // 50
    const movementInclude = [{ association: 'account', attributes: ['id', 'name', 'currency', 'type'] }];
    const ingresos = await DetailsCajaSmall.findAll({ where: {id_caja_small, type: 'INGRESO', status: true }, include: movementInclude });
    const gastos = await DetailsCajaSmall.findAll({ where: {id_caja_small, type: 'GASTO', status: true }, include: movementInclude });
    const saldo = Number(total_ingresos) - Number(total_gastos);
    const monto_apertura_mas_saldo = Number(monto_apertura) + Number(saldo);
    return {
        id_caja_small,
        total_ingresos,
        total_gastos,
        saldo,
        monto_apertura:Number(monto_apertura),
        monto_apertura_mas_saldo,
        ingresos,
        gastos
    }
}
const openCajaSmall = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { monto_apertura = 0, id_sucursal, balances = [] } = req.body;
        const cashboxType = normalizeCashboxType(req.body.cashbox_type);
        const id_user = req.userAuth.id;
        if (!canAccessBranch(req.userAuth, id_sucursal)) { await t.rollback(); return apiError(res, 403, 'No tienes permiso para operar la Caja de esta sucursal.'); }
        if (!['CHICA', 'MAYOR'].includes(String(req.body.cashbox_type || 'CHICA').toUpperCase())) { await t.rollback(); return apiError(res, 422, 'Selecciona Caja Chica o Caja Mayor.'); }
        if (!canAccessCashbox(req.userAuth, cashboxType, 'create')) { await t.rollback(); return apiError(res, 403, `No tienes permiso para abrir Caja ${cashboxType}.`); }
        const caja = await CjCaja.findOne({ where: { id_sucursal, cashbox_type: cashboxType, status: true }, transaction: t, lock: t.LOCK.UPDATE });
        if (!caja) { await t.rollback(); return apiError(res, 422, 'No existe una Caja activa para la sucursal.'); }
        const open = await CajaSmall.findOne({ where: { id_sucursal, cashbox_type: cashboxType, session_state: 'OPEN' }, transaction: t, lock: t.LOCK.UPDATE });
        if (open) { await t.rollback(); return apiError(res, 422, 'Ya existe una sesión de Caja abierta en esta sucursal.'); }
        const assignedAccounts = await getAssignedAccounts(caja.id, t, true);
        const accounts = accountsForCashbox(assignedAccounts, cashboxType);
        if (accounts.length !== assignedAccounts.length) { await t.rollback(); return apiError(res, 422, `La asignaci?n contiene cuentas incompatibles con Caja ${cashboxType}. Corrige las cuentas antes de abrir.`); }
        if (!accounts.length) { await t.rollback(); return apiError(res, 422, 'La sucursal no tiene cuentas activas asignadas.'); }
        let requested;
        try {
            requested = normalizeAccountAmounts(balances, 'opening_amount', 'saldo de apertura');
            assertAccountsMatch(requested, accounts, { requireAll: false });
        } catch (error) {
            await t.rollback(); return apiError(res, error.statusCode || 422, error.message);
        }
        if (!balances.length) { const cash = accounts.find(a => a.type === 'CASH'); if (cash) requested.set(cash.id, money(monto_apertura)); }
        for (const [accountId, amount] of requested) {
            if (!accounts.some(account => account.id === accountId)) { await t.rollback(); return apiError(res, 422, 'La apertura contiene una cuenta no asignada a la sucursal.'); }
            if (amount < 0) { await t.rollback(); return apiError(res, 422, 'El saldo de apertura no puede ser negativo.'); }
        }
        const selectedAccounts = accounts.filter(account => requested.has(account.id));
        if (selectedAccounts.length !== requested.size) { await t.rollback(); return apiError(res, 422, 'La apertura contiene cuentas que no están asignadas a esta Caja.'); }
        const cashAccounts = selectedAccounts.filter(account => account.type === 'CASH');
        const bankAccounts = selectedAccounts.filter(account => account.type !== 'CASH');
        if (cashboxType === 'CHICA' && (cashAccounts.length !== 1 || cashAccounts[0].currency !== 'BOB')) { await t.rollback(); return apiError(res, 422, 'Caja Chica requiere una sola cuenta de efectivo en Bs.'); }
        if (cashboxType === 'MAYOR' && !cashAccounts.some(account => account.currency === 'BOB')) { await t.rollback(); return apiError(res, 422, 'Caja Mayor requiere una cuenta de efectivo en Bs; USD es opcional.'); }
        if (cashboxType === 'MAYOR' && new Set(cashAccounts.map(account => account.currency)).size !== cashAccounts.length) { await t.rollback(); return apiError(res, 422, 'Caja Mayor permite una sola cuenta de efectivo por moneda.'); }
        if (cashboxType === 'CHICA' && bankAccounts.length !== 1) { await t.rollback(); return apiError(res, 422, 'Selecciona exactamente una cuenta bancaria en Bs para Caja Chica.'); }
        if (cashboxType === 'MAYOR' && bankAccounts.length < 1) { await t.rollback(); return apiError(res, 422, 'Caja Mayor requiere al menos una cuenta bancaria.'); }
        if (cashboxType === 'MAYOR' && selectedAccounts.length !== accounts.length) { await t.rollback(); return apiError(res, 422, 'Registra saldo inicial para cada cuenta seleccionada de Caja Mayor.'); }
        const cashAmount = requested.get(cashAccounts.find(account => account.currency === 'BOB')?.id) || 0;
        const session = await CajaSmall.create({ date_apertura: new Date(), monto_apertura: cashAmount, id_user, id_sucursal, id_caja: caja.id, status: 'ABIERTO', session_state: 'OPEN', cashbox_type: cashboxType }, { transaction: t });
        const snapshots = selectedAccounts.map(account => ({ id_caja_small: session.id, id_cuenta: account.id, opening_amount: requested.get(account.id), currency: account.currency, id_user }));
        await CjSessionBalance.bulkCreate(snapshots, { transaction: t });
        await History.create({ id_user, description: `APERTURA CAJA ${cashboxType} #${session.id}`, type: 'APERTURA CAJA', module: `CAJA ${cashboxType}`, id_sucursal, action: 'create', id_reference: session.id, status: true }, { transaction: t });
        await t.commit();
        NotificationService.notifyAdmins({ title: `Apertura de Caja ${cashboxType}`, message: `Se abrió una sesión de Caja ${cashboxType} en la sucursal ${id_sucursal}.`, type: 'CAJA', level: 'INFO', id_reference: session.id }, null, id_user).catch(error => console.error('No se pudo emitir notificación de apertura de Caja:', error));
        return res.status(201).json({ ok: true, msg: 'Caja abierta correctamente.', id_caja_small: session.id, balances: snapshots });
    } catch (error) {
        if (!t.finished) await t.rollback();
        console.log(error);
        if (error.name === 'SequelizeUniqueConstraintError') return apiError(res, 422, 'Ya existe una sesión de Caja abierta en esta sucursal.');
        return apiError(res, 500, 'Ocurrió un problema interno al abrir Caja.');
    }
}
const newDetailCajaSmall = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { type_payment, id_bank, id_cuenta, type, account_payment, monto, description, id_sucursal } = req.body;
        const cashboxType = normalizeCashboxType(req.body.cashbox_type);
        if (invalidRequestedCashboxType(req.body.cashbox_type)) { await t.rollback(); return apiError(res, 422, 'cashbox_type debe ser CHICA o MAYOR.'); }
        const id_user = req.userAuth.id;
        if (!canAccessCashbox(req.userAuth, cashboxType, 'create')) { await t.rollback(); return apiError(res, 403, `No tienes permiso para operar Caja ${cashboxType}.`); }
        if (!canAccessBranch(req.userAuth, id_sucursal)) { await t.rollback(); return apiError(res, 403, 'No tienes permiso para operar la Caja de esta sucursal.'); }
        const caja_small = await CajaSmall.findOne({ where: { id_sucursal, cashbox_type: cashboxType, session_state: 'OPEN' }, transaction: t, lock: t.LOCK.UPDATE });
        if (!caja_small) { await t.rollback(); return apiError(res, 422, 'No hay una sesión de Caja abierta para esta sucursal.'); }
        if (!canAccessSession(req.userAuth, caja_small)) { await t.rollback(); return apiError(res, 403, 'No tienes permiso para operar esta Caja.'); }
        const accounts = await getSessionAccounts(caja_small, t, true);
        const account = accounts.find(item => item.id === Number(id_cuenta)) || accounts.find(item => item.type === (type_payment === 'EFECTIVO' ? 'CASH' : 'BANK')) || accounts.find(item => item.type === 'CASH');
        if (!account) { await t.rollback(); return apiError(res, 422, 'Selecciona una cuenta activa asignada a esta sucursal.'); }
        if (type === 'INGRESO' && account.type !== 'CASH') { await t.rollback(); return apiError(res, 422, 'Los ingresos manuales solo pueden aumentar una cuenta de efectivo.'); }
        const amount = money(monto);
        if (!(amount > 0)) { await t.rollback(); return apiError(res, 422, 'El monto debe ser mayor que cero.'); }
        if (type === 'GASTO') {
            const expected = await getAccountExpected(caja_small.id, account.id, t);
            if (amount > expected) { await t.rollback(); return apiError(res, 422, `Saldo insuficiente en ${account.name}. Disponible: ${expected.toFixed(2)} ${account.currency}.`); }
        }
        const detail = await DetailsCajaSmall.create({ id_caja_small: caja_small.id, date: new Date(), type, type_payment, id_bank: account.id_bank || id_bank,
            id_cuenta: account.id, id_user, source_type: 'MANUAL', source_id: null, account_payment, monto: amount, description, status: true }, { transaction: t });
        detail.source_id = String(detail.id); detail.idempotency_key = `MANUAL-${detail.id}`; await detail.save({ transaction: t });
        await CjLedger.create({ id_caja_small: caja_small.id, id_cuenta: account.id, id_detail_caja_small: detail.id, direction: type === 'INGRESO' ? 'IN' : 'OUT',
            amount, currency: account.currency, source_type: 'MANUAL', source_id: String(detail.id), idempotency_key: `MANUAL-${detail.id}`, id_user, posted_at: new Date() }, { transaction: t });
        await History.create({ id_user, description: `NUEVO ${type} CONCEPTO: ${description}`, type: `NUEVO ${type}`, module: 'CAJA', id_sucursal, action: 'create', id_reference: detail.id, status: true }, { transaction: t });
        await t.commit();
        return res.status(201).json({ ok: true, msg: 'Movimiento registrado exitosamente', movement: detail });
    } catch (error) {
        if (!t.finished) await t.rollback();
        console.log(error);
        return apiError(res, 500, 'Ocurrió un problema al registrar el movimiento.');
    }
}
const closeCajaSmall = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { monto_cierre, id_sucursal, balances = [], observations } = req.body;
        const cashboxType = normalizeCashboxType(req.body.cashbox_type);
        if (invalidRequestedCashboxType(req.body.cashbox_type)) { await t.rollback(); return apiError(res, 422, 'cashbox_type debe ser CHICA o MAYOR.'); }
        const id_user = req.userAuth.id;
        if (!canAccessCashbox(req.userAuth, cashboxType, 'create')) { await t.rollback(); return apiError(res, 403, `No tienes permiso para cerrar Caja ${cashboxType}.`); }
        if (!canAccessBranch(req.userAuth, id_sucursal)) { await t.rollback(); return apiError(res, 403, 'No tienes permiso para cerrar la Caja de esta sucursal.'); }
        const caja_small = await CajaSmall.findOne({ where: { id_sucursal, cashbox_type: cashboxType, session_state: 'OPEN' }, transaction: t, lock: t.LOCK.UPDATE });
        if (!caja_small) { await t.rollback(); return apiError(res, 422, 'No hay una sesión de Caja abierta para esta sucursal.'); }
        if (!canAccessSession(req.userAuth, caja_small)) { await t.rollback(); return apiError(res, 403, 'No tienes permiso para cerrar esta Caja.'); }
        const accounts = await getSessionAccounts(caja_small, t, true);
        let requested;
        try {
            requested = normalizeAccountAmounts(balances, 'counted_amount', 'saldo contado');
            assertAccountsMatch(requested, accounts, { requireAll: false });
        } catch (error) {
            await t.rollback(); return apiError(res, error.statusCode || 422, error.message);
        }
        if (!balances.length) { const cash = accounts.find(a => a.type === 'CASH'); if (cash) requested.set(cash.id, money(monto_cierre)); }
        try {
            assertAccountsMatch(requested, accounts);
        } catch (error) {
            await t.rollback(); return apiError(res, error.statusCode || 422, error.message);
        }
        const details = [];
        for (const account of accounts) {
            const expected = await getAccountExpected(caja_small.id, account.id, t);
            const counted = requested.has(account.id) ? requested.get(account.id) : expected;
            const difference = money(counted - expected);
            const rowObservations = balances.find(item => Number(item.id_cuenta) === account.id)?.observations || observations || null;
            if (difference !== 0 && !rowObservations?.trim()) { await t.rollback(); return apiError(res, 422, `Registra una observación para la diferencia de ${account.name}.`); }
            details.push({ id_cuenta: account.id, currency: account.currency, expected_amount: expected, counted_amount: counted, difference, observations: rowObservations });
        }
        const close = await CjDailyClose.create({ id_caja_small: caja_small.id, id_user, status: 'CONFIRMED', observations: observations || null, closed_at: new Date() }, { transaction: t });
        await CjDailyCloseDetail.bulkCreate(details.map(row => ({ ...row, id_cierre: close.id })), { transaction: t });
        caja_small.date_cierre = new Date(); caja_small.monto_cierre = money(monto_cierre); caja_small.status = 'CIERRE'; caja_small.session_state = 'CLOSED';
        await caja_small.save({ transaction: t });
        await History.create({ id_user, description: `CIERRE CAJA ${cashboxType} #${caja_small.id}`, type: 'CIERRE CAJA', module: `CAJA ${cashboxType}`, id_sucursal, action: 'close', id_reference: close.id, status: true }, { transaction: t });
        await t.commit();
        NotificationService.notifyAdmins({ title: `Cierre de Caja ${cashboxType}`, message: `Se cerró la sesión #${caja_small.id} de Caja ${cashboxType} en la sucursal ${id_sucursal}.`, type: 'CAJA', level: details.some(row => row.difference !== 0) ? 'WARNING' : 'INFO', id_reference: close.id }, null, id_user).catch(error => console.error('No se pudo emitir notificación de cierre de Caja:', error));
        return res.status(201).json({ ok: true, msg: 'Caja cerrada correctamente.', cierre: close, balances: details });
    } catch (error) {
        if (!t.finished) await t.rollback();
        console.log(error);
        return apiError(res, 500, 'Ocurrió un problema al cerrar Caja.');
    }
}
const editMontoAperturaCajaSmall = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { monto_apertura, id_sucursal } = req.body;
        const cashboxType = normalizeCashboxType(req.body.cashbox_type);
        if (invalidRequestedCashboxType(req.body.cashbox_type)) { await t.rollback(); return apiError(res, 422, 'cashbox_type debe ser CHICA o MAYOR.'); }
        if (!canAccessCashbox(req.userAuth, cashboxType, 'update')) { await t.rollback(); return apiError(res, 403, `No tienes permiso para modificar Caja ${cashboxType}.`); }
        if (!canAccessBranch(req.userAuth, id_sucursal)) { await t.rollback(); return apiError(res, 403, 'No tienes permiso para modificar la Caja de esta sucursal.'); }
        const cajaSmall = await CajaSmall.findOne({ where: { id_sucursal, cashbox_type: cashboxType, session_state: 'OPEN' }, transaction: t, lock: t.LOCK.UPDATE });
        if (!cajaSmall) { await t.rollback(); return apiError(res, 422, 'No hay una sesión de Caja abierta para esta sucursal.'); }
        if (!canAccessSession(req.userAuth, cajaSmall)) { await t.rollback(); return apiError(res, 403, 'No tienes permiso para modificar esta Caja.'); }
        const cash = await CjAccount.findOne({ where: { type: 'CASH', is_active: true }, include: [{ model: CjAccountAssignment, as: 'assignments', where: { id_caja: cajaSmall.id_caja, is_active: true }, attributes: [] }], transaction: t, lock: t.LOCK.UPDATE });
        if (!cash) { await t.rollback(); return apiError(res, 422, 'No existe una cuenta de efectivo activa en esta sucursal.'); }
        if (await CjLedger.count({ where: { id_caja_small: cajaSmall.id, id_cuenta: cash.id }, transaction: t })) { await t.rollback(); return apiError(res, 422, 'El saldo inicial no puede cambiar después de registrar movimientos.'); }
        const value = money(monto_apertura);
        if (value < 0) { await t.rollback(); return apiError(res, 422, 'El saldo inicial no puede ser negativo.'); }
        cajaSmall.monto_apertura = value; await cajaSmall.save({ transaction: t });
        await CjSessionBalance.update({ opening_amount: value }, { where: { id_caja_small: cajaSmall.id, id_cuenta: cash.id }, transaction: t });
        await t.commit();
        return res.status(200).json({ ok: true, msg: 'Monto de apertura actualizado.' });
    } catch (error) {
        if (!t.finished) await t.rollback();
        console.log(error);
        return apiError(res, 500, 'Ocurrió un problema al actualizar el saldo de apertura.');
    }
}
module.exports = {
    openCajaSmall,
    closeCajaSmall,
    newDetailCajaSmall,
    getCajasSmall,
    getTotalDetailsCajasSmall,
    getCajaAccounts,
    saveCajaAccount,
    getExpenseCategories,
    getCajaPersonnel,
    createCajaPersonnel,
    getCajaPersonnelDetail,
    updateCajaPersonnel,
    deleteCajaPersonnel,
    getCajaExpenses,
    createCajaExpense,
    reverseCajaMovement,
    uploadExpenseAttachment,
    getExpenseAttachments,
    editMontoAperturaCajaSmall,
    getTotalesAndMovements
};
