const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'varsayilan-gizli-anahtar-degistirin';

// Her istekte JWT token'i dogrular
function tokenDogrula(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ hata: 'Yetkilendirme gerekli. Lutfen giris yapin.' });
    try {
        const cozulmus = jwt.verify(token, JWT_SECRET);
        req.kullanici = cozulmus;
        next();
    } catch (err) {
        return res.status(401).json({ hata: 'Gecersiz veya suresi dolmus oturum.' });
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
