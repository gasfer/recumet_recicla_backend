require('dotenv').config();
const Server = require('./app/models/server');

const server = Server.instance;
let shuttingDown = false;

const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nCerrando backend (${signal})...`);
    try {
        await server.close();
        process.exit(0);
    } catch (error) {
        console.error('No se pudo cerrar el backend correctamente:', error.message);
        process.exit(1);
    }
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

server.listen().catch(async (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`No se inició el backend: el puerto ${server.port} ya está ocupado.`);
        console.error('Ya existe otra instancia ejecutándose. Deténgala con Ctrl+C antes de iniciar una nueva.');
    } else {
        console.error('No se pudo iniciar el backend:', error.message);
    }
    try {
        await server.close();
    } finally {
        process.exitCode = 1;
    }
});
 
