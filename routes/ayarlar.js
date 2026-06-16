const express = require('express');
const db = require('../database/db');
const { tokenDogrula, sadeceAdmin } = require('../middleware/auth');
const router = express.Router();

router.put('/safe-key', tokenDogrula, sadeceAdmin, (req, res) => {
    const { yeni_anahtar } = req.body;
    if (!yeni_anahtar) return res.status(400).json({ hata: 'Yeni özel anahtar gereklidir.' });
    const mevcut = db.prepare("SELECT deger FROM ayarlar WHERE anahtar = 'safe_key'").get();
    if (mevcut) db.prepare("UPDATE ayarlar SET deger = ? WHERE anahtar = 'safe_key'").run(yeni_anahtar);
    else db.prepare("INSERT INTO ayarlar (anahtar, deger) VALUES ('safe_key', ?)").run(yeni_anahtar);
    res.json({ mesaj: 'Özel anahtar güncellendi.' });
});

module.exports = router;
