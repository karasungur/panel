const jwt = require('jsonwebtoken');

const VARSAYILAN_JWT_SECRET = 'varsayilan-gizli-anahtar-degistirin';
const MIN_JWT_SECRET_UZUNLUK = 32;

function uretimOrtamiMi() {
    return process.env.NODE_ENV === 'production';
}

function jwtSecretAl() {
    const secret = (process.env.JWT_SECRET || '').trim();
    const zayifSecret = !secret
        || secret === VARSAYILAN_JWT_SECRET
        || secret.length < MIN_JWT_SECRET_UZUNLUK;

    if (uretimOrtamiMi() && zayifSecret) {
        throw new Error(`JWT_SECRET production ortaminda zorunlu ve en az ${MIN_JWT_SECRET_UZUNLUK} karakter olmalidir.`);
    }

    if (!secret) {
        console.warn('[auth] JWT_SECRET tanimli degil; yalnizca gelistirme icin varsayilan anahtar kullaniliyor.');
        return VARSAYILAN_JWT_SECRET;
    }

    if (secret === VARSAYILAN_JWT_SECRET || secret.length < MIN_JWT_SECRET_UZUNLUK) {
        console.warn(`[auth] JWT_SECRET zayif gorunuyor; production ortaminda en az ${MIN_JWT_SECRET_UZUNLUK} karakter kullanin.`);
    }

    return secret;
}

const JWT_SECRET = jwtSecretAl();
const db = require('../database/db');

const kullaniciSorgu = db.prepare(`
    SELECT id, kullanici_adi, rol, ad_soyad, gorev_adi, renk, profil_foto, token_version
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

// Her istekte JWT token'i dogrular
function tokenDogrula(req, res, next) {
    const token = bearerTokenAl(req);
    if (!token) return res.status(401).json({ hata: 'Yetkilendirme gerekli. Lutfen giris yapin.' });

    let cozulmus;
    try {
        cozulmus = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ hata: 'Gecersiz veya suresi dolmus oturum.' });
    }

    try {
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
            kullanici_adi: kullanici.kullanici_adi,
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

module.exports = { tokenDogrula, sadeceAdmin, adminVeyaYardimci, JWT_SECRET };
