const jwt = require('jsonwebtoken');
const { jwtSecretHatasi } = require('../utils/security');

const VARSAYILAN_JWT_SECRET = 'varsayilan-gizli-anahtar-degistirin';
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'panel_oturum';

function uretimOrtamiMi() {
    return process.env.NODE_ENV === 'production';
}

function jwtSecretAl() {
    const secret = (process.env.JWT_SECRET || '').trim();
    const secretHatasi = secret ? jwtSecretHatasi(secret) : 'JWT_SECRET zorunludur.';

    if (uretimOrtamiMi() && secretHatasi) {
        throw new Error(`JWT_SECRET production ortaminda gecersiz: ${secretHatasi}`);
    }

    if (!secret) {
        console.warn('[auth] JWT_SECRET tanimli degil; yalnizca gelistirme icin varsayilan anahtar kullaniliyor.');
        return VARSAYILAN_JWT_SECRET;
    }

    if (secretHatasi) {
        console.warn(`[auth] JWT_SECRET zayif gorunuyor; production ortaminda reddedilir: ${secretHatasi}`);
    }

    return secret;
}

const JWT_SECRET = jwtSecretAl();
const db = require('../database/db');

const kullaniciSorgu = db.prepare(`
    SELECT id, telefon, rol, ad_soyad, gorev_adi, renk, profil_foto, token_version
    FROM kullanicilar
    WHERE id = ?
`);

function bearerTokenAl(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return null;

    const [tip, token] = authHeader.split(' ');
    if (tip !== 'Bearer' || !token) return null;

    return token;
}

function cookieTokenAl(req) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    for (const parca of cookieHeader.split(';')) {
        const [ad, ...degerParcalari] = parca.trim().split('=');
        if (ad !== AUTH_COOKIE_NAME) continue;

        const deger = degerParcalari.join('=');
        if (!deger) return null;

        try {
            return decodeURIComponent(deger);
        } catch (_err) {
            return deger;
        }
    }

    return null;
}

function istekTokeniAl(req) {
    return bearerTokenAl(req) || cookieTokenAl(req);
}

// Her istekte JWT token'i dogrular
function tokenDogrula(req, res, next) {
    const token = istekTokeniAl(req);
    if (!token) return res.status(401).json({ hata: 'Yetkilendirme gerekli. Lutfen giris yapin.' });

    let cozulmus;
    try {
        cozulmus = jwt.verify(token, JWT_SECRET);
    } catch (_err) {
        return res.status(401).json({ hata: 'Gecersiz veya suresi dolmus oturum.' });
    }

    try {
        if (!cozulmus || typeof cozulmus !== 'object') {
            return res.status(401).json({ hata: 'Oturum gecersiz. Lutfen yeniden giris yapin.' });
        }

        const kullaniciId = Number(cozulmus.id);
        const tokenVersion = Number(cozulmus.tokenVersion);

        if (!Number.isInteger(kullaniciId) || kullaniciId <= 0 || !Number.isInteger(tokenVersion)) {
            return res.status(401).json({ hata: 'Oturum gecersiz. Lutfen yeniden giris yapin.' });
        }

        const kullanici = kullaniciSorgu.get(kullaniciId);
        if (!kullanici) {
            return res.status(401).json({ hata: 'Oturum kullanicisi bulunamadi.' });
        }

        if (Number(kullanici.token_version) !== tokenVersion) {
            return res.status(401).json({ hata: 'Oturum gecersiz. Lutfen yeniden giris yapin.' });
        }

        req.kullanici = {
            id: kullanici.id,
            telefon: kullanici.telefon,
            rol: kullanici.rol,
            ad_soyad: kullanici.ad_soyad,
            gorev_adi: kullanici.gorev_adi,
            renk: kullanici.renk,
            profil_foto: kullanici.profil_foto,
            tokenVersion
        };
        next();
    } catch (err) {
        console.error('Auth dogrulama hatasi:', err);
        return res.status(500).json({ hata: 'Oturum dogrulanirken sunucu hatasi olustu.' });
    }
}

// Sadece admin
function sadeceAdmin(req, res, next) {
    if (req.kullanici.rol !== 'admin') {
        return res.status(403).json({ hata: 'Bu islem icin yonetici yetkisi gerekli.' });
    }
    next();
}

// Admin VEYA yardimci
function adminVeyaYardimci(req, res, next) {
    if (req.kullanici.rol !== 'admin' && req.kullanici.rol !== 'yardimci') {
        return res.status(403).json({ hata: 'Bu islem icin yetkiniz yok.' });
    }
    next();
}

module.exports = { tokenDogrula, sadeceAdmin, adminVeyaYardimci, JWT_SECRET, AUTH_COOKIE_NAME };
