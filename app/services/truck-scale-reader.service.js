'use strict';

const net = require('node:net');

class TruckScaleReaderError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.name = 'TruckScaleReaderError';
    this.statusCode = statusCode;
  }
}

const parseScaleWeight = (response) => {
  const digits = String(response || '').replace(/\D/g, '');
  if (!digits) throw new TruckScaleReaderError('La balanza respondió sin un peso válido.');

  const weight = Number(digits);
  if (!Number.isSafeInteger(weight)) {
    throw new TruckScaleReaderError('El peso recibido está fuera del rango permitido.');
  }
  return weight;
};

const readScaleFrame = ({ host, port, timeoutMs = 3000, settleMs = 120 }) => new Promise((resolve, reject) => {
  const socket = net.createConnection({ host, port });
  let response = '';
  let settleTimer;
  let settled = false;

  const finish = (error, frame) => {
    if (settled) return;
    settled = true;
    clearTimeout(settleTimer);
    socket.destroy();
    if (error) reject(error);
    else resolve(frame);
  };

  socket.setTimeout(timeoutMs, () => finish(new TruckScaleReaderError('Se agotó el tiempo de espera de la balanza.')));
  socket.on('data', (chunk) => {
    response += chunk.toString('ascii');
    if (response.length > 256) response = response.slice(0, 256);

    const lineEnd = response.search(/[\r\n]/);
    if (lineEnd >= 0) {
      finish(null, response.slice(0, lineEnd));
      return;
    }

    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => finish(null, response), settleMs);
  });
  socket.on('end', () => {
    if (response) finish(null, response);
    else finish(new TruckScaleReaderError('La balanza cerró la conexión sin enviar un peso.'));
  });
  socket.on('error', () => finish(new TruckScaleReaderError('No se pudo conectar con la balanza. Verifique la conexión y la configuración del servidor.')));
});

const readTruckScaleWeight = async (options = {}) => {
  const host = String(options.host ?? process.env.TRUCK_SCALE_HOST ?? '').trim();
  const port = Number(options.port ?? process.env.TRUCK_SCALE_PORT ?? 8000);
  const timeoutMs = Number(options.timeoutMs ?? process.env.TRUCK_SCALE_TIMEOUT_MS ?? 3000);

  if (!host) throw new TruckScaleReaderError('La dirección de la balanza no está configurada en el servidor.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TruckScaleReaderError('El puerto configurado para la balanza no es válido.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new TruckScaleReaderError('El tiempo de espera configurado para la balanza no es válido.');
  }

  const raw = await readScaleFrame({ host, port, timeoutMs });
  return { peso: parseScaleWeight(raw) };
};

module.exports = { readTruckScaleWeight, parseScaleWeight, TruckScaleReaderError };
