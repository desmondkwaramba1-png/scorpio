// Where the SQLite file and uploaded files actually live on disk — one
// place, not thirteen hardcoded `path.join(__dirname, '../uploads')`
// calls, because that's exactly what breaks the moment this runs
// somewhere with a mounted persistent volume instead of a local checkout.
// DATA_DIR unset (local dev) keeps everything exactly where it's always
// been. DATA_DIR=/data (Fly.io, with a volume mounted there) moves both
// the DB file and every upload onto that volume, which is the entire
// point: local dev never had a data-loss problem, only a real deployment
// with an ephemeral filesystem does.
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');

const DB_PATH = path.join(DATA_DIR, 'db', 'zimselar.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

module.exports = { DATA_DIR, DB_PATH, UPLOADS_DIR };
