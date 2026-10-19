'use strict';

const KILOGRAM_UNITS = Object.freeze(['KG', 'KGS', 'KGR', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS']);
const isKilogramUnit = value => KILOGRAM_UNITS.includes(String(value || '').trim().replace(/\./g, '').toUpperCase());
// The list contains only fixed application constants, never request input.
const kilogramUnitSql = alias => `UPPER(REPLACE(TRIM(${alias}.siglas), '.', '')) IN (${KILOGRAM_UNITS.map(unit => `'${unit}'`).join(', ')})`;

module.exports = { isKilogramUnit, kilogramUnitSql };
