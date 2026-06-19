const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, 'migrations');

/**
 * @typedef {import('node:sqlite').DatabaseSync} DatabaseSync
 * @typedef {import('node:sqlite').SQLOutputValue} SQLOutputValue
 * @typedef {Record<string, SQLOutputValue>} SqlRow
 * @typedef {{ from: string, table: string }} ForeignKeyRow
 * @typedef {{ id: string, description?: string, transaction?: false, up: (db: DatabaseSync, helpers: MigrationHelpers) => void, file?: string }} Migration
 * @typedef {{
 *     columns: typeof columns,
 *     foreignKeys: typeof foreignKeys,
 *     hasForeignKey: typeof hasForeignKey,
 *     quoteIdentifier: typeof quoteIdentifier,
 *     tableExists: typeof tableExists,
 *     tableSql: typeof tableSql,
 *     transaction: typeof transaction,
 *     withForeignKeysDisabled: typeof withForeignKeysDisabled
 * }} MigrationHelpers
 */

/**
 * @param {string} name
 * @returns {string}
 */
function quoteIdentifier(name) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(`Gecersiz SQLite identifier: ${name}`);
    }
    return `"${name}"`;
}

/**
 * @template T
 * @param {DatabaseSync} db
 * @param {() => T} fn
 * @returns {T}
 */
function transaction(db, fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
        const sonuc = fn();
        db.exec('COMMIT');
        return sonuc;
    } catch (err) {
        try {
            db.exec('ROLLBACK');
        } catch (_) {}
        throw err;
    }
}

/**
 * @template T
 * @param {DatabaseSync} db
 * @param {() => T} fn
 * @returns {T}
 */
function withForeignKeysDisabled(db, fn) {
    const durum = /** @type {SqlRow | undefined} */ (db.prepare('PRAGMA foreign_keys').get());
    const aktifti = !!durum && Object.values(durum)[0] === 1;
    db.exec('PRAGMA foreign_keys = OFF');
    try {
        return fn();
    } finally {
        db.exec(`PRAGMA foreign_keys = ${aktifti ? 'ON' : 'OFF'}`);
    }
}

/**
 * @param {DatabaseSync} db
 * @param {string} table
 * @returns {boolean}
 */
function tableExists(db, table) {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

/**
 * @param {DatabaseSync} db
 * @param {string} table
 * @returns {string}
 */
function tableSql(db, table) {
    const row = /** @type {SqlRow | undefined} */ (
        db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
    );
    return typeof row?.sql === 'string' ? row.sql : '';
}

/**
 * @param {DatabaseSync} db
 * @param {string} table
 * @returns {string[]}
 */
function columns(db, table) {
    if (!tableExists(db, table)) return [];
    const kolonlar = /** @type {{ name: string }[]} */ (
        db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all()
    );
    return kolonlar.map((kolon) => kolon.name);
}

/**
 * @param {DatabaseSync} db
 * @param {string} table
 * @returns {ForeignKeyRow[]}
 */
function foreignKeys(db, table) {
    if (!tableExists(db, table)) return [];
    return /** @type {ForeignKeyRow[]} */ (db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all());
}

/**
 * @param {DatabaseSync} db
 * @param {string} table
 * @param {string} from
 * @param {string} toTable
 * @returns {boolean}
 */
function hasForeignKey(db, table, from, toTable) {
    return foreignKeys(db, table).some((fk) => fk.from === from && fk.table === toTable);
}

/**
 * @param {DatabaseSync} db
 * @returns {void}
 */
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

/**
 * @returns {Migration[]}
 */
function loadMigrations() {
    if (!fs.existsSync(migrationsDir)) return [];

    const migrations = fs
        .readdirSync(migrationsDir)
        .filter((dosya) => dosya.endsWith('.js'))
        .sort()
        .map((dosya) => {
            const migration = /** @type {Migration} */ (require(path.join(migrationsDir, dosya)));
            if (!migration || typeof migration.up !== 'function' || !migration.id) {
                throw new Error(`Gecersiz migration dosyasi: ${dosya}`);
            }
            return { ...migration, file: dosya };
        });

    /** @type {Set<string>} */
    const ids = new Set();
    for (const migration of migrations) {
        if (ids.has(migration.id)) {
            throw new Error(`Tekrarlanan migration id: ${migration.id}`);
        }
        ids.add(migration.id);
    }

    return migrations;
}

/**
 * @param {DatabaseSync} db
 * @returns {Set<string>}
 */
function appliedMigrationIds(db) {
    const satirlar = /** @type {{ id: string }[]} */ (db.prepare('SELECT id FROM schema_migrations').all());
    return new Set(satirlar.map((row) => row.id));
}

/**
 * @param {DatabaseSync} db
 * @param {Migration} migration
 * @returns {void}
 */
function recordMigration(db, migration) {
    db.prepare('INSERT INTO schema_migrations (id, description) VALUES (?, ?)').run(
        migration.id,
        migration.description || ''
    );
}

/**
 * @param {DatabaseSync} db
 * @returns {void}
 */
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
