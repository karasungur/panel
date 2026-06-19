const express = require('express');
const db = require('../database/db');
const { tokenDogrula } = require('../middleware/auth');
const { kayitFormatla } = require('../middleware/format');
const { uploadMetadataIliskilendir } = require('../utils/upload-metadata');
const router = express.Router();

function kullanicininIlleri(kullaniciId) {
    return db
        .prepare('SELECT il_id FROM kullanici_iller WHERE kullanici_id = ?')
        .all(kullaniciId)
        .map((r) => r.il_id);
}

function ileErisebilir(req, il_id) {
    if (req.kullanici.rol === 'admin' || req.kullanici.rol === 'yardimci') return true;
    return kullanicininIlleri(req.kullanici.id).includes(il_id);
}

// GET /api/ilceler?il_id=X
router.get('/', tokenDogrula, (req, res) => {
    const il_id = parseInt(String(req.query.il_id || ''), 10);
    if (!il_id) return res.status(400).json({ hata: 'il_id parametresi gereklidir.' });
    if (!ileErisebilir(req, il_id)) {
        return res.status(403).json({ hata: 'Bu ile erişim yetkiniz yok.' });
    }
    const ilceler = db.prepare('SELECT * FROM ilceler WHERE il_id = ? ORDER BY ilce_adi').all(il_id);
    res.json(ilceler);
});

// POST /api/ilceler -> yeni ilce ekle (admin veya o ilin sorumlusu)
router.post('/', tokenDogrula, (req, res) => {
    const { il_id, ilce_adi } = req.body;
    if (!il_id || !ilce_adi) return res.status(400).json({ hata: 'il_id ve ilce_adi gereklidir.' });
    if (!ileErisebilir(req, parseInt(il_id))) {
        return res.status(403).json({ hata: 'Bu ile erişim yetkiniz yok.' });
    }
    try {
        const sonuc = db.prepare('INSERT INTO ilceler (il_id, ilce_adi) VALUES (?, ?)').run(il_id, ilce_adi);
        res.status(201).json({ mesaj: 'İlçe eklendi.', id: sonuc.lastInsertRowid });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ hata: 'Bu ilçe bu il altında zaten kayıtlı.' });
        }
        res.status(500).json({ hata: 'Sunucu hatası.', detay: err.message });
    }
});

// PUT /api/ilceler/:id -> ilce guncelle (admin veya o ilin sorumlusu)
router.put('/:id', tokenDogrula, (req, res) => {
    const ilce = db.prepare('SELECT * FROM ilceler WHERE id = ?').get(parseInt(req.params.id));
    if (!ilce) return res.status(404).json({ hata: 'İlçe bulunamadı.' });
    if (!ileErisebilir(req, ilce.il_id)) {
        return res.status(403).json({ hata: 'Bu ilçeye erişim yetkiniz yok.' });
    }
    const {
        ilce_adi,
        baskan_ad_soyad,
        baskan_telefon,
        baskan_tc,
        baskan_foto,
        instagram_url,
        twitter_url,
        facebook_url,
        tiktok_url
    } = req.body;

    // Formatla
    const f = kayitFormatla({ baskan_ad_soyad, baskan_telefon, instagram_url, twitter_url, facebook_url, tiktok_url });

    try {
        db.withTransaction(() => {
            db.prepare(
                `
            UPDATE ilceler SET
                ilce_adi        = COALESCE(?, ilce_adi),
                baskan_ad_soyad = COALESCE(?, baskan_ad_soyad),
                baskan_telefon  = COALESCE(?, baskan_telefon),
                baskan_tc       = COALESCE(?, baskan_tc),
                baskan_foto     = COALESCE(?, baskan_foto),
                instagram_url   = COALESCE(?, instagram_url),
                twitter_url     = COALESCE(?, twitter_url),
                facebook_url    = COALESCE(?, facebook_url),
                tiktok_url      = COALESCE(?, tiktok_url)
            WHERE id = ?
        `
            ).run(
                ilce_adi ?? null,
                f.baskan_ad_soyad ?? null,
                f.baskan_telefon ?? null,
                baskan_tc ?? null,
                baskan_foto ?? null,
                f.instagram_url ?? null,
                f.twitter_url ?? null,
                f.facebook_url ?? null,
                f.tiktok_url ?? null,
                parseInt(req.params.id)
            );
            if (baskan_foto) {
                uploadMetadataIliskilendir(baskan_foto, {
                    scope: 'entity',
                    entityType: 'ilce',
                    entityId: parseInt(req.params.id)
                });
            }
        });
        res.json({ mesaj: 'İlçe güncellendi.' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ hata: 'Bu ilçe adı bu il altında zaten kullanılıyor.' });
        }
        res.status(500).json({ hata: 'Sunucu hatası.', detay: err.message });
    }
});

// DELETE /api/ilceler/:id -> ilce sil (admin veya o ilin sorumlusu)
router.delete('/:id', tokenDogrula, (req, res) => {
    const ilce = db.prepare('SELECT * FROM ilceler WHERE id = ?').get(parseInt(req.params.id));
    if (!ilce) return res.status(404).json({ hata: 'İlçe bulunamadı.' });
    if (!ileErisebilir(req, ilce.il_id)) {
        return res.status(403).json({ hata: 'Bu ilçeye erişim yetkiniz yok.' });
    }
    db.prepare('DELETE FROM ilceler WHERE id = ?').run(parseInt(req.params.id));
    res.json({ mesaj: 'İlçe silindi.' });
});

// POST /api/ilceler/toplu -> bir il icin tum ilcelerin baskan bilgilerini toplu kaydet
// Body: { il_id, satirlar: [{ id?, ilce_adi, baskan_ad_soyad, baskan_telefon, ... }, ...] }
// id varsa guncelle, yoksa yeni ilce ekle
router.post('/toplu', tokenDogrula, (req, res) => {
    const { il_id, satirlar } = req.body;
    if (!il_id || !Array.isArray(satirlar)) return res.status(400).json({ hata: 'il_id ve satirlar gereklidir.' });
    if (!ileErisebilir(req, parseInt(il_id))) return res.status(403).json({ hata: 'Bu ile erişim yetkiniz yok.' });

    const guncelle = db.prepare(`UPDATE ilceler SET
        baskan_ad_soyad = ?, baskan_telefon = ?, baskan_tc = ?, baskan_foto = ?,
        instagram_url = ?, twitter_url = ?, facebook_url = ?, tiktok_url = ?
        WHERE id = ? AND il_id = ?`);
    const ekle =
        db.prepare(`INSERT INTO ilceler (il_id, ilce_adi, baskan_ad_soyad, baskan_telefon, baskan_tc, baskan_foto, instagram_url, twitter_url, facebook_url, tiktok_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    let guncellenen = 0,
        eklenen = 0,
        hata = 0;
    db.withTransaction(() => {
        for (const s of satirlar) {
            try {
                const f = kayitFormatla(s);
                if (s.id) {
                    const sonuc = guncelle.run(
                        f.baskan_ad_soyad || null,
                        f.baskan_telefon || null,
                        s.baskan_tc || null,
                        s.baskan_foto || null,
                        f.instagram_url || null,
                        f.twitter_url || null,
                        f.facebook_url || null,
                        f.tiktok_url || null,
                        parseInt(s.id),
                        parseInt(il_id)
                    );
                    if (sonuc.changes > 0) {
                        if (s.baskan_foto) {
                            uploadMetadataIliskilendir(s.baskan_foto, {
                                scope: 'entity',
                                entityType: 'ilce',
                                entityId: parseInt(s.id)
                            });
                        }
                        guncellenen++;
                    }
                } else if (s.ilce_adi && s.ilce_adi.trim()) {
                    const sonuc = ekle.run(
                        parseInt(il_id),
                        s.ilce_adi.trim(),
                        f.baskan_ad_soyad || null,
                        f.baskan_telefon || null,
                        s.baskan_tc || null,
                        s.baskan_foto || null,
                        f.instagram_url || null,
                        f.twitter_url || null,
                        f.facebook_url || null,
                        f.tiktok_url || null
                    );
                    if (s.baskan_foto) {
                        uploadMetadataIliskilendir(s.baskan_foto, {
                            scope: 'entity',
                            entityType: 'ilce',
                            entityId: sonuc.lastInsertRowid
                        });
                    }
                    eklenen++;
                }
            } catch (_e) {
                hata++;
            }
        }
    });
    res.json({ mesaj: 'Toplu güncelleme tamamlandı.', guncellenen, eklenen, hata });
});

module.exports = router;
