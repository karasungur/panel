const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { JWT_SECRET } = require('../middleware/auth');
const router = express.Router();

// ============ BRUTE FORCE KORUMASI ============
const yanlisDenemeler = new Map();
const MAX_DENEME = 5;
const KILIT_SURE_MS = 15 * 60 * 1000;
const SAYACI_SIFIRLA_MS = 30 * 60 * 1000;

function istemciIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.headers['x-real-ip']
        || req.socket.remoteAddress
        || 'bilinmiyor';
}

function kilitMi(ip) {
    const k = yanlisDenemeler.get(ip);
    if (!k) return false;
    if (k.kilitliyeKadar && k.kilitliyeKadar > Date.now()) {
        return Math.ceil((k.kilitliyeKadar - Date.now()) / 60000);
    }
    if (k.kilitliyeKadar && k.kilitliyeKadar <= Date.now()) {
        yanlisDenemeler.delete(ip);
    }
    return false;
}

function yanlisDeneme(ip) {
    const simdi = Date.now();
    let k = yanlisDenemeler.get(ip);
    if (k && (simdi - k.ilkDeneme) > SAYACI_SIFIRLA_MS) {
        k = null;
    }
    if (!k) {
        k = { sayi: 0, ilkDeneme: simdi, kilitliyeKadar: 0 };
    }
    k.sayi++;
    if (k.sayi >= MAX_DENEME) {
        k.kilitliyeKadar = simdi + KILIT_SURE_MS;
    }
    yanlisDenemeler.set(ip, k);
    return MAX_DENEME - k.sayi;
}

function basariliGiris(ip) {
    yanlisDenemeler.delete(ip);
}

function safeKeyAl() {
    const row = db.prepare("SELECT deger FROM ayarlar WHERE anahtar = 'safe_key'").get();
    if (row) return row.deger;
    return process.env.SAFE_KEY || '';
}

router.post('/login', (req, res) => {
    const ip = istemciIP(req);

    const kalanDakika = kilitMi(ip);
    if (kalanDakika) {
        return res.status(429).json({
            hata: 'Çok fazla başarısız giriş. ' + kalanDakika + ' dakika sonra tekrar deneyin.'
        });
    }

    const { kullanici_adi, sifre, ozel_anahtar } = req.body;

    if (!ozel_anahtar || ozel_anahtar !== safeKeyAl()) {
        const kalan = yanlisDeneme(ip);
        if (kalan <= 0) {
            return res.status(429).json({ hata: 'Çok fazla başarısız deneme. 15 dakika kilitlendi.' });
        }
        return res.status(401).json({ hata: 'Özel anahtar hatalı. Kalan deneme: ' + kalan });
    }
    if (!kullanici_adi || !sifre) {
        return res.status(400).json({ hata: 'Kullanıcı adı ve şifre gereklidir.' });
    }

    const kullanici = db.prepare('SELECT * FROM kullanicilar WHERE kullanici_adi = ?').get(kullanici_adi);
    if (!kullanici) {
        const kalan = yanlisDeneme(ip);
        if (kalan <= 0) {
            return res.status(429).json({ hata: 'Çok fazla başarısız deneme. 15 dakika kilitlendi.' });
        }
        return res.status(401).json({ hata: 'Kullanıcı adı veya şifre hatalı. Kalan deneme: ' + kalan });
    }

    const sifreDogru = bcrypt.compareSync(sifre, kullanici.sifre);
    if (!sifreDogru) {
        const kalan = yanlisDeneme(ip);
        if (kalan <= 0) {
            return res.status(429).json({ hata: 'Çok fazla başarısız deneme. 15 dakika kilitlendi.' });
        }
        return res.status(401).json({ hata: 'Kullanıcı adı veya şifre hatalı. Kalan deneme: ' + kalan });
    }

    basariliGiris(ip);

    // Son giris zamanini kaydet
    db.prepare('UPDATE kullanicilar SET son_giris = CURRENT_TIMESTAMP WHERE id = ?').run(kullanici.id);

    const token = jwt.sign(
        { id: kullanici.id, kullanici_adi: kullanici.kullanici_adi, rol: kullanici.rol },
        JWT_SECRET, { expiresIn: '8h' }
    );

    res.json({
        mesaj: 'Giriş başarılı.',
        token,
        kullanici: {
            id: kullanici.id,
            kullanici_adi: kullanici.kullanici_adi,
            rol: kullanici.rol,
            ad_soyad: kullanici.ad_soyad,
            gorev_adi: kullanici.gorev_adi,
            renk: kullanici.renk,
            profil_foto: kullanici.profil_foto
        }
    });
});

module.exports = router;
