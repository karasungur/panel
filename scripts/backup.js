#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

let sqlite;
try {
    sqlite = require('node:sqlite');
} catch (err) {
    console.error('node:sqlite bulunamadi. Node.js >=22.13.0 ile calistirin.');
    process.exit(1);
}

const { DatabaseSync } = sqlite;

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function sqlString(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

async function main() {
    const rootDir = path.resolve(__dirname, '..');
    const dataDir = process.env.DATA_DIR
        ? path.resolve(process.env.DATA_DIR)
        : path.join(rootDir, 'database');
    const dbPath = path.join(dataDir, 'panel.db');
    const backupDir = process.env.BACKUP_DIR
        ? path.resolve(process.env.BACKUP_DIR)
        : path.join(dataDir, 'backups');

    if (!fs.existsSync(dbPath)) {
        throw new Error(`Veritabani bulunamadi: ${dbPath}. Once npm run migrate veya npm run seed calistirin.`);
    }

    fs.mkdirSync(backupDir, { recursive: true });

    const target = path.join(backupDir, `panel-${timestamp()}.db`);
    const db = new DatabaseSync(dbPath, { timeout: 5000 });
    let method = 'VACUUM INTO';

    try {
        db.exec('PRAGMA wal_checkpoint(FULL)');

        if (typeof sqlite.backup === 'function') {
            method = 'node:sqlite backup';
            await sqlite.backup(db, target, { rate: 100 });
        } else {
            db.exec(`VACUUM INTO ${sqlString(target)}`);
        }
    } finally {
        db.close();
    }

    console.log(`Yedek olusturuldu: ${target}`);
    console.log(`Yontem: ${method}`);
}

main().catch(err => {
    console.error('Yedekleme basarisiz oldu.');
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
