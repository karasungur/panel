#!/usr/bin/env node
require('dotenv').config();

const path = require('node:path');

let db;

try {
    db = require('../database/db');

    const tables = db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    `).all();

    const hasMigrationTable = tables.some(row => row.name === 'schema_migrations');
    const migrations = hasMigrationTable
        ? db.prepare('SELECT id, applied_at FROM schema_migrations ORDER BY id').all()
        : [];

    const dbPath = db.dbPath || path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'database'), 'panel.db');

    console.log(`Veritabani hazir: ${dbPath}`);
    console.log(`Tablo sayisi: ${tables.length}`);

    if (migrations.length > 0) {
        console.log('Uygulanan migrationlar:');
        migrations.forEach(row => console.log(`- ${row.id} (${row.applied_at})`));
    } else {
        console.log('Kayitli migration bulunmadi; sema CREATE IF NOT EXISTS ile uygulandi.');
    }
} catch (err) {
    console.error('Migration kontrolu basarisiz oldu.');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
} finally {
    if (db && typeof db.close === 'function') {
        db.close();
    }
}
