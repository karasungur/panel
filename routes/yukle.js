const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { tokenDogrula } = require('../middleware/auth');
const router = express.Router();

// Kalici disk varsa uploads orada tutulsun, yoksa public/uploads
const uploadDir = process.env.DATA_DIR
    ? path.join(path.resolve(process.env.DATA_DIR), 'uploads')
    : path.join(__dirname, '..', 'public', 'uploads');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const izinliTipler = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
};

router.post('/', tokenDogrula, express.json({ limit: '8mb' }), (req, res) => {
    const { dosya } = req.body;
    if (!dosya || typeof dosya !== 'string') {
        return res.status(400).json({ hata: 'Dosya verisi gereklidir.' });
    }
    const eslesme = dosya.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!eslesme) {
        return res.status(400).json({ hata: 'Geçersiz resim formatı.' });
    }
    const mimeTip = eslesme[1];
    const base64Veri = eslesme[2];
    const uzanti = izinliTipler[mimeTip];
    if (!uzanti) {
        return res.status(400).json({ hata: 'Sadece JPG, PNG, WEBP, GIF yüklenebilir.' });
    }
    const buffer = Buffer.from(base64Veri, 'base64');
    if (buffer.length > 8 * 1024 * 1024) {
        return res.status(400).json({ hata: 'Dosya boyutu 8MB üzerinde olamaz.' });
    }
    const dosyaAdi = crypto.randomBytes(12).toString('hex') + uzanti;
    fs.writeFileSync(path.join(uploadDir, dosyaAdi), buffer);
    res.json({ mesaj: 'Yüklendi.', url: '/uploads/' + dosyaAdi });
});

module.exports = router;
