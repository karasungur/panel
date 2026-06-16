const express = require('express');
const db = require('../database/db');
const { tokenDogrula, adminVeyaYardimci } = require('../middleware/auth');
const router = express.Router();

router.get('/', tokenDogrula, (req, res) => {
    const mesajlar = db.prepare('SELECT * FROM mesajlar ORDER BY id DESC LIMIT 200').all();
    res.json(mesajlar.reverse());
});

router.post('/', tokenDogrula, (req, res) => {
    const { metin } = req.body;
    if (!metin || !metin.trim()) return res.status(400).json({ hata: 'Mesaj boş olamaz.' });
    const k = db.prepare('SELECT kullanici_adi, ad_soyad, renk FROM kullanicilar WHERE id = ?').get(req.kullanici.id);
    const sonuc = db.prepare('INSERT INTO mesajlar (kullanici_id, kullanici_adi, ad_soyad, renk, metin) VALUES (?, ?, ?, ?, ?)')
        .run(req.kullanici.id, k.kullanici_adi, k.ad_soyad, k.renk, metin.trim().slice(0, 1000));
    res.status(201).json({ mesaj: 'Gönderildi.', id: sonuc.lastInsertRowid });
});

router.delete('/', tokenDogrula, adminVeyaYardimci, (req, res) => {
    db.prepare('DELETE FROM mesajlar').run();
    res.json({ mesaj: 'Sohbet sıfırlandı.' });
});

module.exports = router;
