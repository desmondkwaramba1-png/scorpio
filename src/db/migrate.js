const fs = require('fs');
const path = require('path');

// Applies migrations/*.sql in filename order, tracking what's already run
// in a `migrations` table. foreign_keys is off for the run because a couple
// of migrations rebuild tables (SQLite has no ALTER for constraints), and
// pragma changes are ignored inside a transaction, so it has to be set here.
function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const applied = new Set(db.prepare('SELECT name FROM migrations').all().map(r => r.name));

  db.pragma('foreign_keys = OFF');
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const run = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
    });
    run();
    console.log(`[migrate] applied ${file}`);
  }
  db.pragma('foreign_keys = ON');
}

module.exports = { migrate };
