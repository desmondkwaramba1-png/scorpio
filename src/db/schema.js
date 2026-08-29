const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { migrate } = require('./migrate');
const { DB_PATH } = require('../lib/paths');

// Only matters when DATA_DIR points at a freshly-mounted volume (Fly.io)
// that has no db/ subdirectory yet — better-sqlite3 doesn't create parent
// directories for you, it just fails to open the file.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Table shape lives in migrations/*.sql, applied in order and tracked in a
// `migrations` table — see migrate.js. Safe to require this module more
// than once; migrate() no-ops once everything is applied.
migrate(db);

module.exports = db;
