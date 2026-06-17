const express = require('express');
const db = require('../database/db');
const { tokenDogrula } = require('../middleware/auth');
const router = express.Router();

// GET /api/bildirimler -> kendi bildirimlerim
router.get('/', tokenDogrula, (req, res) => {
    const b = db.prepare('SELECT * FROM bildirimler WHERE kullanici_id = ? ORDER BY id DESC LIMIT 50').all(req.kullanici.id);
    const okunmamis = db.prepare('SELECT COUNT(*) s FROM bildirimler WHERE kullanici_id = ? AND okundu = 0').get(req.kullanici.id).s;
    res.json({ bildirimler: b, okunmamis });
});

// GET /api/bildirimler/sayi -> sadece okunmamis sayisi (sik cagrilir)
router.get('/sayi', tokenDogrula, (req, res) => {
    const s = db.prepare('SELECT COUNT(*) s FROM bildirimler WHERE kullanici_id = ? AND okundu = 0').get(req.kullanici.id).s;
    res.json({ okunmamis: s });
});

// PUT /api/bildirimler/okundu -> tumunu okundu olarak isaretle
router.put('/okundu', tokenDogrula, (req, res) => {
    db.prepare('UPDATE bildirimler SET okundu = 1 WHERE kullanici_id = ?').run(req.kullanici.id);
    res.json({ mesaj: 'Tüm bildirimler okundu olarak işaretlendi.' });
});

// PUT /api/bildirimler/:id/okundu -> tekini okundu yap
router.put('/:id/okundu', tokenDogrula, (req, res) => {
    db.prepare('UPDATE bildirimler SET okundu = 1 WHERE id = ? AND kullanici_id = ?').run(req.params.id, req.kullanici.id);
    res.json({ mesaj: 'Okundu.' });
});

// DELETE /api/bildirimler/temizle -> okunmuslari sil
router.delete('/temizle', tokenDogrula, (req, res) => {
    db.prepare('DELETE FROM bildirimler WHERE kullanici_id = ? AND okundu = 1').run(req.kullanici.id);
    res.json({ mesaj: 'Okunmuş bildirimler silindi.' });
});

module.exports = router;
