<h1 align="center">RECUMENT BACKEND</h1>
<p align="center">Author <a href="https://www.linkedin.com/in/ronaldjllusco/">Ronald J. LLusco V.</a>.</p>


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
    git clone https://github.com/RonaldLlusco/backend_recumet.git
```
```bash
    npm install
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