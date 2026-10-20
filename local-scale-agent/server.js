'use strict';

const http = require('node:http');
const { readTruckScaleWeight } = require('../app/services/truck-scale-reader.service');

const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_AGENT_PORT = 4180;
const DEFAULT_SCALE_HOST = '192.168.0.240';
const DEFAULT_SCALE_PORT = 8000;
const DEFAULT_ALLOWED_ORIGINS = ['https://recicladev.recumetbolivia.com'];

const allowedOrigins = new Set(
  String(process.env.TRUCK_SCALE_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const isLoopbackHostHeader = (hostHeader = '') => /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(hostHeader);

const sendJson = (res, statusCode, body) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;

  if (!isLoopbackHostHeader(req.headers.host)) {
    return sendJson(res, 403, { ok: false, errors: [{ msg: 'Solicitud local no permitida.' }] });
  }

  if (origin && !allowedOrigins.has(origin)) {
    return sendJson(res, 403, { ok: false, errors: [{ msg: 'El origen no está autorizado para leer la balanza.' }] });
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.writeHead(204);
    return res.end();
  }

  const pathname = new URL(req.url, `http://${LOOPBACK_HOST}`).pathname;
  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'truck-scale-local-agent' });
  }

  if (req.method !== 'GET' || pathname !== '/read-weight') {
    return sendJson(res, 404, { ok: false, errors: [{ msg: 'Ruta local no encontrada.' }] });
  }

  if (!origin || !allowedOrigins.has(origin)) {
    return sendJson(res, 403, { ok: false, errors: [{ msg: 'Se requiere el origen autorizado de RECUMET.' }] });
  }

  try {
    const reading = await readTruckScaleWeight({
      host: process.env.TRUCK_SCALE_HOST || DEFAULT_SCALE_HOST,
      port: Number(process.env.TRUCK_SCALE_PORT || DEFAULT_SCALE_PORT),
      timeoutMs: Number(process.env.TRUCK_SCALE_TIMEOUT_MS || 3000),
    });
    return sendJson(res, 200, { ok: true, ...reading, unit: 'kg' });
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 503;
    return sendJson(res, statusCode, {
      ok: false,
      errors: [{ msg: error.message || 'No se pudo leer el peso de la balanza.' }],
    });
  }
});

const agentPort = Number(process.env.TRUCK_SCALE_AGENT_PORT || DEFAULT_AGENT_PORT);
if (!Number.isInteger(agentPort) || agentPort < 1 || agentPort > 65535) {
  throw new Error('TRUCK_SCALE_AGENT_PORT debe ser un puerto entre 1 y 65535.');
}

server.listen(agentPort, LOOPBACK_HOST, () => {
  console.log(`Agente local RECUMET activo en http://${LOOPBACK_HOST}:${agentPort}`);
  console.log(`Balanza configurada en ${process.env.TRUCK_SCALE_HOST || DEFAULT_SCALE_HOST}:${process.env.TRUCK_SCALE_PORT || DEFAULT_SCALE_PORT}`);
  console.log(`Orígenes autorizados: ${Array.from(allowedOrigins).join(', ')}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
