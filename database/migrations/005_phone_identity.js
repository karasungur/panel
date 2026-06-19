const { telefonNormalizeEt } = require('../../utils/phone');

function tabloBosalt(db, helpers, table) {
    if (helpers.tableExists(db, table)) db.exec(`DELETE FROM ${helpers.quoteIdentifier(table)}`);
}

function yetimKullaniciKayitlariniTemizle(db, helpers) {
    if (helpers.tableExists(db, 'kullanici_iller')) {
        db.exec(`
            DELETE FROM kullanici_iller
            WHERE NOT EXISTS (SELECT 1 FROM kullanicilar k WHERE k.id = kullanici_iller.kullanici_id)
        `);
    }
    if (helpers.tableExists(db, 'gorevler')) {
        db.exec(`
            DELETE FROM gorevler
            WHERE NOT EXISTS (SELECT 1 FROM kullanicilar k WHERE k.id = gorevler.kullanici_id)
        `);
        db.exec(`
            UPDATE gorevler
            SET olusturan_id = NULL
            WHERE olusturan_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM kullanicilar k WHERE k.id = gorevler.olusturan_id)
        `);
    }
    if (helpers.tableExists(db, 'bildirimler')) {
        db.exec(`
            DELETE FROM bildirimler
            WHERE NOT EXISTS (SELECT 1 FROM kullanicilar k WHERE k.id = bildirimler.kullanici_id)
        `);
    }
    if (helpers.tableExists(db, 'ozel_mesajlar')) {
        db.exec(`
            DELETE FROM ozel_mesajlar
            WHERE NOT EXISTS (SELECT 1 FROM kullanicilar k WHERE k.id = ozel_mesajlar.gonderen_id)
               OR NOT EXISTS (SELECT 1 FROM kullanicilar k WHERE k.id = ozel_mesajlar.alici_id)
        `);
    }
    if (helpers.tableExists(db, 'yaziyor')) {
        db.exec(`
            DELETE FROM yaziyor
            WHERE NOT EXISTS (SELECT 1 FROM kullanicilar k WHERE k.id = yaziyor.kullanici_id)
               OR NOT EXISTS (SELECT 1 FROM kullanicilar k WHERE k.id = yaziyor.alici_id)
        `);
    }
    if (helpers.tableExists(db, 'notlar')) {
        db.exec(`
            DELETE FROM notlar
            WHERE NOT EXISTS (SELECT 1 FROM kullanicilar k WHERE k.id = notlar.kullanici_id)
        `);
    }
    if (helpers.tableExists(db, 'uploads')) {
        db.exec(`
            UPDATE uploads
            SET kullanici_id = NULL
            WHERE kullanici_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM kullanicilar k WHERE k.id = uploads.kullanici_id)
        `);
    }
}

function rebuildKullanicilar(db, helpers) {
    if (!helpers.tableExists(db, 'kullanicilar')) return;

    const kolonlar = helpers.columns(db, 'kullanicilar');
    if (kolonlar.includes('telefon') && !kolonlar.includes('kullanici_adi')) return;

    const satirlar = db.prepare('SELECT * FROM kullanicilar').all();
    db.exec(`
        CREATE TABLE kullanicilar_yeni (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telefon TEXT UNIQUE NOT NULL,
            sifre TEXT NOT NULL,
            rol TEXT NOT NULL CHECK(rol IN ('admin', 'yardimci', 'kullanici')) DEFAULT 'kullanici',
            ad_soyad TEXT,
            gorev_adi TEXT,
            renk TEXT DEFAULT '#24467c',
            profil_foto TEXT,
            token_version INTEGER NOT NULL DEFAULT 0 CHECK(token_version >= 0),
            son_giris DATETIME,
            olusturulma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const ekle = db.prepare(`
        INSERT INTO kullanicilar_yeni
            (id, telefon, sifre, rol, ad_soyad, gorev_adi, renk, profil_foto, token_version, son_giris, olusturulma_tarihi)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const kullanilanTelefonlar = new Set();

    for (const satir of satirlar) {
        const telefon = telefonNormalizeEt(satir.telefon || satir.kullanici_adi);
        if (!telefon || kullanilanTelefonlar.has(telefon)) continue;
        kullanilanTelefonlar.add(telefon);
        ekle.run(
            satir.id,
            telefon,
            satir.sifre,
            ['admin', 'yardimci', 'kullanici'].includes(satir.rol) ? satir.rol : 'kullanici',
            satir.ad_soyad || null,
            satir.gorev_adi || null,
            satir.renk || '#24467c',
            satir.profil_foto || null,
            Number.isInteger(Number(satir.token_version)) ? Number(satir.token_version) : 0,
            satir.son_giris || null,
            satir.olusturulma_tarihi || null
        );
    }

    db.exec('DROP TABLE kullanicilar');
    db.exec('ALTER TABLE kullanicilar_yeni RENAME TO kullanicilar');
    yetimKullaniciKayitlariniTemizle(db, helpers);
}

function rebuildMesajlar(db, helpers) {
    if (!helpers.tableExists(db, 'mesajlar')) return;

    const kolonlar = helpers.columns(db, 'mesajlar');
    if (kolonlar.includes('telefon') && !kolonlar.includes('kullanici_adi')) return;

    const satirlar = db.prepare('SELECT * FROM mesajlar').all();
    db.exec(`
        CREATE TABLE mesajlar_yeni (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kullanici_id INTEGER,
            telefon TEXT,
            ad_soyad TEXT,
            renk TEXT,
            metin TEXT NOT NULL,
            tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE SET NULL
        )
    `);

    const ekle = db.prepare(`
        INSERT INTO mesajlar_yeni (id, kullanici_id, telefon, ad_soyad, renk, metin, tarih)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const satir of satirlar) {
        const kullanici = satir.kullanici_id
            ? db.prepare('SELECT telefon FROM kullanicilar WHERE id = ?').get(satir.kullanici_id)
            : null;
        ekle.run(
            satir.id,
            kullanici ? satir.kullanici_id : null,
            kullanici?.telefon || telefonNormalizeEt(satir.telefon || satir.kullanici_adi),
            satir.ad_soyad || null,
            satir.renk || null,
            satir.metin,
            satir.tarih || null
        );
    }

    db.exec('DROP TABLE mesajlar');
    db.exec('ALTER TABLE mesajlar_yeni RENAME TO mesajlar');
}

function rebuildLoginAttempts(db, helpers) {
    if (helpers.tableExists(db, 'login_attempts')) db.exec('DROP TABLE login_attempts');
    db.exec(`
        CREATE TABLE login_attempts (
            anahtar TEXT PRIMARY KEY,
            ip TEXT NOT NULL,
            telefon TEXT NOT NULL,
            sayi INTEGER NOT NULL DEFAULT 0 CHECK(sayi >= 0),
            ilk_deneme_ms INTEGER NOT NULL,
            kilitli_kadar_ms INTEGER NOT NULL DEFAULT 0,
            guncellenme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

module.exports = {
    id: '005_phone_identity',
    description: 'Kullanici giris kimligini telefon numarasina tasir.',
    transaction: false,
    up(db, helpers) {
        helpers.withForeignKeysDisabled(db, () => {
            helpers.transaction(db, () => {
                rebuildKullanicilar(db, helpers);
                rebuildMesajlar(db, helpers);
                rebuildLoginAttempts(db, helpers);
                tabloBosalt(db, helpers, 'login_attempts');
                db.exec('CREATE INDEX IF NOT EXISTS idx_kullanicilar_rol ON kullanicilar(rol)');
                db.exec('CREATE INDEX IF NOT EXISTS idx_mesajlar_tarih ON mesajlar(tarih)');
                db.exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_guncel ON login_attempts(guncellenme_tarihi)');
                db.exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_ilk ON login_attempts(ip, ilk_deneme_ms)');
            });
        });
    }
};
