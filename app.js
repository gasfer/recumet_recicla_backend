require('dotenv').config();
const Server = require('./app/models/server');

const server = Server.instance;


server.listen();
 