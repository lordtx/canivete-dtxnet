'use strict';
/* ============================================================
 * CANIVETE — seleção do banco de dados
 *   DATABASE_URL definido  → PostgreSQL (db-pg.js, async)
 *   sem DATABASE_URL       → SQLite (db-sqlite.js, padrão)
 * ============================================================ */
if (process.env.DATABASE_URL) {
  const pg = require('./db-pg');
  module.exports = pg;
} else {
  module.exports = require('./db-sqlite');
}
