require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');
const illerListesi = require('./iller-listesi');
const { jwtSecretHatasi, parolaHatasi } = require('../utils/security');

const adminKullaniciAdi = process.env.ADMIN_KULLANICI_ADI || 'admin';
const adminSifre = process.env.ADMIN_SIFRE || 'admin123';
const prod = process.env.NODE_ENV === 'production';
if (prod && (!process.env.ADMIN_KULLANICI_ADI || !process.env.ADMIN_SIFRE || !process.env.JWT_SECRET)) {
    throw new Error('Production icin ADMIN_KULLANICI_ADI, ADMIN_SIFRE ve JWT_SECRET zorunludur.');
}

if (prod) {
    const adminParolaHatasi = parolaHatasi(adminSifre, { admin: true, kullaniciAdi: adminKullaniciAdi });
    if (adminParolaHatasi) throw new Error(`ADMIN_SIFRE gecersiz: ${adminParolaHatasi}`);
    const jwtHatasi = jwtSecretHatasi(process.env.JWT_SECRET);
    if (jwtHatasi) throw new Error(`JWT_SECRET gecersiz: ${jwtHatasi}`);
}

const mevcutAdmin = db.prepare('SELECT id FROM kullanicilar WHERE kullanici_adi = ?').get(adminKullaniciAdi);
if (mevcutAdmin) {
    console.log(`"${adminKullaniciAdi}" kullanicisi zaten var, tekrar olusturulmadi.`);
} else {
    const hash = bcrypt.hashSync(adminSifre, 10);
    db.prepare(
        "INSERT INTO kullanicilar (kullanici_adi, sifre, rol, ad_soyad, gorev_adi, renk) VALUES (?, ?, 'admin', ?, ?, ?)"
    ).run(adminKullaniciAdi, hash, 'Sistem Yoneticisi', 'Genel Baskan', '#c1121f');
    console.log('Admin kullanici olusturuldu:');
    console.log('  Kullanici adi : ' + adminKullaniciAdi);
    if (!prod) console.log('  Sifre         : ' + adminSifre);
}

const ilEkle = db.prepare('INSERT OR IGNORE INTO iller (plaka, il_adi) VALUES (?, ?)');
let eklenen = 0;
for (const [plaka, ad] of illerListesi) {
    const sonuc = ilEkle.run(plaka, ad);
    if (sonuc.changes > 0) eklenen++;
}
console.log(`${eklenen} il eklendi (toplam ${illerListesi.length} il listede).`);

// Ilceleri ilce bazinda tamamla; seed yarida kesilirse sonraki calistirma eksikleri ekler.
const ilceListesi = require('./ilce-listesi');
const ilBul = db.prepare('SELECT id FROM iller WHERE il_adi = ?');
const ilceEkle = db.prepare('INSERT OR IGNORE INTO ilceler (il_id, ilce_adi) VALUES (?, ?)');
let ilceEklenen = 0,
    ilceToplam = 0,
    atlananIlce = 0;
db.withTransaction(() => {
    for (const [ilAdi, ilceler] of Object.entries(ilceListesi)) {
        const il = ilBul.get(ilAdi);
        if (!il) {
            console.log(`UYARI: "${ilAdi}" ili bulunamadi, ilceleri atlandi.`);
            continue;
        }
        ilceToplam += ilceler.length;
        for (const ilceAdi of ilceler) {
            const sonuc = ilceEkle.run(il.id, ilceAdi);
            if (sonuc.changes > 0) ilceEklenen++;
            else atlananIlce++;
        }
    }
});
console.log(
    `${ilceEklenen} ilce eklendi (toplam ${ilceToplam} ilce listede, ${atlananIlce} ilce zaten var oldugu icin atlandi).`
);
console.log('\nSeed islemi tamamlandi.');
