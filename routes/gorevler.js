const express = require('express');
const db = require('../database/db');
const { tokenDogrula, adminVeyaYardimci } = require('../middleware/auth');
const router = express.Router();

router.get('/', tokenDogrula, (req, res) => {
    if (req.kullanici.rol === 'admin') {
        const g = db.prepare(`SELECT g.*, k.kullanici_adi, k.ad_soyad FROM gorevler g JOIN kullanicilar k ON g.kullanici_id=k.id ORDER BY g.id DESC`).all();
        return res.json(g);
    }
    const g = db.prepare('SELECT * FROM gorevler WHERE kullanici_id = ? ORDER BY id DESC').all(req.kullanici.id);
    res.json(g);
});

router.post('/', tokenDogrula, adminVeyaYardimci, (req, res) => {
    const { kullanici_id, baslik, aciklama } = req.body;
    if (!kullanici_id || !baslik) return res.status(400).json({ hata: 'Kullanıcı ve başlık gereklidir.' });
    const sonuc = db.prepare('INSERT INTO gorevler (kullanici_id, baslik, aciklama) VALUES (?, ?, ?)').run(kullanici_id, baslik, aciklama || null);
    res.status(201).json({ mesaj: 'Görev eklendi.', id: sonuc.lastInsertRowid });
});

router.put('/:id/durum', tokenDogrula, (req, res) => {
    const { durum } = req.body;
    if (!['bekliyor','tamamlandi'].includes(durum)) return res.status(400).json({ hata: 'Geçersiz durum.' });
    const g = db.prepare('SELECT * FROM gorevler WHERE id = ?').get(req.params.id);
    if (!g) return res.status(404).json({ hata: 'Görev bulunamadı.' });
    if (req.kullanici.rol !== 'admin' && g.kullanici_id !== req.kullanici.id) return res.status(403).json({ hata: 'Yetkiniz yok.' });
    db.prepare('UPDATE gorevler SET durum = ? WHERE id = ?').run(durum, req.params.id);
    res.json({ mesaj: 'Görev güncellendi.' });
});

router.delete('/:id', tokenDogrula, adminVeyaYardimci, (req, res) => {
    db.prepare('DELETE FROM gorevler WHERE id = ?').run(req.params.id);
    res.json({ mesaj: 'Görev silindi.' });
});

module.exports = router;
