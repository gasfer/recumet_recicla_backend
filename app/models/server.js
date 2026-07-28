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
        this.port = process.env.PORT || 3000;
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
        this.server.listen(this.port, () => {
            console.log('Ejecuto en puerto : ', this.port);
            console.log(`📚 Swagger Documentation: http://localhost:${this.port}/api-docs`);
        });
        await loadDecimals();
        sequelize.sync({ force: false }).then(() => {
            console.log('Conexión exitosa a la base de datos');
        });
    }

}

module.exports = Server;