function rebuildKullanicilar(db, helpers) {
    helpers.withForeignKeysDisabled(db, () => {
        helpers.transaction(db, () => {
            db.exec(`
                CREATE TABLE kullanicilar_yeni (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kullanici_adi TEXT UNIQUE NOT NULL,
                    sifre TEXT NOT NULL,
                    rol TEXT NOT NULL CHECK(rol IN ('admin', 'yardimci', 'kullanici')) DEFAULT 'kullanici',
                    ad_soyad TEXT,
                    gorev_adi TEXT,
                    renk TEXT DEFAULT '#24467c',
                    profil_foto TEXT,
                    son_giris DATETIME,
                    token_version INTEGER NOT NULL DEFAULT 0 CHECK(token_version >= 0),
                    olusturulma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            const eskiKolonlar = helpers.columns(db, 'kullanicilar');
            const yeniKolonlar = [
                'id',
                'kullanici_adi',
                'sifre',
                'rol',
                'ad_soyad',
                'gorev_adi',
                'renk',
                'profil_foto',
                'son_giris',
                'token_version',
                'olusturulma_tarihi'
            ];
            const ortakKolonlar = yeniKolonlar.filter((kolon) => eskiKolonlar.includes(kolon));
            const kolonListesi = ortakKolonlar.map(helpers.quoteIdentifier).join(', ');

            db.exec(`
                INSERT INTO kullanicilar_yeni (${kolonListesi})
                SELECT ${kolonListesi}
                FROM kullanicilar
            `);
            db.exec('DROP TABLE kullanicilar');
            db.exec('ALTER TABLE kullanicilar_yeni RENAME TO kullanicilar');
        });
    });
}

module.exports = {
    id: '001_users_and_tasks_columns',
    description: 'Kullanici token_version/son_giris ve gorev ek kolonlarini ekler.',
    transaction: false,
    up(db, helpers) {
        if (helpers.tableExists(db, 'kullanicilar')) {
            const kullanicilarSql = helpers.tableSql(db, 'kullanicilar');
            if (kullanicilarSql && !kullanicilarSql.includes("'yardimci'")) {
                rebuildKullanicilar(db, helpers);
            }

            const kullaniciKolonlari = helpers.columns(db, 'kullanicilar');
            if (!kullaniciKolonlari.includes('son_giris')) {
                db.exec('ALTER TABLE kullanicilar ADD COLUMN son_giris DATETIME');
            }
            if (!kullaniciKolonlari.includes('token_version')) {
                db.exec(
                    'ALTER TABLE kullanicilar ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0 CHECK(token_version >= 0)'
                );
            }
        }

        if (helpers.tableExists(db, 'gorevler')) {
            const gorevKolonlari = helpers.columns(db, 'gorevler');
            if (!gorevKolonlari.includes('oncelik')) {
                db.exec(
                    "ALTER TABLE gorevler ADD COLUMN oncelik TEXT NOT NULL DEFAULT 'normal' CHECK(oncelik IN ('dusuk','normal','acil'))"
                );
            }
            if (!gorevKolonlari.includes('kategori')) {
                db.exec("ALTER TABLE gorevler ADD COLUMN kategori TEXT DEFAULT 'diger'");
            }
            if (!gorevKolonlari.includes('son_tarih')) {
                db.exec('ALTER TABLE gorevler ADD COLUMN son_tarih DATETIME');
            }
            if (!gorevKolonlari.includes('tekrar')) {
                db.exec(
                    "ALTER TABLE gorevler ADD COLUMN tekrar TEXT DEFAULT 'tek' CHECK(tekrar IN ('tek','haftalik','aylik'))"
                );
            }
            if (!gorevKolonlari.includes('olusturan_id')) {
                db.exec('ALTER TABLE gorevler ADD COLUMN olusturan_id INTEGER');
            }
        }
    }
};
