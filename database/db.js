const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { runMigrations } = require('./migrations');

// DATA_DIR ortam degiskeni varsa onu kullan, yoksa proje icindeki database klasoru.
const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : __dirname;

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'panel.db');
const db = new DatabaseSync(dbPath, { timeout: 5000 });

db.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const mevcutSema = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'kullanicilar'").get();

db.dataDir = dataDir;
db.dbPath = dbPath;

if (mevcutSema) {
    runMigrations(db);
    db.exec(schema);
} else {
    db.exec(schema);
    runMigrations(db);
}
db.exec('PRAGMA foreign_keys = ON;');

module.exports = db;
