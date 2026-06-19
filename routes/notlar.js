const express = require('express');
const sanitizeHtml = require('sanitize-html');
const db = require('../database/db');
const { tokenDogrula } = require('../middleware/auth');
const router = express.Router();

const ICERIK_SANITIZE_AYARLARI = {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'a'],
    allowedAttributes: {
        a: ['href', 'target', 'rel']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
        a: sanitizeHtml.simpleTransform('a', {
            rel: 'noopener noreferrer',
            target: '_blank'
        })
    }
};

function baslikTemizle(baslik) {
    const temiz = sanitizeHtml(String(baslik || '').trim(), { allowedTags: [], allowedAttributes: {} });
    return temiz.slice(0, 160) || 'Başlıksız';
}

function icerikTemizle(icerik) {
    return sanitizeHtml(String(icerik || ''), ICERIK_SANITIZE_AYARLARI).slice(0, 200000);
}

function notTemizle(not) {
    if (!not) return not;
    return {
        ...not,
        baslik: baslikTemizle(not.baslik),
        icerik: icerikTemizle(not.icerik)
    };
}

// GET /api/notlar -> kendi notlarim (en yeni once)
router.get('/', tokenDogrula, (req, res) => {
    const notlar = db
        .prepare(
            'SELECT id, baslik, icerik, olusturulma_tarihi, guncellenme_tarihi FROM notlar WHERE kullanici_id = ? ORDER BY guncellenme_tarihi DESC'
        )
        .all(req.kullanici.id);
    res.json(notlar.map(notTemizle));
});

// POST /api/notlar -> yeni not
router.post('/', tokenDogrula, (req, res) => {
    const { baslik, icerik } = req.body;
    const sonuc = db
        .prepare('INSERT INTO notlar (kullanici_id, baslik, icerik) VALUES (?, ?, ?)')
        .run(req.kullanici.id, baslikTemizle(baslik), icerikTemizle(icerik));
    const not = db.prepare('SELECT * FROM notlar WHERE id = ?').get(sonuc.lastInsertRowid);
    res.status(201).json(notTemizle(not));
});

// PUT /api/notlar/:id -> not guncelle (sadece kendi notu)
router.put('/:id', tokenDogrula, (req, res) => {
    const not = db.prepare('SELECT kullanici_id FROM notlar WHERE id = ?').get(req.params.id);
    if (!not) return res.status(404).json({ hata: 'Not bulunamadı.' });
    if (not.kullanici_id !== req.kullanici.id) return res.status(403).json({ hata: 'Bu not size ait değil.' });
    const { baslik, icerik } = req.body;
    db.prepare(
        'UPDATE notlar SET baslik = COALESCE(?, baslik), icerik = COALESCE(?, icerik), guncellenme_tarihi = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(
        baslik === undefined ? null : baslikTemizle(baslik),
        icerik === undefined ? null : icerikTemizle(icerik),
        req.params.id
    );
    res.json({ mesaj: 'Not güncellendi.' });
});

// DELETE /api/notlar/:id
router.delete('/:id', tokenDogrula, (req, res) => {
    const not = db.prepare('SELECT kullanici_id FROM notlar WHERE id = ?').get(req.params.id);
    if (!not) return res.status(404).json({ hata: 'Not bulunamadı.' });
    if (not.kullanici_id !== req.kullanici.id) return res.status(403).json({ hata: 'Bu not size ait değil.' });
    db.prepare('DELETE FROM notlar WHERE id = ?').run(req.params.id);
    res.json({ mesaj: 'Not silindi.' });
});

module.exports = router;
