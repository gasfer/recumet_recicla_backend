# ==========================
# Stage 1 - Dependencies
# ==========================
FROM node:20.11.1-alpine AS deps

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev --force

# ==========================
# Stage 2 - Runtime
# ==========================
FROM node:20.11.1-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=America/La_Paz

RUN apk add --no-cache tzdata dumb-init \
    && cp /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo "${TZ}" > /etc/timezone

COPY --from=deps /app/node_modules ./node_modules

COPY . .

RUN addgroup -S nodejs \
    && adduser -S nodeuser -G nodejs

RUN chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]

CMD ["sh", "-c", "npx sequelize-cli db:migrate && node app.js"]