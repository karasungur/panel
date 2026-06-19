const express = require('express');
const db = require('../database/db');
const { tokenDogrula } = require('../middleware/auth');
const router = express.Router();

// 14 gunden eski okunmus bildirimleri her API cagrisi oncesi temizle (hafif)
let sonTemizlik = 0;
function eskiBildirimleriTemizle() {
    const simdi = Date.now();
    // Saatte bir yapilsin yeter
    if (simdi - sonTemizlik < 60 * 60 * 1000) return;
    sonTemizlik = simdi;
    try {
        db.prepare("DELETE FROM bildirimler WHERE olusturulma_tarihi < datetime('now', '-14 days')").run();
    } catch (_e) {}
}

// GET /api/bildirimler -> kendi bildirimlerim
router.get('/', tokenDogrula, (req, res) => {
    eskiBildirimleriTemizle();
    const b = db
        .prepare('SELECT * FROM bildirimler WHERE kullanici_id = ? ORDER BY id DESC LIMIT 50')
        .all(req.kullanici.id);
    const okunmamis = db
        .prepare('SELECT COUNT(*) s FROM bildirimler WHERE kullanici_id = ? AND okundu = 0')
        .get(req.kullanici.id).s;
    res.json({ bildirimler: b, okunmamis });
});

// GET /api/bildirimler/sayi -> sadece okunmamis sayisi (sik cagrilir)
router.get('/sayi', tokenDogrula, (req, res) => {
    const s = db
        .prepare('SELECT COUNT(*) s FROM bildirimler WHERE kullanici_id = ? AND okundu = 0')
        .get(req.kullanici.id).s;
    res.json({ okunmamis: s });
});

// PUT /api/bildirimler/okundu -> tumunu okundu olarak isaretle
router.put('/okundu', tokenDogrula, (req, res) => {
    db.prepare('UPDATE bildirimler SET okundu = 1 WHERE kullanici_id = ?').run(req.kullanici.id);
    res.json({ mesaj: 'Tüm bildirimler okundu olarak işaretlendi.' });
});

// PUT /api/bildirimler/:id/okundu -> tekini okundu yap
router.put('/:id/okundu', tokenDogrula, (req, res) => {
    db.prepare('UPDATE bildirimler SET okundu = 1 WHERE id = ? AND kullanici_id = ?').run(
        req.params.id,
        req.kullanici.id
    );
    res.json({ mesaj: 'Okundu.' });
});

// DELETE /api/bildirimler/:id -> tek bildirim sil
router.delete('/:id', tokenDogrula, (req, res) => {
    db.prepare('DELETE FROM bildirimler WHERE id = ? AND kullanici_id = ?').run(req.params.id, req.kullanici.id);
    res.json({ mesaj: 'Bildirim silindi.' });
});

// DELETE /api/bildirimler -> tum bildirimleri sil
router.delete('/', tokenDogrula, (req, res) => {
    db.prepare('DELETE FROM bildirimler WHERE kullanici_id = ?').run(req.kullanici.id);
    res.json({ mesaj: 'Tüm bildirimler silindi.' });
});

module.exports = router;
