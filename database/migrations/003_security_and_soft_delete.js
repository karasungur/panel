function addColumnIfMissing(db, helpers, table, column, ddl) {
    if (!helpers.tableExists(db, table)) return;
    if (!helpers.columns(db, table).includes(column)) {
        db.exec(`ALTER TABLE ${helpers.quoteIdentifier(table)} ADD COLUMN ${ddl}`);
    }
}

function createUploadsTable(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS uploads (
            dosya_adi TEXT PRIMARY KEY,
            kullanici_id INTEGER,
            mime TEXT NOT NULL,
            boyut INTEGER NOT NULL CHECK(boyut >= 0),
            scope TEXT NOT NULL DEFAULT 'general',
            entity_type TEXT,
            entity_id INTEGER,
            olusturulma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE SET NULL
        )
    `);
}

function createLoginAttemptsTable(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS login_attempts (
            anahtar TEXT PRIMARY KEY,
            ip TEXT NOT NULL,
            kullanici_adi TEXT NOT NULL,
            sayi INTEGER NOT NULL DEFAULT 0 CHECK(sayi >= 0),
            ilk_deneme_ms INTEGER NOT NULL,
            kilitli_kadar_ms INTEGER NOT NULL DEFAULT 0,
            guncellenme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

module.exports = {
    id: '003_security_and_soft_delete',
    description:
        'Upload metadata, login limiter, ozel mesaj soft-delete ve gorev recurrence idempotency alanlarini ekler.',
    up(db, helpers) {
        addColumnIfMissing(db, helpers, 'ozel_mesajlar', 'deleted_for_sender_at', 'deleted_for_sender_at DATETIME');
        addColumnIfMissing(
            db,
            helpers,
            'ozel_mesajlar',
            'deleted_for_recipient_at',
            'deleted_for_recipient_at DATETIME'
        );
        addColumnIfMissing(db, helpers, 'gorevler', 'parent_task_id', 'parent_task_id INTEGER');
        addColumnIfMissing(db, helpers, 'gorevler', 'occurrence_due_at', 'occurrence_due_at DATETIME');

        createUploadsTable(db);
        addColumnIfMissing(db, helpers, 'uploads', 'scope', "scope TEXT NOT NULL DEFAULT 'general'");
        addColumnIfMissing(db, helpers, 'uploads', 'entity_type', 'entity_type TEXT');
        addColumnIfMissing(db, helpers, 'uploads', 'entity_id', 'entity_id INTEGER');
        createLoginAttemptsTable(db);
        addColumnIfMissing(db, helpers, 'login_attempts', 'guncellenme_tarihi', 'guncellenme_tarihi DATETIME');
        db.exec('UPDATE login_attempts SET guncellenme_tarihi = COALESCE(guncellenme_tarihi, CURRENT_TIMESTAMP)');

        db.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_gorevler_parent_occurrence_unique
            ON gorevler(parent_task_id, occurrence_due_at)
            WHERE parent_task_id IS NOT NULL AND occurrence_due_at IS NOT NULL
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_uploads_kullanici_tarih ON uploads(kullanici_id, olusturulma_tarihi)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_guncel ON login_attempts(guncellenme_tarihi)');
    }
};
