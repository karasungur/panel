const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { JWT_SECRET, tokenDogrula, AUTH_COOKIE_NAME } = require('../middleware/auth');
const { telefonNormalizeEt } = require('../utils/phone');
const router = express.Router();

// ============ BRUTE FORCE KORUMASI ============
const yanlisDenemeler = new Map();
const MAX_DENEME = 5;
const KILIT_SURE_MS = 15 * 60 * 1000;
const SAYACI_SIFIRLA_MS = 30 * 60 * 1000;
const LOGIN_TEMIZLIK_ARALIGI_MS = 60 * 1000;
const LOGIN_IP_AKTIF_ANAHTAR_LIMITI = dogalSayiEnv(['LOGIN_IP_KEY_LIMIT', 'LOGIN_IP_AKTIF_ANAHTAR_LIMITI'], 50);
const OTURUM_SURE_MS = 8 * 60 * 60 * 1000;
const LOGIN_ATTEMPTS_KOLONLARI = [
    'anahtar',
    'ip',
    'telefon',
    'sayi',
    'ilk_deneme_ms',
    'kilitli_kadar_ms',
    'guncellenme_tarihi'
];
let loginAttemptsTablosuAktif = null;
let sonBellekTemizligi = 0;

function dogalSayiEnv(adlar, varsayilan) {
    for (const ad of adlar) {
        const ham = process.env[ad];
        if (ham === undefined || ham === '') continue;

        const sayi = Number(ham);
        if (Number.isSafeInteger(sayi) && sayi >= 0) return sayi;
    }

    return varsayilan;
}

function istemciIP(req) {
    return String(req.ip || req.socket.remoteAddress || 'bilinmiyor').replace(/^::ffff:/, '');
}

function limiterAnahtari(ip, telefon) {
    return ip + ':' + telefon;
}

function kalanDakika(kilitliKadarMs) {
    return Math.ceil((kilitliKadarMs - Date.now()) / 60000);
}

function loginAttemptsTablosuVarMi() {
    if (loginAttemptsTablosuAktif === true) return true;

    try {
        const kolonlar = new Set(
            db
                .prepare('PRAGMA table_info(login_attempts)')
                .all()
                .map((kolon) => kolon.name)
        );
        loginAttemptsTablosuAktif = LOGIN_ATTEMPTS_KOLONLARI.every((kolon) => kolonlar.has(kolon));
        return loginAttemptsTablosuAktif;
    } catch (err) {
        console.warn('[auth] login_attempts tablosu kontrol edilemedi:', err.message);
        loginAttemptsTablosuAktif = false;
        return false;
    }
}

function loginAttemptKaydiAktifMi(kayit, simdi = Date.now()) {
    const kilitliKadarMs = Number(kayit.kilitli_kadar_ms || kayit.kilitliyeKadar) || 0;
    if (kilitliKadarMs && kilitliKadarMs > simdi) return true;

    const ilkDenemeMs = Number(kayit.ilk_deneme_ms || kayit.ilkDeneme) || 0;
    return !!ilkDenemeMs && simdi - ilkDenemeMs <= SAYACI_SIFIRLA_MS;
}

function suresiDolanLoginAttemptlariTemizle() {
    const simdi = Date.now();
    if (!loginAttemptsTablosuVarMi()) return;

    db.prepare(
        `
        DELETE FROM login_attempts
        WHERE (kilitli_kadar_ms > 0 AND kilitli_kadar_ms <= ?)
           OR (? - ilk_deneme_ms > ?)
    `
    ).run(simdi, simdi, SAYACI_SIFIRLA_MS);
}

function suresiDolanBellekAttemptlariTemizle(force = false) {
    const simdi = Date.now();
    if (!force && simdi - sonBellekTemizligi < LOGIN_TEMIZLIK_ARALIGI_MS) return;
    sonBellekTemizligi = simdi;

    for (const [anahtar, kayit] of yanlisDenemeler.entries()) {
        if (!loginAttemptKaydiAktifMi(kayit, simdi)) yanlisDenemeler.delete(anahtar);
    }
}

function loginAttemptTemizligiYap() {
    if (loginAttemptsTablosuVarMi()) suresiDolanLoginAttemptlariTemizle();
    else suresiDolanBellekAttemptlariTemizle();
}

function kilitMiSqlite(anahtar) {
    const simdi = Date.now();
    const k = db
        .prepare('SELECT sayi, ilk_deneme_ms, kilitli_kadar_ms FROM login_attempts WHERE anahtar = ?')
        .get(anahtar);

    if (!k) return false;

    const kilitliKadarMs = Number(k.kilitli_kadar_ms) || 0;
    if (kilitliKadarMs && kilitliKadarMs > simdi) {
        return kalanDakika(kilitliKadarMs);
    }

    const ilkDenemeMs = Number(k.ilk_deneme_ms) || 0;
    if ((kilitliKadarMs && kilitliKadarMs <= simdi) || (ilkDenemeMs && simdi - ilkDenemeMs > SAYACI_SIFIRLA_MS)) {
        db.prepare('DELETE FROM login_attempts WHERE anahtar = ?').run(anahtar);
    }

    return false;
}

function kilitMiBellek(anahtar) {
    const k = yanlisDenemeler.get(anahtar);
    if (!k) return false;
    if (k.kilitliyeKadar && k.kilitliyeKadar > Date.now()) {
        return kalanDakika(k.kilitliyeKadar);
    }
    if (!loginAttemptKaydiAktifMi(k)) {
        yanlisDenemeler.delete(anahtar);
    }
    return false;
}

function kilitMi(anahtar) {
    if (loginAttemptsTablosuVarMi()) return kilitMiSqlite(anahtar);
    return kilitMiBellek(anahtar);
}

function yanlisDenemeSqlite(ip, telefon, anahtar) {
    const simdi = Date.now();
    let k = db
        .prepare('SELECT sayi, ilk_deneme_ms, kilitli_kadar_ms FROM login_attempts WHERE anahtar = ?')
        .get(anahtar);

    if (k && simdi - (Number(k.ilk_deneme_ms) || 0) > SAYACI_SIFIRLA_MS) {
        k = null;
    }

    const sayi = (k ? Number(k.sayi) || 0 : 0) + 1;
    const ilkDenemeMs = k ? Number(k.ilk_deneme_ms) || simdi : simdi;
    const kilitliKadarMs = sayi >= MAX_DENEME ? simdi + KILIT_SURE_MS : 0;

    db.prepare(
        `
        INSERT INTO login_attempts
            (anahtar, ip, telefon, sayi, ilk_deneme_ms, kilitli_kadar_ms, guncellenme_tarihi)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(anahtar) DO UPDATE SET
            ip = excluded.ip,
            telefon = excluded.telefon,
            sayi = excluded.sayi,
            ilk_deneme_ms = excluded.ilk_deneme_ms,
            kilitli_kadar_ms = excluded.kilitli_kadar_ms,
            guncellenme_tarihi = CURRENT_TIMESTAMP
    `
    ).run(anahtar, ip, telefon, sayi, ilkDenemeMs, kilitliKadarMs);

    return MAX_DENEME - sayi;
}

function yanlisDenemeBellek(anahtar) {
    const simdi = Date.now();
    let k = yanlisDenemeler.get(anahtar);
    if (k && simdi - k.ilkDeneme > SAYACI_SIFIRLA_MS) {
        k = null;
    }
    if (!k) {
        k = { sayi: 0, ilkDeneme: simdi, kilitliyeKadar: 0 };
    }
    k.sayi++;
    if (k.sayi >= MAX_DENEME) {
        k.kilitliyeKadar = simdi + KILIT_SURE_MS;
    }
    yanlisDenemeler.set(anahtar, k);
    return MAX_DENEME - k.sayi;
}

function ipLimitAsildiMiSqlite(ip, anahtar) {
    if (LOGIN_IP_AKTIF_ANAHTAR_LIMITI <= 0) return false;
    if (db.prepare('SELECT 1 FROM login_attempts WHERE anahtar = ?').get(anahtar)) return false;

    const simdi = Date.now();
    const aktif = db
        .prepare(
            `
            SELECT COUNT(*) AS toplam
            FROM login_attempts
            WHERE ip = ?
              AND (
                  (kilitli_kadar_ms > 0 AND kilitli_kadar_ms > ?)
                  OR (? - ilk_deneme_ms <= ?)
              )
        `
        )
        .get(ip, simdi, simdi, SAYACI_SIFIRLA_MS);

    return (Number(aktif && aktif.toplam) || 0) >= LOGIN_IP_AKTIF_ANAHTAR_LIMITI;
}

function ipLimitAsildiMiBellek(ip, anahtar) {
    if (LOGIN_IP_AKTIF_ANAHTAR_LIMITI <= 0) return false;
    if (yanlisDenemeler.has(anahtar)) return false;

    const simdi = Date.now();
    let toplam = 0;
    const prefix = ip + ':';
    for (const [kayitAnahtari, kayit] of yanlisDenemeler.entries()) {
        if (kayitAnahtari.startsWith(prefix) && loginAttemptKaydiAktifMi(kayit, simdi)) toplam++;
    }

    return toplam >= LOGIN_IP_AKTIF_ANAHTAR_LIMITI;
}

function ipLimitAsildiMi(ip, anahtar) {
    if (loginAttemptsTablosuVarMi()) return ipLimitAsildiMiSqlite(ip, anahtar);
    return ipLimitAsildiMiBellek(ip, anahtar);
}

function yanlisDeneme(ip, telefon, anahtar) {
    if (loginAttemptsTablosuVarMi()) return yanlisDenemeSqlite(ip, telefon, anahtar);
    return yanlisDenemeBellek(anahtar);
}

function basariliGiris(anahtar) {
    if (loginAttemptsTablosuVarMi()) {
        db.prepare('DELETE FROM login_attempts WHERE anahtar = ?').run(anahtar);
        return;
    }

    yanlisDenemeler.delete(anahtar);
}

function cookieSecureMi(req) {
    const ayar = String(process.env.AUTH_COOKIE_SECURE || '')
        .trim()
        .toLowerCase();
    if (ayar === 'true' || ayar === '1') return true;
    if (ayar === 'false' || ayar === '0') return false;
    return process.env.NODE_ENV === 'production' || req.secure;
}

/**
 * @returns {'lax' | 'strict' | 'none'}
 */
function cookieSameSiteAl() {
    const deger = String(process.env.AUTH_COOKIE_SAMESITE || 'lax')
        .trim()
        .toLowerCase();
    if (deger === 'strict' || deger === 'none') return deger;
    return 'lax';
}

function oturumCookieAyarlari(req) {
    return {
        httpOnly: true,
        secure: cookieSecureMi(req),
        sameSite: cookieSameSiteAl(),
        path: '/',
        maxAge: OTURUM_SURE_MS
    };
}

function oturumCookieTemizlemeAyarlari(req) {
    const ayarlar = oturumCookieAyarlari(req);
    delete ayarlar.maxAge;
    return ayarlar;
}

router.post('/login', (req, res) => {
    const ip = istemciIP(req);
    const { telefon, sifre } = req.body;

    if (!telefon || !sifre) {
        return res.status(400).json({ hata: 'Telefon numarası ve şifre gereklidir.' });
    }

    const normalizeTelefon = telefonNormalizeEt(telefon);
    if (!normalizeTelefon) {
        return res.status(400).json({ hata: 'Geçerli bir telefon numarası girin.' });
    }

    loginAttemptTemizligiYap();

    const anahtar = limiterAnahtari(ip, normalizeTelefon);
    const kilitliDakika = kilitMi(anahtar);
    if (kilitliDakika) {
        return res.status(429).json({
            hata: 'Çok fazla başarısız giriş. ' + kilitliDakika + ' dakika sonra tekrar deneyin.'
        });
    }

    const kullanici = db.prepare('SELECT * FROM kullanicilar WHERE telefon = ?').get(normalizeTelefon);
    if (!kullanici) {
        if (ipLimitAsildiMi(ip, anahtar)) {
            return res.status(429).json({ hata: 'Çok fazla farklı telefon denendi. Daha sonra tekrar deneyin.' });
        }
        const kalan = yanlisDeneme(ip, normalizeTelefon, anahtar);
        if (kalan <= 0) {
            return res.status(429).json({ hata: 'Çok fazla başarısız deneme. 15 dakika kilitlendi.' });
        }
        return res.status(401).json({ hata: 'Telefon veya şifre hatalı. Kalan deneme: ' + kalan });
    }

    const sifreDogru = bcrypt.compareSync(sifre, String(kullanici.sifre || ''));
    if (!sifreDogru) {
        if (ipLimitAsildiMi(ip, anahtar)) {
            return res.status(429).json({ hata: 'Çok fazla farklı telefon denendi. Daha sonra tekrar deneyin.' });
        }
        const kalan = yanlisDeneme(ip, normalizeTelefon, anahtar);
        if (kalan <= 0) {
            return res.status(429).json({ hata: 'Çok fazla başarısız deneme. 15 dakika kilitlendi.' });
        }
        return res.status(401).json({ hata: 'Telefon veya şifre hatalı. Kalan deneme: ' + kalan });
    }

    basariliGiris(anahtar);

    // Son giris zamanini kaydet
    db.prepare('UPDATE kullanicilar SET son_giris = CURRENT_TIMESTAMP WHERE id = ?').run(kullanici.id);

    const token = jwt.sign(
        {
            id: kullanici.id,
            telefon: kullanici.telefon,
            rol: kullanici.rol,
            tokenVersion: Number(kullanici.token_version) || 0
        },
        JWT_SECRET,
        { expiresIn: '8h' }
    );

    res.cookie(AUTH_COOKIE_NAME, token, oturumCookieAyarlari(req));
    res.json({
        mesaj: 'Giriş başarılı.',
        kullanici: {
            id: kullanici.id,
            telefon: kullanici.telefon,
            rol: kullanici.rol,
            ad_soyad: kullanici.ad_soyad,
            gorev_adi: kullanici.gorev_adi,
            renk: kullanici.renk,
            profil_foto: kullanici.profil_foto
        }
    });
});

router.post('/logout', (_req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, oturumCookieTemizlemeAyarlari(_req));
    res.json({ mesaj: 'Çıkış yapıldı.' });
});

router.get('/me', tokenDogrula, (req, res) => {
    const iller = db
        .prepare(
            `
        SELECT i.id, i.il_adi FROM kullanici_iller ki
        JOIN iller i ON ki.il_id = i.id
        WHERE ki.kullanici_id = ? ORDER BY i.plaka
    `
        )
        .all(req.kullanici.id);
    res.json({ ...req.kullanici, iller });
});

module.exports = router;
