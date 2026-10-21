const { response, request } = require('express');
const { Scale, TruckWeighing } = require('../database/config');
const paginate = require('../helpers/paginate');
const { readTruckScaleWeight } = require('../services/truck-scale-reader.service');

const readHardwareWeight = async (req = request, res = response) => {
    try {
        const reading = await readTruckScaleWeight();
        return res.status(200).json({ ok: true, ...reading, unit: 'kg' });
    } catch (error) {
        const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 503;
        return res.status(statusCode).json({
            ok: false,
            errors: [{ msg: error.message || 'No se pudo leer el peso de la balanza.' }],
        });
    }
};

const listTruckWeighings = async (_req = request, res = response) => {
    try {
        const weighings = await TruckWeighing.findAll({ order: [['registered_at', 'DESC'], ['id', 'DESC']] });
        return res.status(200).json({ ok: true, weighings });
    } catch (error) {
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudieron consultar los pesajes camioneros.' }] });
    }
};

const createFirstTruckWeight = async (req = request, res = response) => {
    try {
        const { ticket, registered_at, first_weight, first_time, details = {} } = req.body;
        const weight = Number(first_weight);
        if (!ticket || !Number.isFinite(weight) || weight < 0 || !first_time || !registered_at) {
            return res.status(400).json({ ok: false, errors: [{ msg: 'Boleta, fecha, hora y primer peso son obligatorios.' }] });
        }
        const weighing = await TruckWeighing.create({
            ticket: String(ticket).trim(), registered_at, first_weight: weight, first_time,
            state: 'PRIMER_PESO', details,
        });
        return res.status(201).json({ ok: true, weighing });
    } catch (error) {
        const duplicate = error.name === 'SequelizeUniqueConstraintError';
        return res.status(duplicate ? 409 : 500).json({
            ok: false,
            errors: [{ msg: duplicate ? 'El número de boleta ya está registrado.' : 'No se pudo guardar el primer peso.' }],
        });
    }
};

const updateTruckWeighing = async (req = request, res = response) => {
    try {
        const weighing = await TruckWeighing.findByPk(req.params.id);
        if (!weighing) return res.status(404).json({ ok: false, errors: [{ msg: 'No se encontró el pesaje.' }] });
        const { ticket, registered_at, first_weight, first_time, details = {} } = req.body;
        const firstWeight = Number(first_weight);
        if (!ticket || !Number.isFinite(firstWeight) || firstWeight < 0 || !first_time || !registered_at) {
            return res.status(400).json({ ok: false, errors: [{ msg: 'Boleta, fecha, hora y primer peso son obligatorios.' }] });
        }
        const changes = { ticket: String(ticket).trim(), registered_at, first_weight: firstWeight, first_time, details };
        if (weighing.second_weight !== null) {
            const secondWeight = Number(weighing.second_weight);
            changes.tare = Math.min(firstWeight, secondWeight);
            changes.gross = Math.max(firstWeight, secondWeight);
            changes.net = changes.gross - changes.tare;
            changes.ing_sal = secondWeight < firstWeight ? 'INGRESO' : secondWeight > firstWeight ? 'SALIDA' : 'NULO';
        }
        await weighing.update(changes);
        return res.status(200).json({ ok: true, weighing });
    } catch (error) {
        const duplicate = error.name === 'SequelizeUniqueConstraintError';
        return res.status(duplicate ? 409 : 500).json({ ok: false, errors: [{ msg: duplicate ? 'El número de boleta ya está registrado.' : 'No se pudo actualizar el pesaje.' }] });
    }
};

const completeTruckWeight = async (req = request, res = response) => {
    try {
        const weighing = await TruckWeighing.findByPk(req.params.id);
        if (!weighing) return res.status(404).json({ ok: false, errors: [{ msg: 'No se encontró el pesaje.' }] });
        if (weighing.state !== 'PRIMER_PESO') {
            return res.status(409).json({ ok: false, errors: [{ msg: 'Este pesaje ya tiene segundo peso.' }] });
        }
        const secondWeight = Number(req.body.second_weight);
        if (!Number.isFinite(secondWeight) || secondWeight < 0 || !req.body.second_time) {
            return res.status(400).json({ ok: false, errors: [{ msg: 'El segundo peso y su hora son obligatorios.' }] });
        }
        const firstWeight = Number(weighing.first_weight);
        const tare = Math.min(firstWeight, secondWeight);
        const gross = Math.max(firstWeight, secondWeight);
        await weighing.update({
            second_weight: secondWeight, second_time: req.body.second_time,
            tare, gross, net: gross - tare,
            ing_sal: secondWeight < firstWeight ? 'INGRESO' : secondWeight > firstWeight ? 'SALIDA' : 'NULO',
            state: 'COMPLETO',
        });
        return res.status(200).json({ ok: true, weighing });
    } catch (_error) {
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo completar el segundo pesaje.' }] });
    }
};

const deleteTruckWeighing = async (req = request, res = response) => {
    try {
        const weighing = await TruckWeighing.findByPk(req.params.id);
        if (!weighing) return res.status(404).json({ ok: false, errors: [{ msg: 'No se encontró el pesaje.' }] });
        await weighing.destroy();
        return res.status(200).json({ ok: true });
    } catch (_error) {
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo eliminar el pesaje.' }] });
    }
};

const getScalePaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, status,orderNew} = req.query;
        const optionsDb = {
            order: [orderNew],
            where: { status },
        };
        let scales = await paginate(Scale, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            scales
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newScale = async (req = request, res = response ) => {
    try {
        const body = req.body;
        const scale = await Scale.create(body);
        return res.status(201).json({
            ok: true,
            scale
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateScale = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const scale = await Scale.findByPk(id);
        await scale.update(body);
        return res.status(201).json({
            ok: true,
            msg: 'Balanza modificada exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const activeInactiveScale = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const scale = await Scale.findByPk(id);
        await scale.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Balanza activada exitosamente' : 'Balanza inactiva exitosamente'
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
    readHardwareWeight,
    listTruckWeighings,
    createFirstTruckWeight,
    updateTruckWeighing,
    completeTruckWeight,
    deleteTruckWeighing,
    getScalePaginate,
    newScale,
    updateScale,
    activeInactiveScale
};
