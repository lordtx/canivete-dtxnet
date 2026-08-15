# ============================================================
# CANIVETE — Node + Express + SQLite
# Dados persistidos em /data (volume no Coolify)
# ============================================================
FROM node:22-slim

# libs necessárias para o melhor-sqlite3 (prebuild) — se faltar prebuild, compila
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js db.js db-sqlite.js db-pg.js storage.js ./
COPY public ./public

ENV DATA_DIR=/data \
    PORT=3000
EXPOSE 3000

VOLUME ["/data"]
CMD ["node", "server.js"]
