'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readTruckScaleWeight, parseScaleWeight, TruckScaleReaderError } = require('../services/truck-scale-reader.service');

test('extrae el peso en kg descartando el texto del marco recibido', () => {
  assert.equal(parseScaleWeight('ST,GS,00018450 kg\r\n'), 18450);
});

test('rechaza respuestas que no contienen peso numérico', () => {
  assert.throws(() => parseScaleWeight('ST,ER,------'), TruckScaleReaderError);
});

test('rechaza puertos TCP fuera del rango válido', async () => {
  await assert.rejects(
    readTruckScaleWeight({ host: '127.0.0.1', port: 80000 }),
    /puerto configurado.*no es válido/i,
  );
});

test('explica cuándo falta configurar la balanza en el servidor', async () => {
  await assert.rejects(
    readTruckScaleWeight({ host: '', port: 8000 }),
    /dirección de la balanza no está configurada/i,
  );
});
