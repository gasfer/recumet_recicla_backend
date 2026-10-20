# ==========================
# Stage 1 - Dependencies
# ==========================
FROM node:20.11.1-bookworm-slim AS deps

WORKDIR /app

ENV PUPPETEER_CACHE_DIR=/opt/puppeteer

COPY package*.json ./

RUN npm install --omit=dev --force

# ==========================
# Stage 2 - Runtime
# ==========================
FROM node:20.11.1-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=America/La_Paz
ENV PUPPETEER_CACHE_DIR=/opt/puppeteer
ENV PDF_DISABLE_SANDBOX=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        dumb-init \
        libfontconfig1 \
        libfreetype6 \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxrandr2 \
        libxshmfence1 \
        libxss1 \
        libxtst6 \
        tzdata \
    && cp /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo "${TZ}" > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /opt/puppeteer /opt/puppeteer

COPY . .

RUN groupadd --system nodejs \
    && useradd --system --gid nodejs --create-home nodeuser

RUN chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]

CMD ["sh", "-c", "npx sequelize-cli db:migrate && node app.js"]
