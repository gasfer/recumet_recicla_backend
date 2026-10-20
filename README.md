<h1 align="center">RECUMENT BACKEND</h1>
<p align="center">Author <a href="https://www.linkedin.com/in/gaston-fern%C3%A1ndez-flores/">CloudPC Smart Technology</a>.</p>


## ⚙️ Set Up
<h2 align="center">💻 Local: Dev Mode </h2> 

### 📋 Requirements

* Node v18.17.1
* DB PostgreSQL 15.0 (install and create database for .env)
* Sequelize v6
* Nodemon

### 1. 📌 Common setup

1.1. Clone the repo and install the dependencies and sequelize-cli.

```bash
    git clone https://github.com/gasfer/recumet_recicla_backend.git
```
```bash
    npm install --force
```
```bash
    npm install -g sequelize-cli
```
```bash
    npm install -g nodemon
```

## 2. 👾 Steps for access - developer mode

2.1. ⚙️ configure file .env

| Environment  | Example | Description |
| -- | -- | --|
PORT | 3000 | port for application execution
DB_HOST | localhost | host database
DB_DATABASE | recumet | name database
DB_USERNAME | postgres | user for database connection
DB_PASSWORD | MYPASS | password for database connection
DB_DIALECT | postgres | type database -> postgres || mysql
DB_LOGGING | true | logs db query's type boolean false || true
JWT_SECRET | secretJWT | secret jwt secret
EXPIREJWT | 1h | time expire JWT
TRUCK_SCALE_HOST | 192.168.0.240 | IP o hostname de la balanza, alcanzable desde el backend
TRUCK_SCALE_PORT | 8000 | Puerto TCP de lectura de la balanza (1–65535)
TRUCK_SCALE_TIMEOUT_MS | 3000 | Tiempo máximo de espera de respuesta en milisegundos

En desarrollo local, `GET /api/v1/scale/read-weight` lee la balanza desde el backend de desarrollo usando `TRUCK_SCALE_HOST` y `TRUCK_SCALE_PORT`. Para producción con el ERP en Dockploy, la lectura se hace desde el navegador a un agente Node local en la PC que está en la red de la balanza; el backend remoto de Dockploy no debe intentar abrir la conexión TCP a la IP privada. Consulta `local-scale-agent/README.md` para instalar e iniciar ese agente en Windows. El puerto `80000` del ejemplo PHP no es válido para TCP; el puerto configurado es `8000`.


2.2. ⚙️ execute migrations and seeders by sequelize-cli

```bash
    npx sequelize-cli db:migrate 
```
```bash
    npx sequelize-cli db:seed:all 
```
## 3. ✅ To start app, run the following

```bash
    nodemon app.js || ##developer mode, if install nodemon
    node app ## if not install nodemon
```
## 4. 🥳✅ verify start app

[http://localhost:3000/](http://localhost:3000/)

http://localhost:${PORT}/
