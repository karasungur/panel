-- ============================================
-- SOSYAL MEDYA TAKIP PANELI - VERITABANI SEMASI (v3)
-- ============================================

CREATE TABLE IF NOT EXISTS kullanicilar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_adi TEXT UNIQUE NOT NULL,
    sifre TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('admin', 'yardimci', 'kullanici')) DEFAULT 'kullanici',
    ad_soyad TEXT,
    gorev_adi TEXT,
    renk TEXT DEFAULT '#24467c',
    profil_foto TEXT,
    olusturulma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS iller (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    il_adi TEXT UNIQUE NOT NULL,
    plaka INTEGER,
    baskan_ad_soyad TEXT,
    baskan_telefon TEXT,
    baskan_tc TEXT,
    baskan_foto TEXT,
    instagram_url TEXT,
    twitter_url TEXT,
    facebook_url TEXT,
    tiktok_url TEXT
);

CREATE TABLE IF NOT EXISTS ilceler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    il_id INTEGER NOT NULL,
    ilce_adi TEXT NOT NULL,
    baskan_ad_soyad TEXT,
    baskan_telefon TEXT,
    baskan_tc TEXT,
    baskan_foto TEXT,
    instagram_url TEXT,
    twitter_url TEXT,
    facebook_url TEXT,
    tiktok_url TEXT,
    FOREIGN KEY (il_id) REFERENCES iller(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kullanici_iller (
    kullanici_id INTEGER NOT NULL,
    il_id INTEGER NOT NULL,
    PRIMARY KEY (kullanici_id, il_id),
    FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
    FOREIGN KEY (il_id) REFERENCES iller(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ayarlar (
    anahtar TEXT PRIMARY KEY,
    deger TEXT
);

CREATE TABLE IF NOT EXISTS gorevler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER NOT NULL,
    baslik TEXT NOT NULL,
    aciklama TEXT,
    durum TEXT NOT NULL DEFAULT 'bekliyor' CHECK(durum IN ('bekliyor','tamamlandi')),
    olusturulma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mesajlar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER,
    kullanici_adi TEXT,
    ad_soyad TEXT,
    renk TEXT,
    metin TEXT NOT NULL,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notlar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER NOT NULL,
    baslik TEXT,
    icerik TEXT,
    olusturulma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
    guncellenme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notlar_kid ON notlar(kullanici_id);

CREATE INDEX IF NOT EXISTS idx_ilceler_il_id ON ilceler(il_id);
CREATE INDEX IF NOT EXISTS idx_kullanici_iller_kid ON kullanici_iller(kullanici_id);
CREATE INDEX IF NOT EXISTS idx_kullanici_iller_iid ON kullanici_iller(il_id);
CREATE INDEX IF NOT EXISTS idx_gorevler_kid ON gorevler(kullanici_id);
CREATE INDEX IF NOT EXISTS idx_mesajlar_tarih ON mesajlar(tarih);
