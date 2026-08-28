const express = require('express');
const http = require('http');
const { Server: ServerSocket } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { sequelize } = require('../database/config');
const { loadDecimals } = require('../helpers/decimals-value');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../config/swagger');

class Server {
    static _instance;
    constructor() {
        this.app = express();
        this.port = Number(process.env.PORT || 3000);
        this.started = false;
        this.server = http.createServer(this.app);
        this.io = new ServerSocket(this.server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });
        this.middlewares();
        this.routes();
        this.sockets();
    }
    static get instance() {
        return this._instance || (this._instance = new Server());
    }
    middlewares() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static('public'));
    }

    sockets() {
        this.io.on('connection', (socket) => {
            console.log('Cliente conectado por Socket.io:', socket.id);
            socket.on('disconnect', () => {
                console.log('Cliente desconectado de Socket.io:', socket.id);
            });
        });
    }

    routes() {
        this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
        const dirname = path.join(__dirname, '../routes');
        fs.readdirSync(dirname)
            .filter(file => {
                return (file.indexOf('.') !== 0) && (file.slice(-3) === '.js');
            })
            .forEach(file => {
                this.app.use(`/api/v1/${file.slice(0, -3)}`, require(`../routes/${file.slice(0, -3)}`));
            });
    }

    async listen() {
        if (this.started || this.server.listening) return;

        if (process.env.DB_SYNC_ON_START === 'true') {
            await sequelize.sync({ force: false });
        } else {
            await sequelize.authenticate();
        }
        await loadDecimals();

        await new Promise((resolve, reject) => {
            const onError = (error) => {
                this.server.off('listening', onListening);
                reject(error);
            };
            const onListening = () => {
                this.server.off('error', onError);
                resolve();
            };
            this.server.once('error', onError);
            this.server.once('listening', onListening);
            this.server.listen(this.port);
        });

        this.started = true;
        console.log(`Backend ejecutándose en http://localhost:${this.port}`);
        console.log(`Swagger: http://localhost:${this.port}/api-docs`);
        console.log('Conexión exitosa a la base de datos');
    }

    async close() {
        if (this.server.listening) {
            await new Promise((resolve) => this.io.close(resolve));
        }
        this.started = false;
        await sequelize.close();
    }

}

module.exports = Server;
