const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { tokenDogrula } = require('../middleware/auth');
const db = require('../database/db');
const {
    DOSYA_ADI_PATTERN,
    uploadMetadataKaydet,
    uploadMetadataKaydiAl,
    uploadMetadataSemasiAl
} = require('../utils/upload-metadata');
const router = express.Router();
const fsp = fs.promises;

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'database');
const uploadDir = path.join(dataDir, 'uploads');
const legacyUploadDir = path.join(__dirname, '..', 'public', 'uploads');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const MAKS_DOSYA_BOYUTU = 8 * 1024 * 1024;
const GUNLUK_UPLOAD_LIMITI = dogalSayiEnv(['UPLOAD_DAILY_LIMIT', 'UPLOAD_GUNLUK_LIMIT'], 50);
const TOPLAM_UPLOAD_BYTE_KOTASI = dogalSayiEnv(
    ['UPLOAD_TOTAL_BYTES_LIMIT', 'UPLOAD_TOPLAM_BYTE_KOTASI'],
    100 * 1024 * 1024
);

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

function dosyaYoluBul(dosyaAdi) {
    const anaYol = path.join(uploadDir, dosyaAdi);
    if (fs.existsSync(anaYol)) return anaYol;

    const eskiYol = path.join(legacyUploadDir, dosyaAdi);
    if (fs.existsSync(eskiYol)) return eskiYol;

    return null;
}

function dogalSayiEnv(adlar, varsayilan) {
    for (const ad of adlar) {
        const ham = process.env[ad];
        if (ham === undefined || ham === '') continue;

        const sayi = Number(ham);
        if (Number.isSafeInteger(sayi) && sayi >= 0) return sayi;
    }

    return varsayilan;
}

function sqlKimlik(kimlik) {
    return '"' + kimlik.replace(/"/g, '""') + '"';
}

function tumUploadlariGorebilirMi(kullanici) {
    return kullanici.rol === 'admin' || kullanici.rol === 'yardimci';
}

function kullanicininIlIdleri(kullaniciId) {
    return db
        .prepare('SELECT il_id FROM kullanici_iller WHERE kullanici_id = ?')
        .all(kullaniciId)
        .map((r) => Number(r.il_id));
}

function ilYetkisiVarMi(kullanici, ilId) {
    if (tumUploadlariGorebilirMi(kullanici)) return true;
    return kullanicininIlIdleri(kullanici.id).includes(Number(ilId));
}

function ilceYetkisiVarMi(kullanici, ilceId) {
    const ilce = db.prepare('SELECT il_id FROM ilceler WHERE id = ?').get(ilceId);
    return !!ilce && ilYetkisiVarMi(kullanici, ilce.il_id);
}

function profilFotografiGorulebilirMi(entityId) {
    return !!db.prepare('SELECT 1 FROM kullanicilar WHERE id = ?').get(entityId);
}

function uploadKaydindakiEntityYetkisiVarMi(kullanici, kayit) {
    const entityType = String(kayit.entity_type || '').toLowerCase();
    const entityId = Number(kayit.entity_id);
    if (!entityType || !Number.isInteger(entityId) || entityId <= 0) return false;

    if (entityType === 'il') return ilYetkisiVarMi(kullanici, entityId);
    if (entityType === 'ilce') return ilceYetkisiVarMi(kullanici, entityId);
    if (entityType === 'profil' || entityType === 'kullanici' || entityType === 'user') {
        return profilFotografiGorulebilirMi(entityId);
    }

    return false;
}

function uploadReferansParametreleri(dosyaAdi) {
    return [dosyaAdi, '/uploads/' + dosyaAdi, '%/uploads/' + dosyaAdi];
}

function uploadReferansKosulu(kolon) {
    return `${kolon} = ? OR ${kolon} = ? OR ${kolon} LIKE ?`;
}

function uploadReferanslarindanYetkiVarMi(kullanici, dosyaAdi) {
    const ilParametreleri = uploadReferansParametreleri(dosyaAdi);
    const iller = db
        .prepare(`SELECT id FROM iller WHERE ${uploadReferansKosulu('baskan_foto')}`)
        .all(...ilParametreleri);
    if (iller.some((il) => ilYetkisiVarMi(kullanici, il.id))) return true;

    const ilceler = db
        .prepare(`SELECT id, il_id FROM ilceler WHERE ${uploadReferansKosulu('baskan_foto')}`)
        .all(...uploadReferansParametreleri(dosyaAdi));
    if (ilceler.some((ilce) => ilYetkisiVarMi(kullanici, ilce.il_id))) return true;

    const profil = db
        .prepare(`SELECT id FROM kullanicilar WHERE ${uploadReferansKosulu('profil_foto')} LIMIT 1`)
        .get(...uploadReferansParametreleri(dosyaAdi));
    return !!profil;
}

function uploadGoruntulemeYetkisiVarMi(kullanici, dosyaAdi) {
    if (tumUploadlariGorebilirMi(kullanici)) return true;

    const kayit = uploadMetadataKaydiAl(dosyaAdi);
    if (kayit) {
        if (Number(kayit.owner_user_id) === Number(kullanici.id)) return true;
        if (uploadKaydindakiEntityYetkisiVarMi(kullanici, kayit)) return true;
    }

    return uploadReferanslarindanYetkiVarMi(kullanici, dosyaAdi);
}

function uploadKotalariniKontrolEt(kullaniciId, yeniDosyaBoyutu) {
    const sema = uploadMetadataSemasiAl();
    if (!sema) return null;

    if (GUNLUK_UPLOAD_LIMITI > 0 && sema.tarihKolonu) {
        const gunluk = db
            .prepare(
                `
                SELECT COUNT(*) AS toplam
                FROM ${sqlKimlik(sema.tablo)}
                WHERE ${sqlKimlik(sema.sahipKolonu)} = ?
                  AND ${sqlKimlik(sema.tarihKolonu)} >= datetime('now', 'start of day')
            `
            )
            .get(kullaniciId);

        if ((Number(gunluk && gunluk.toplam) || 0) >= GUNLUK_UPLOAD_LIMITI) {
            return {
                durum: 429,
                hata: 'Günlük yükleme limitine ulaşıldı.'
            };
        }
    }

    if (TOPLAM_UPLOAD_BYTE_KOTASI > 0) {
        const toplam = db
            .prepare(
                `
                SELECT COALESCE(SUM(${sqlKimlik(sema.boyutKolonu)}), 0) AS toplam
                FROM ${sqlKimlik(sema.tablo)}
                WHERE ${sqlKimlik(sema.sahipKolonu)} = ?
            `
            )
            .get(kullaniciId);

        if ((Number(toplam && toplam.toplam) || 0) + yeniDosyaBoyutu > TOPLAM_UPLOAD_BYTE_KOTASI) {
            return {
                durum: 413,
                hata: 'Toplam yükleme kotası aşıldı.'
            };
        }
    }

    return null;
}

router.get('/:dosyaAdi', tokenDogrula, (req, res) => {
    const dosyaAdi = String(req.params.dosyaAdi || '');
    if (!DOSYA_ADI_PATTERN.test(dosyaAdi)) {
        return res.status(404).json({ hata: 'Dosya bulunamadı.' });
    }
    const tamYol = dosyaYoluBul(dosyaAdi);
    if (!tamYol) return res.status(404).json({ hata: 'Dosya bulunamadı.' });
    if (!uploadGoruntulemeYetkisiVarMi(req.kullanici, dosyaAdi)) {
        return res.status(403).json({ hata: 'Bu dosyaya erişim yetkiniz yok.' });
    }
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

        const kotaHatasi = uploadKotalariniKontrolEt(req.kullanici.id, buffer.length);
        if (kotaHatasi) {
            return res.status(kotaHatasi.durum).json({ hata: kotaHatasi.hata });
        }

        const dosyaAdi = crypto.randomBytes(12).toString('hex') + uzanti;
        const dosyaYolu = path.join(uploadDir, dosyaAdi);
        await fsp.mkdir(uploadDir, { recursive: true });
        await fsp.writeFile(dosyaYolu, buffer, { flag: 'wx' });

        try {
            uploadMetadataKaydet(dosyaAdi, req.kullanici.id, tespit.mime, buffer.length);
        } catch (err) {
            await fsp.unlink(dosyaYolu).catch(() => {});
            throw err;
        }

        res.json({ mesaj: 'Yüklendi.', url: '/uploads/' + dosyaAdi });
    } catch (e) {
        console.error('Yükleme hatası:', e.message);
        res.status(500).json({ hata: 'Dosya yüklenemedi.' });
    }
});

module.exports = router;
