const { response, request } = require('express');
const { Provider, Sector, TypesProvider, DetailsInput, ViewProviderTotals } = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const providerService = require('../services/provider.service');
const providerFrequencyService = require('../services/provider-frequency.service');

const resolveGoogleMapsLink = async (req = request, res = response) => {
    try {
        const rawUrl = String(req.query.url || '').trim();
        const parsed = new URL(rawUrl);
        const allowedHosts = ['maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com'];
        if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
            return res.status(400).json({ ok: false, errors: [{ msg: 'Solo se permiten enlaces de Google Maps.' }] });
        }
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 8000);
        const result = await fetch(parsed.toString(), { redirect: 'follow', signal: abort.signal, headers: { 'User-Agent': 'Mozilla/5.0 RECUMET/1.0' } });
        clearTimeout(timeout);
        const finalUrl = result.url;
        const coordinateMatch = finalUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
          || finalUrl.match(/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)/);
        if (!coordinateMatch) return res.status(422).json({ ok: false, finalUrl, errors: [{ msg: 'Google Maps no entregó coordenadas para este enlace.' }] });
        return res.json({ ok: true, finalUrl, latitude: Number(coordinateMatch[1]), longitude: Number(coordinateMatch[2]) });
    } catch (error) {
        return res.status(422).json({ ok: false, errors: [{ msg: 'No se pudo resolver el enlace corto de Google Maps.' }] });
    }
};

const getProviderPaginate = async (req = request, res = response) => {
    try {
        let {query, page, limit, type, status, orderNew , id_type_provider, estado_registro} = req.query;
        let isSearchPos = type === 'pos' ? true : false;   
        let optionsDb = {
            order: [orderNew],
            where: { 
                [Op.and]: [
                    { status },
                    id_type_provider ? {id_type_provider}: {},
                    estado_registro ? { estado_registro } : {}
                ]
            },
            include: [ { association: 'category'},{ association: 'sector'}, { association: 'type'}]
        };
        if(isSearchPos) type = null;
        if(isSearchPos) optionsDb.where[Op.or] = [
            { full_names: { [Op.iLike]: `%${query}%`}},
            { number_document: { [Op.iLike]: `%${query}%`}},
            { name_contact: { [Op.iLike]: `%${query}%`}},
        ];
        let providers = await paginate(ViewProviderTotals, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            providers
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getProviderByProductPaginate = async (req = request, res = response) => {
    try {
        let {query, page, limit, type, orderNew,id_sucursal, id_product} = req.query;
        let optionsDb = {
            order: [orderNew],
            where: {id_product},
            attributes: {exclude:['status','createdAt','updatedAt']},
            include: [ 
                { 
                    association: 'input', 
                    attributes: ['cod','date_voucher','status'],
                    where: {
                        [Op.and]: [
                            id_sucursal   ? { id_sucursal   } : {},
                            { status: 'ACTIVE' },
                        ]
                    },
                    include: {association:'provider', attributes: ['full_names','status'],}
                },
            ]
        };
        let detailsInput = await paginate(DetailsInput, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            detailsInput
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newProvider = async (req = request, res = response ) => {
    try {
        const provider = await providerService.createProfile(req.body);
        return res.status(201).json({
            ok: true,
            provider
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateProvider = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const provider = await providerService.updateProfile(id, req.body);
        return res.status(200).json({
            ok: true,
            msg: 'Proveedor modificado exitosamente',
            provider,
        });   
    } catch (error) {
        const status = error.statusCode || (error.message.includes('no existe') ? 404 : 500);
        if (status === 500) console.log(error);
        return res.status(status).json({
          ok: false,
          errors: [{ msg: status === 500 ? 'Ocurrió un imprevisto interno | hable con soporte' : error.message }],
        });
    }
}

const activeInactiveProvider = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const provider = await Provider.findByPk(id);
        await provider.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Proveedor activo exitosamente' : 'Proveedor inactivo exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}


const getAllSectorProvider = async (req = request, res = response) => {
    try {
        const { query, page, limit, type,orderNew } = req.query;
        const optionsDb = {
            order: [orderNew],
            where: { status: true },
        };
        let sectors = await paginate(Sector, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            sectors
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newSectorProvider = async (req = request, res = response ) => {
    try {
        const body = req.body;
        const sector = await Sector.create(body);
        return res.status(201).json({
            ok: true,
            sector
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const deleteSectorProvider = async (req = request, res = response ) => {
    try {
        const { id } = req.params;
        const sector = await Sector.findByPk(id);
        await sector.update({status:false});
        return res.status(201).json({
            ok: true,
            msg: 'Sector eliminado exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getAllTypesProvider = async (req = request, res = response) => {
    try {
        let typesProvider =  await TypesProvider.findAll({where:{status: true}});
        return res.status(200).json({
            ok: true,
            typesProvider
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getProviderAutocomplete = async (req = request, res = response) => {
    try {
        const { query = '', id_sucursal } = req.query;
        const branchId = id_sucursal && /^[1-9]\d*$/.test(String(id_sucursal)) ? Number(id_sucursal) : null;
        const providers = await providerService.findAutocompleteProviders(String(query).slice(0, 150), branchId);
        return res.status(200).json({
            ok: true,
            providers
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
        });
    }
}

const preRegisterProvider = async (req = request, res = response) => {
    try {
        const provider = await providerService.preRegisterProvider(req.body, req.body.id_sucursal, req.userAuth);
        return res.status(201).json({ ok: true, provider });
    } catch (error) {
        console.log(error);
        return res.status(error.statusCode || 500).json({ ok: false, errors: [{ msg: error.statusCode ? error.message : 'No fue posible crear el pre-registro del proveedor' }] });
    }
};

const checkDuplicateProvider = async (req = request, res = response) => {
    try {
        const provider = await providerService.findDuplicate(req.query);
        return res.status(200).json({ ok: true, exists: Boolean(provider), ...(provider ? { provider } : {}) });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No fue posible verificar duplicados' }] });
    }
};

const getProviderCommercialDetails = async (req = request, res = response) => {
    try {
        const provider = await providerService.getProviderDetails(req.params.id);
        if (!provider) return res.status(404).json({ ok: false, errors: [{ msg: 'El proveedor no existe' }] });
        return res.status(200).json({ ok: true, provider });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No fue posible obtener la ficha comercial' }] });
    }
};

const commercialValidationProvider = async (req = request, res = response) => {
    try {
        const provider = await providerService.validateCommercial(req.params.id, req.body, req.userAuth.id);
        return res.status(200).json({ ok: true, provider, msg: 'Proveedor validado comercialmente' });
    } catch (error) {
        const status = error.message.includes('clasificación') || error.message.includes('no existe') || error.message.includes('Faltan datos') ? 400 : 500;
        if (status === 500) console.log(error);
        return res.status(status).json({ ok: false, errors: [{ msg: error.message || 'No fue posible validar al proveedor' }] });
    }
};

const saveProviderDetail = (kind) => async (req = request, res = response) => {
    try {
        const detail = await providerService.saveDetail(req.params.id, kind, req.body, req.params.detailId);
        return res.status(req.params.detailId ? 200 : 201).json({ ok: true, detail });
    } catch (error) {
        const status = error.message.includes('no existe') || error.message.includes('no válido') ? 400 : 500;
        if (status === 500) console.log(error);
        return res.status(status).json({ ok: false, errors: [{ msg: error.message || 'No fue posible guardar el detalle' }] });
    }
};

const deleteProviderDetail = (kind) => async (req = request, res = response) => {
    try {
        await providerService.deleteDetail(req.params.id, kind, req.params.detailId);
        return res.status(200).json({ ok: true, msg: 'Detalle eliminado correctamente' });
    } catch (error) {
        const status = error.message.includes('no existe') || error.message.includes('no válido') ? 400 : 500;
        if (status === 500) console.log(error);
        return res.status(status).json({ ok: false, errors: [{ msg: error.message || 'No fue posible eliminar el detalle' }] });
    }
};

const getProviderFrequencyAnalysis = async (req = request, res = response) => {
    try {
        const providerId = req.params.id;
        const { id_product, id_sucursal } = req.query;
        const analysis = await providerFrequencyService.calculateFrequency(providerId, id_product, id_sucursal);
        return res.status(200).json({
            ok: true,
            analysis: {
                ...analysis,
                has_sufficient_history: analysis.hasSufficientHistory,
                total_deliveries: analysis.totalDeliveries,
                window_days: analysis.windowDays,
                average_days: analysis.averageDays,
                frequency: analysis.frequencyCode,
                frequency_mode: analysis.hasSufficientHistory ? 'automatic' : 'manual',
                last_delivery_date: analysis.lastDeliveryDate,
                next_estimated_date: analysis.nextEstimatedDate,
                first_delivery_date: analysis.firstDeliveryDate,
                total_purchases: analysis.totalPurchases,
                elapsed_days: analysis.elapsedDays,
                total_kg: analysis.totalKg,
                estimated_volume: analysis.estimatedVolume,
                recommended_contact_date: analysis.recommendedContactDate,
                overdue_days: analysis.overdueDays,
            }
        });
    } catch (error) {
        console.log(error);
        return res.status(error.statusCode || 500).json({
            ok: false,
            errors: [{ msg: 'Error al calcular la frecuencia inteligente del proveedor.' }]
        });
    }
};

module.exports = {
    getProviderPaginate,
    newProvider,
    updateProvider,
    activeInactiveProvider,
    getAllSectorProvider,
    newSectorProvider,
    deleteSectorProvider,
    getProviderByProductPaginate,
    getAllTypesProvider,
    getProviderAutocomplete,
    preRegisterProvider,
    checkDuplicateProvider,
    getProviderCommercialDetails,
    commercialValidationProvider,
    saveProviderDetail,
    deleteProviderDetail,
    resolveGoogleMapsLink,
    getProviderFrequencyAnalysis
};
