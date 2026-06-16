const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// DATA_DIR ortam degiskeni varsa onu kullan (Render kalici disk),
// yoksa proje icindeki database klasoru
const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : __dirname;

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'panel.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
