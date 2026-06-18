const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { tokenDogrula } = require('../middleware/auth');
const router = express.Router();
const fsp = fs.promises;

const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, '..', 'database');
const uploadDir = path.join(dataDir, 'uploads');
const legacyUploadDir = path.join(__dirname, '..', 'public', 'uploads');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const MAKS_DOSYA_BOYUTU = 8 * 1024 * 1024;

const izinliTipler = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
};

const tipBasliklari = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
};

function base64GecerliMi(veri) {
    return veri.length > 0 && veri.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(veri);
}

async function fileTypeFromBufferDynamic(buffer) {
    const mod = await import('file-type');
    return mod.fileTypeFromBuffer(buffer);
}

function tokenSorgudan(req, res, next) {
    if (!req.headers.authorization && req.query.token) {
        req.headers.authorization = 'Bearer ' + req.query.token;
    }
    next();
}

function dosyaYoluBul(dosyaAdi) {
    const anaYol = path.join(uploadDir, dosyaAdi);
    if (fs.existsSync(anaYol)) return anaYol;

    const eskiYol = path.join(legacyUploadDir, dosyaAdi);
    if (fs.existsSync(eskiYol)) return eskiYol;

    return null;
}

router.get('/:dosyaAdi', tokenSorgudan, tokenDogrula, (req, res) => {
    const dosyaAdi = String(req.params.dosyaAdi || '');
    if (!/^[a-f0-9]{24}\.(jpg|jpeg|png|webp)$/i.test(dosyaAdi)) {
        return res.status(404).json({ hata: 'Dosya bulunamadı.' });
    }
    const tamYol = dosyaYoluBul(dosyaAdi);
    if (!tamYol) return res.status(404).json({ hata: 'Dosya bulunamadı.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(tipBasliklari[path.extname(dosyaAdi).toLowerCase()] || 'application/octet-stream');
    res.sendFile(tamYol);
});

router.post('/', tokenDogrula, express.json({ limit: '12mb' }), async (req, res) => {
    try {
        const { dosya } = req.body;
        if (!dosya || typeof dosya !== 'string') {
            return res.status(400).json({ hata: 'Dosya verisi gereklidir.' });
        }
        const eslesme = dosya.match(/^data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
        if (!eslesme) {
            return res.status(400).json({ hata: 'Geçersiz resim formatı.' });
        }
        const mimeTip = eslesme[1].toLowerCase();
        const base64Veri = eslesme[2].replace(/\s/g, '');
        if (!base64GecerliMi(base64Veri)) {
            return res.status(400).json({ hata: 'Geçersiz dosya verisi.' });
        }

        const buffer = Buffer.from(base64Veri, 'base64');
        if (!buffer.length) {
            return res.status(400).json({ hata: 'Dosya boş olamaz.' });
        }
        if (buffer.length > MAKS_DOSYA_BOYUTU) {
            return res.status(400).json({ hata: 'Dosya boyutu 8MB üzerinde olamaz.' });
        }

        const tespit = await fileTypeFromBufferDynamic(buffer);
        const uzanti = tespit ? izinliTipler[tespit.mime] : null;
        if (!uzanti) {
            return res.status(400).json({ hata: 'Sadece gerçek JPG, PNG veya WEBP dosyaları yüklenebilir.' });
        }
        if (mimeTip !== tespit.mime) {
            return res.status(400).json({ hata: 'Dosya tipi beyan edilen formatla eşleşmiyor.' });
        }

        const dosyaAdi = crypto.randomBytes(12).toString('hex') + uzanti;
        await fsp.mkdir(uploadDir, { recursive: true });
        await fsp.writeFile(path.join(uploadDir, dosyaAdi), buffer, { flag: 'wx' });
        res.json({ mesaj: 'Yüklendi.', url: '/uploads/' + dosyaAdi });
    } catch (e) {
        console.error('Yükleme hatası:', e.message);
        res.status(500).json({ hata: 'Dosya yüklenemedi.' });
    }
});

module.exports = router;
