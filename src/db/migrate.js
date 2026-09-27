const fs = require('fs');
const path = require('path');

// Applies migrations/*.sql in filename order, tracking what's already run
// in the migrations table.
function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    db.prepare('SELECT name FROM migrations').all().map(row => row.name)
  );

  // Recovery case:
  // The database already has the current products schema, but migration
  // history was cleared during a data reset. Do NOT replay old migrations.
  const productsExists = db.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = 'products'
  `).get();

  if (productsExists && applied.size === 0) {
    const columns = db.prepare(`PRAGMA table_info(products)`).all();
    const columnNames = new Set(columns.map(c => c.name));

    if (columnNames.has('price_minor') && !columnNames.has('price')) {
      const restoreHistory = db.transaction(() => {
        for (const file of files) {
          db.prepare(
            'INSERT OR IGNORE INTO migrations (name) VALUES (?)'
          ).run(file);
        }
      });

      restoreHistory();

      console.log(
        `[migrate] existing schema detected; restored ${files.length} migration records`
      );

      return;
    }
  }

  db.pragma('foreign_keys = OFF');

  try {
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = fs.readFileSync(path.join(dir, file), 'utf8');

      const run = db.transaction(() => {
        db.exec(sql);
        db.prepare(
          'INSERT INTO migrations (name) VALUES (?)'
        ).run(file);
      });

      run();
      console.log(`[migrate] applied ${file}`);
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

module.exports = { migrate };
