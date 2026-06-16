require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');
const illerListesi = require('./iller-listesi');

// MIGRATION: eski kullanicilar tablosunda CHECK kisitlamasi 'yardimci'yi kabul etmiyor olabilir
// Yeniden olusturma yontemi ile guncelle
try {
    const sema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kullanicilar'").get();
    if (sema && sema.sql && !sema.sql.includes("'yardimci'")) {
        console.log('Migration: kullanicilar tablosu yardimci rolu icin guncelleniyor...');
        db.exec('PRAGMA foreign_keys = OFF;');
        db.exec('BEGIN TRANSACTION');
        db.exec(`CREATE TABLE kullanicilar_yeni (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kullanici_adi TEXT UNIQUE NOT NULL,
            sifre TEXT NOT NULL,
            rol TEXT NOT NULL CHECK(rol IN ('admin', 'yardimci', 'kullanici')) DEFAULT 'kullanici',
            ad_soyad TEXT,
            gorev_adi TEXT,
            renk TEXT DEFAULT '#24467c',
            profil_foto TEXT,
            olusturulma_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.exec(`INSERT INTO kullanicilar_yeni SELECT * FROM kullanicilar`);
        db.exec(`DROP TABLE kullanicilar`);
        db.exec(`ALTER TABLE kullanicilar_yeni RENAME TO kullanicilar`);
        db.exec('COMMIT');
        db.exec('PRAGMA foreign_keys = ON;');
        console.log('Migration tamamlandi.');
    }
} catch (e) {
    console.log('Migration atlandi (yeni veritabani):', e.message);
}

const adminKullaniciAdi = process.env.ADMIN_KULLANICI_ADI || 'admin';
const adminSifre = process.env.ADMIN_SIFRE || 'admin123';

const mevcutAdmin = db.prepare('SELECT id FROM kullanicilar WHERE kullanici_adi = ?').get(adminKullaniciAdi);
if (mevcutAdmin) {
    console.log(`"${adminKullaniciAdi}" kullanicisi zaten var, tekrar olusturulmadi.`);
} else {
    const hash = bcrypt.hashSync(adminSifre, 10);
    db.prepare("INSERT INTO kullanicilar (kullanici_adi, sifre, rol, ad_soyad, gorev_adi, renk) VALUES (?, ?, 'admin', ?, ?, ?)")
      .run(adminKullaniciAdi, hash, 'Sistem Yoneticisi', 'Genel Baskan', '#c1121f');
    console.log('Admin kullanici olusturuldu:');
    console.log('  Kullanici adi : ' + adminKullaniciAdi);
    console.log('  Sifre         : ' + adminSifre);
}

const safeKey = process.env.SAFE_KEY || '';
const mevcutKey = db.prepare("SELECT deger FROM ayarlar WHERE anahtar = 'safe_key'").get();
if (!mevcutKey) {
    db.prepare("INSERT INTO ayarlar (anahtar, deger) VALUES ('safe_key', ?)").run(safeKey);
    console.log('Ozel anahtar (safe key) veritabanina kaydedildi.');
}

const ilEkle = db.prepare('INSERT OR IGNORE INTO iller (plaka, il_adi) VALUES (?, ?)');
let eklenen = 0;
for (const [plaka, ad] of illerListesi) {
    const sonuc = ilEkle.run(plaka, ad);
    if (sonuc.changes > 0) eklenen++;
}
console.log(`${eklenen} il eklendi (toplam ${illerListesi.length} il listede).`);

// Ilceleri ekle - SADECE ilgili ilin ilceleri henuz eklenmemisse ekle
// (Bu sayede seed birden fazla calistirilirsa ilceler 2x/3x olmaz)
const ilceListesi = require('./ilce-listesi');
const ilBul = db.prepare('SELECT id FROM iller WHERE il_adi = ?');
const ilceSayisi = db.prepare('SELECT COUNT(*) s FROM ilceler WHERE il_id = ?');
const ilceEkle = db.prepare('INSERT INTO ilceler (il_id, ilce_adi) VALUES (?, ?)');
let ilceEklenen = 0, ilceToplam = 0, atlananIl = 0;
for (const [ilAdi, ilceler] of Object.entries(ilceListesi)) {
    const il = ilBul.get(ilAdi);
    if (!il) {
        console.log(`UYARI: "${ilAdi}" ili bulunamadi, ilceleri atlandi.`);
        continue;
    }
    ilceToplam += ilceler.length;
    // Eger bu ilin zaten ilceleri varsa atla (cifte ekleme onlemi)
    const mevcutSayi = ilceSayisi.get(il.id).s;
    if (mevcutSayi > 0) {
        atlananIl++;
        continue;
    }
    for (const ilceAdi of ilceler) {
        ilceEkle.run(il.id, ilceAdi);
        ilceEklenen++;
    }
}
console.log(`${ilceEklenen} ilce eklendi (toplam ${ilceToplam} ilce listede, ${atlananIl} il zaten dolu oldugu icin atlandi).`);
console.log('\nSeed islemi tamamlandi.');
