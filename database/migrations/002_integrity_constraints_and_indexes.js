function count(db, sql) {
    return db.prepare(sql).get().s;
}

function assertNoDuplicateIller(db, helpers) {
    if (!helpers.tableExists(db, 'iller')) return;

    const tekrarli = count(
        db,
        `
        SELECT COUNT(*) AS s
        FROM (
            SELECT plaka
            FROM iller
            WHERE plaka IS NOT NULL
            GROUP BY plaka
            HAVING COUNT(*) > 1
        )
    `
    );
    if (tekrarli > 0) {
        throw new Error('iller.plaka icin tekrarli kayitlar var; unique index uygulanmadan once temizlenmeli.');
    }
}

function assertNoDuplicateIlceler(db, helpers) {
    if (!helpers.tableExists(db, 'ilceler')) return;

    const tekrarli = count(
        db,
        `
        SELECT COUNT(*) AS s
        FROM (
            SELECT il_id, ilce_adi
            FROM ilceler
            GROUP BY il_id, ilce_adi
            HAVING COUNT(*) > 1
        )
    `
    );
    if (tekrarli > 0) {
        throw new Error(
            'ilceler(il_id, ilce_adi) icin tekrarli kayitlar var; unique index uygulanmadan once temizlenmeli.'
        );
    }
}

function assertNoTaskOwnerOrphans(db, helpers) {
    if (!helpers.tableExists(db, 'gorevler') || !helpers.tableExists(db, 'kullanicilar')) return;

    const orphanCount = count(
        db,
        `
        SELECT COUNT(*) AS s
        FROM gorevler g
        LEFT JOIN kullanicilar k ON k.id = g.kullanici_id
        WHERE k.id IS NULL
    `
    );
    if (orphanCount > 0) {
        throw new Error('gorevler.kullanici_id icin yetim kayitlar var; FK uygulanmadan once temizlenmeli.');
    }
}

function rebuildGorevler(db) {
    db.exec(`
        CREATE TABLE gorevler_yeni (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kullanici_id INTEGER NOT NULL,
            baslik TEXT NOT NULL,
            aciklama TEXT,
            durum TEXT NOT NULL DEFAULT 'bekliyor' CHECK(durum IN ('bekliyor','tamamlandi')),
            oncelik TEXT NOT NULL DEFAULT 'normal' CHECK(oncelik IN ('dusuk','normal','acil')),
            kategori TEXT DEFAULT 'diger',
            son_tarih DATETIME,
            tekrar TEXT DEFAULT 'tek' CHECK(tekrar IN ('tek','haftalik','aylik')),
            olusturan_id INTEGER,
            olusturulma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
            FOREIGN KEY (olusturan_id) REFERENCES kullanicilar(id) ON DELETE SET NULL
        )
    `);

    db.exec(`
        INSERT INTO gorevler_yeni (
            id, kullanici_id, baslik, aciklama, durum, oncelik, kategori,
            son_tarih, tekrar, olusturan_id, olusturulma_tarihi
        )
        SELECT
            g.id,
            g.kullanici_id,
            g.baslik,
            g.aciklama,
            CASE WHEN g.durum IN ('bekliyor','tamamlandi') THEN g.durum ELSE 'bekliyor' END,
            CASE WHEN g.oncelik IN ('dusuk','normal','acil') THEN g.oncelik ELSE 'normal' END,
            COALESCE(g.kategori, 'diger'),
            g.son_tarih,
            CASE WHEN g.tekrar IN ('tek','haftalik','aylik') THEN g.tekrar ELSE 'tek' END,
            CASE
                WHEN g.olusturan_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM kullanicilar k WHERE k.id = g.olusturan_id)
                THEN g.olusturan_id
                ELSE NULL
            END,
            COALESCE(g.olusturulma_tarihi, CURRENT_TIMESTAMP)
        FROM gorevler g
    `);
    db.exec('DROP TABLE gorevler');
    db.exec('ALTER TABLE gorevler_yeni RENAME TO gorevler');
}

function rebuildMesajlar(db) {
    db.exec(`
        CREATE TABLE mesajlar_yeni (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kullanici_id INTEGER,
            kullanici_adi TEXT,
            ad_soyad TEXT,
            renk TEXT,
            metin TEXT NOT NULL,
            tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE SET NULL
        )
    `);

    db.exec(`
        INSERT INTO mesajlar_yeni (id, kullanici_id, kullanici_adi, ad_soyad, renk, metin, tarih)
        SELECT
            m.id,
            CASE
                WHEN m.kullanici_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM kullanicilar k WHERE k.id = m.kullanici_id)
                THEN m.kullanici_id
                ELSE NULL
            END,
            m.kullanici_adi,
            m.ad_soyad,
            m.renk,
            m.metin,
            COALESCE(m.tarih, CURRENT_TIMESTAMP)
        FROM mesajlar m
    `);
    db.exec('DROP TABLE mesajlar');
    db.exec('ALTER TABLE mesajlar_yeni RENAME TO mesajlar');
}

function rebuildYaziyor(db) {
    db.exec(`
        CREATE TABLE yaziyor_yeni (
            kullanici_id INTEGER NOT NULL,
            alici_id INTEGER NOT NULL,
            son_zaman DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (kullanici_id, alici_id),
            FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
            FOREIGN KEY (alici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
        )
    `);

    db.exec(`
        INSERT OR IGNORE INTO yaziyor_yeni (kullanici_id, alici_id, son_zaman)
        SELECT y.kullanici_id, y.alici_id, COALESCE(y.son_zaman, CURRENT_TIMESTAMP)
        FROM yaziyor y
        JOIN kullanicilar gonderen ON gonderen.id = y.kullanici_id
        JOIN kullanicilar alici ON alici.id = y.alici_id
    `);
    db.exec('DROP TABLE yaziyor');
    db.exec('ALTER TABLE yaziyor_yeni RENAME TO yaziyor');
}

function quote(name) {
    return `"${String(name).replace(/"/g, '""')}"`;
}

function hasUniqueIndexOn(db, table, columns) {
    const expected = columns.join(',');
    const indexes = db.prepare(`PRAGMA index_list(${quote(table)})`).all();

    return indexes
        .filter((index) => index.unique)
        .some((index) => {
            const actual = db
                .prepare(`PRAGMA index_info(${quote(index.name)})`)
                .all()
                .sort((a, b) => a.seqno - b.seqno)
                .map((row) => row.name)
                .join(',');
            return actual === expected;
        });
}

function execIfTablesExist(db, helpers, tables, sql) {
    if (tables.every((table) => helpers.tableExists(db, table))) {
        db.exec(sql);
    }
}

function createIndexes(db, helpers) {
    if (helpers.tableExists(db, 'iller') && !hasUniqueIndexOn(db, 'iller', ['plaka'])) {
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_iller_plaka_unique ON iller(plaka) WHERE plaka IS NOT NULL');
    }
    execIfTablesExist(
        db,
        helpers,
        ['ilceler'],
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_ilceler_il_ad_unique ON ilceler(il_id, ilce_adi)'
    );

    execIfTablesExist(
        db,
        helpers,
        ['kullanicilar'],
        'CREATE INDEX IF NOT EXISTS idx_kullanicilar_rol ON kullanicilar(rol)'
    );
    execIfTablesExist(db, helpers, ['ilceler'], 'CREATE INDEX IF NOT EXISTS idx_ilceler_il_id ON ilceler(il_id)');
    execIfTablesExist(
        db,
        helpers,
        ['ilceler'],
        'CREATE INDEX IF NOT EXISTS idx_ilceler_il_ad ON ilceler(il_id, ilce_adi)'
    );
    execIfTablesExist(
        db,
        helpers,
        ['kullanici_iller'],
        'CREATE INDEX IF NOT EXISTS idx_kullanici_iller_kid ON kullanici_iller(kullanici_id)'
    );
    execIfTablesExist(
        db,
        helpers,
        ['kullanici_iller'],
        'CREATE INDEX IF NOT EXISTS idx_kullanici_iller_iid ON kullanici_iller(il_id)'
    );
    execIfTablesExist(
        db,
        helpers,
        ['gorevler'],
        'CREATE INDEX IF NOT EXISTS idx_gorevler_kid ON gorevler(kullanici_id)'
    );
    execIfTablesExist(
        db,
        helpers,
        ['gorevler'],
        'CREATE INDEX IF NOT EXISTS idx_gorevler_kullanici_durum_son ON gorevler(kullanici_id, durum, son_tarih)'
    );
    execIfTablesExist(
        db,
        helpers,
        ['gorevler'],
        'CREATE INDEX IF NOT EXISTS idx_gorevler_olusturan ON gorevler(olusturan_id)'
    );
    execIfTablesExist(
        db,
        helpers,
        ['bildirimler'],
        'CREATE INDEX IF NOT EXISTS idx_bildirimler_kid ON bildirimler(kullanici_id, okundu)'
    );
    execIfTablesExist(
        db,
        helpers,
        ['bildirimler'],
        'CREATE INDEX IF NOT EXISTS idx_bildirimler_kid_id ON bildirimler(kullanici_id, id DESC)'
    );
    execIfTablesExist(
        db,
        helpers,
        ['bildirimler'],
        'CREATE INDEX IF NOT EXISTS idx_bildirimler_unread_id ON bildirimler(kullanici_id, okundu, id DESC)'
    );
    execIfTablesExist(db, helpers, ['mesajlar'], 'CREATE INDEX IF NOT EXISTS idx_mesajlar_tarih ON mesajlar(tarih)');
    execIfTablesExist(
        db,
        helpers,
        ['ozel_mesajlar'],
        'CREATE INDEX IF NOT EXISTS idx_ozel_mesajlar_kisiler ON ozel_mesajlar(gonderen_id, alici_id, id)'
    );
    execIfTablesExist(
        db,
        helpers,
        ['ozel_mesajlar'],
        'CREATE INDEX IF NOT EXISTS idx_ozel_mesajlar_okunmamis ON ozel_mesajlar(alici_id, okundu)'
    );
    execIfTablesExist(
        db,
        helpers,
        ['ozel_mesajlar'],
        'CREATE INDEX IF NOT EXISTS idx_ozel_mesajlar_alici_gonderen_id ON ozel_mesajlar(alici_id, gonderen_id, id)'
    );
    execIfTablesExist(
        db,
        helpers,
        ['ozel_mesajlar'],
        'CREATE INDEX IF NOT EXISTS idx_ozel_mesajlar_gonderen_alici_id ON ozel_mesajlar(gonderen_id, alici_id, id)'
    );
    execIfTablesExist(
        db,
        helpers,
        ['yaziyor'],
        'CREATE INDEX IF NOT EXISTS idx_yaziyor_alici ON yaziyor(alici_id, kullanici_id)'
    );
    execIfTablesExist(db, helpers, ['notlar'], 'CREATE INDEX IF NOT EXISTS idx_notlar_kid ON notlar(kullanici_id)');
    execIfTablesExist(
        db,
        helpers,
        ['notlar'],
        'CREATE INDEX IF NOT EXISTS idx_notlar_kid_guncel ON notlar(kullanici_id, guncellenme_tarihi DESC)'
    );
}

module.exports = {
    id: '002_integrity_constraints_and_indexes',
    description: 'Unique indexleri, sorgu indexlerini ve eksik FK kisitlarini ekler.',
    transaction: false,
    up(db, helpers) {
        assertNoDuplicateIller(db, helpers);
        assertNoDuplicateIlceler(db, helpers);
        assertNoTaskOwnerOrphans(db, helpers);

        helpers.withForeignKeysDisabled(db, () => {
            helpers.transaction(db, () => {
                if (
                    helpers.tableExists(db, 'gorevler') &&
                    !helpers.hasForeignKey(db, 'gorevler', 'olusturan_id', 'kullanicilar')
                ) {
                    rebuildGorevler(db);
                }
                if (
                    helpers.tableExists(db, 'mesajlar') &&
                    !helpers.hasForeignKey(db, 'mesajlar', 'kullanici_id', 'kullanicilar')
                ) {
                    rebuildMesajlar(db);
                }
                if (
                    helpers.tableExists(db, 'yaziyor') &&
                    (!helpers.hasForeignKey(db, 'yaziyor', 'kullanici_id', 'kullanicilar') ||
                        !helpers.hasForeignKey(db, 'yaziyor', 'alici_id', 'kullanicilar'))
                ) {
                    rebuildYaziyor(db);
                }
            });
        });

        helpers.transaction(db, () => {
            createIndexes(db, helpers);
        });

        const fkHatalari = db.prepare('PRAGMA foreign_key_check').all();
        if (fkHatalari.length > 0) {
            throw new Error(`Foreign key kontrolu basarisiz: ${JSON.stringify(fkHatalari.slice(0, 5))}`);
        }
    }
};
