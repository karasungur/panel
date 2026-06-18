const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, 'migrations');

function quoteIdentifier(name) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(`Gecersiz SQLite identifier: ${name}`);
    }
    return `"${name}"`;
}

function transaction(db, fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
        const sonuc = fn();
        db.exec('COMMIT');
        return sonuc;
    } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw err;
    }
}

function withForeignKeysDisabled(db, fn) {
    const durum = db.prepare('PRAGMA foreign_keys').get();
    const aktifti = Object.values(durum)[0] === 1;
    db.exec('PRAGMA foreign_keys = OFF');
    try {
        return fn();
    } finally {
        db.exec(`PRAGMA foreign_keys = ${aktifti ? 'ON' : 'OFF'}`);
    }
}

function tableExists(db, table) {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

function tableSql(db, table) {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    return row?.sql || '';
}

function columns(db, table) {
    if (!tableExists(db, table)) return [];
    return db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map(kolon => kolon.name);
}

function foreignKeys(db, table) {
    if (!tableExists(db, table)) return [];
    return db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all();
}

function hasForeignKey(db, table, from, toTable) {
    return foreignKeys(db, table).some(fk => fk.from === from && fk.table === toTable);
}

function ensureSchemaMigrations(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            description TEXT NOT NULL DEFAULT '',
            applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const mevcutKolonlar = columns(db, 'schema_migrations');
    if (!mevcutKolonlar.includes('description')) {
        db.exec("ALTER TABLE schema_migrations ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    }
}

function loadMigrations() {
    if (!fs.existsSync(migrationsDir)) return [];

    const migrations = fs.readdirSync(migrationsDir)
        .filter(dosya => dosya.endsWith('.js'))
        .sort()
        .map(dosya => {
            const migration = require(path.join(migrationsDir, dosya));
            if (!migration || typeof migration.up !== 'function' || !migration.id) {
                throw new Error(`Gecersiz migration dosyasi: ${dosya}`);
            }
            return { ...migration, file: dosya };
        });

    const ids = new Set();
    for (const migration of migrations) {
        if (ids.has(migration.id)) {
            throw new Error(`Tekrarlanan migration id: ${migration.id}`);
        }
        ids.add(migration.id);
    }

    return migrations;
}

function appliedMigrationIds(db) {
    return new Set(db.prepare('SELECT id FROM schema_migrations').all().map(row => row.id));
}

function recordMigration(db, migration) {
    db.prepare('INSERT INTO schema_migrations (id, description) VALUES (?, ?)')
        .run(migration.id, migration.description || '');
}

function runMigrations(db) {
    ensureSchemaMigrations(db);

    const applied = appliedMigrationIds(db);
    const helpers = {
        columns,
        foreignKeys,
        hasForeignKey,
        quoteIdentifier,
        tableExists,
        tableSql,
        transaction,
        withForeignKeysDisabled
    };

    for (const migration of loadMigrations()) {
        if (applied.has(migration.id)) continue;

        const apply = () => {
            migration.up(db, helpers);
            recordMigration(db, migration);
            applied.add(migration.id);
        };

        console.log(`Migration calisiyor: ${migration.id}`);
        if (migration.transaction === false) {
            apply();
        } else {
            transaction(db, apply);
        }
        console.log(`Migration tamamlandi: ${migration.id}`);
    }
}

module.exports = { runMigrations };
