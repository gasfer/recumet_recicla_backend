'use strict';
const { sequelize, Sequelize } = require('../database/config');

const validKey = key => typeof key === 'string' && /^(new|provider-\d+|branch-\d+|company-\d+-newbranch)$/.test(key);
const validValues = values => values && typeof values === 'object' && !Array.isArray(values) && JSON.stringify(values).length <= 200000;

async function read(req, res) {
  if (!validKey(req.params.key)) return res.status(400).json({ ok: false, msg: 'Borrador no válido.' });
  try {
    const drafts = await sequelize.query('SELECT form_values AS "values", updated_at FROM provider_registration_drafts WHERE user_id = :user AND draft_key = :key', { replacements: { user: req.userAuth.id, key: req.params.key }, type: Sequelize.QueryTypes.SELECT });
    return res.json({ ok: true, draft: drafts[0] || null });
  } catch (error) { return res.status(500).json({ ok: false, msg: 'No se pudo recuperar el avance guardado.' }); }
}

async function save(req, res) {
  if (!validKey(req.params.key) || !validValues(req.body.values)) return res.status(400).json({ ok: false, msg: 'El avance no es válido.' });
  try {
    await sequelize.query('INSERT INTO provider_registration_drafts (user_id, draft_key, form_values, updated_at) VALUES (:user, :key, CAST(:values AS jsonb), NOW()) ON CONFLICT (user_id, draft_key) DO UPDATE SET form_values = EXCLUDED.form_values, updated_at = NOW()', { replacements: { user: req.userAuth.id, key: req.params.key, values: JSON.stringify(req.body.values) } });
    return res.json({ ok: true, msg: 'Avance guardado. Puede completar la ficha más adelante.' });
  } catch (error) { return res.status(500).json({ ok: false, msg: 'No se pudo guardar el avance. Mantenga abierta la ficha y vuelva a intentar.' }); }
}

async function remove(req, res) {
  if (!validKey(req.params.key)) return res.status(400).json({ ok: false });
  try {
    await sequelize.query('DELETE FROM provider_registration_drafts WHERE user_id = :user AND draft_key = :key', { replacements: { user: req.userAuth.id, key: req.params.key } });
    return res.json({ ok: true });
  } catch (error) { return res.status(500).json({ ok: false }); }
}

module.exports = { read, save, remove, validKey, validValues };
