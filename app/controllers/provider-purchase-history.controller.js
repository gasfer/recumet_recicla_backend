'use strict';

const { getProviderPurchaseHistory } = require('../services/provider-purchase-history.service');

const getProviderPurchases = async (req, res) => {
    try {
        const providerId = Number.parseInt(req.params.id, 10);
        if (!Number.isSafeInteger(providerId) || providerId < 1) {
            return res.status(400).json({ ok: false, msg: 'El proveedor solicitado no es válido.' });
        }

        const purchases = await getProviderPurchaseHistory({
            providerId,
            siteId: req.query.site_id,
            page: req.query.page,
            limit: req.query.limit,
        });
        return res.status(200).json({ ok: true, purchases });
    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({ ok: false, msg: error.message });
        }
        console.error('No se pudo cargar el historial de compras del proveedor:', error);
        return res.status(500).json({ ok: false, msg: 'No se pudo cargar el historial de compras del proveedor.' });
    }
};

module.exports = { getProviderPurchases };
