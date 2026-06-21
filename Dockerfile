FROM node:12.22.9-slim

# Directorio de trabajo
WORKDIR /usr/src/app

# Copiar archivos de definición de dependencias
COPY package*.json ./

# Instalar dependencias para producción
RUN npm install --only=production --force

# Copiar el código del proyecto
COPY . .

# Entorno de producción
ENV NODE_ENV=production

# Puerto expuesto
EXPOSE 3000

# Comando por defecto para correr migraciones y arrancar la aplicación
CMD ["sh", "-c", "npx sequelize-cli db:migrate && npm start"]
