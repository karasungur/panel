-- ============================================
-- SOSYAL MEDYA TAKIP PANELI - VERITABANI SEMASI (v4)
-- ============================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kullanicilar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_adi TEXT UNIQUE NOT NULL,
    sifre TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('admin', 'yardimci', 'kullanici')) DEFAULT 'kullanici',
    ad_soyad TEXT,
    gorev_adi TEXT,
    renk TEXT DEFAULT '#24467c',
    profil_foto TEXT,
    token_version INTEGER NOT NULL DEFAULT 0 CHECK(token_version >= 0),
    son_giris DATETIME,
    olusturulma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS iller (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    il_adi TEXT UNIQUE NOT NULL,
    plaka INTEGER UNIQUE,
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
    oncelik TEXT NOT NULL DEFAULT 'normal' CHECK(oncelik IN ('dusuk','normal','acil')),
    kategori TEXT DEFAULT 'diger',
    son_tarih DATETIME,
    tekrar TEXT DEFAULT 'tek' CHECK(tekrar IN ('tek','haftalik','aylik')),
    olusturan_id INTEGER,
    olusturulma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
    FOREIGN KEY (olusturan_id) REFERENCES kullanicilar(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bildirimler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER NOT NULL,
    tip TEXT NOT NULL,
    baslik TEXT NOT NULL,
    icerik TEXT,
    link TEXT,
    okundu INTEGER NOT NULL DEFAULT 0,
    olusturulma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bildirimler_kid ON bildirimler(kullanici_id, okundu);

CREATE TABLE IF NOT EXISTS mesajlar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_id INTEGER,
    kullanici_adi TEXT,
    ad_soyad TEXT,
    renk TEXT,
    metin TEXT NOT NULL,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE SET NULL
);

-- Ozel mesajlar (kullanici - kullanici)
CREATE TABLE IF NOT EXISTS ozel_mesajlar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gonderen_id INTEGER NOT NULL,
    alici_id INTEGER NOT NULL,
    metin TEXT NOT NULL,
    okundu INTEGER NOT NULL DEFAULT 0,
    tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (gonderen_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
    FOREIGN KEY (alici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

-- Yaziyor gostergesi (gecici, RAM'de tutulmasi daha mantikli ama DB ile de calisir)
CREATE TABLE IF NOT EXISTS yaziyor (
    kullanici_id INTEGER NOT NULL,
    alici_id INTEGER NOT NULL,
    son_zaman DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (kullanici_id, alici_id),
    FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
    FOREIGN KEY (alici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
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

CREATE INDEX IF NOT EXISTS idx_kullanicilar_rol ON kullanicilar(rol);
CREATE INDEX IF NOT EXISTS idx_ilceler_il_id ON ilceler(il_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ilceler_il_ad_unique ON ilceler(il_id, ilce_adi);
CREATE INDEX IF NOT EXISTS idx_ilceler_il_ad ON ilceler(il_id, ilce_adi);
CREATE INDEX IF NOT EXISTS idx_kullanici_iller_kid ON kullanici_iller(kullanici_id);
CREATE INDEX IF NOT EXISTS idx_kullanici_iller_iid ON kullanici_iller(il_id);
CREATE INDEX IF NOT EXISTS idx_gorevler_kid ON gorevler(kullanici_id);
CREATE INDEX IF NOT EXISTS idx_gorevler_kullanici_durum_son ON gorevler(kullanici_id, durum, son_tarih);
CREATE INDEX IF NOT EXISTS idx_gorevler_olusturan ON gorevler(olusturan_id);
CREATE INDEX IF NOT EXISTS idx_bildirimler_kid_id ON bildirimler(kullanici_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_bildirimler_unread_id ON bildirimler(kullanici_id, okundu, id DESC);
CREATE INDEX IF NOT EXISTS idx_mesajlar_tarih ON mesajlar(tarih);
CREATE INDEX IF NOT EXISTS idx_ozel_mesajlar_kisiler ON ozel_mesajlar(gonderen_id, alici_id, id);
CREATE INDEX IF NOT EXISTS idx_ozel_mesajlar_okunmamis ON ozel_mesajlar(alici_id, okundu);
CREATE INDEX IF NOT EXISTS idx_ozel_mesajlar_alici_gonderen_id ON ozel_mesajlar(alici_id, gonderen_id, id);
CREATE INDEX IF NOT EXISTS idx_ozel_mesajlar_gonderen_alici_id ON ozel_mesajlar(gonderen_id, alici_id, id);
CREATE INDEX IF NOT EXISTS idx_yaziyor_alici ON yaziyor(alici_id, kullanici_id);
CREATE INDEX IF NOT EXISTS idx_notlar_kid_guncel ON notlar(kullanici_id, guncellenme_tarihi DESC);
