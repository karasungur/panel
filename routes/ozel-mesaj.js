const express = require('express');
const db = require('../database/db');
const { tokenDogrula } = require('../middleware/auth');
const { kullaniciGorunenAd } = require('../utils/phone');
const router = express.Router();

// Yardimci: bildirim olustur
function bildirimOlustur(kullanici_id, tip, baslik, icerik, link) {
    try {
        db.prepare('INSERT INTO bildirimler (kullanici_id, tip, baslik, icerik, link) VALUES (?, ?, ?, ?, ?)').run(
            kullanici_id,
            tip,
            baslik,
            icerik || null,
            link || null
        );
    } catch (_e) {}
}

let ozelMesajKolonlariCache = null;

function ozelMesajKolonlari() {
    if (!ozelMesajKolonlariCache) {
        ozelMesajKolonlariCache = new Set(
            db
                .prepare('PRAGMA table_info(ozel_mesajlar)')
                .all()
                .map((kolon) => kolon.name)
        );
    }
    return ozelMesajKolonlariCache;
}

function ozelMesajSilmeKolonlariVarMi() {
    const kolonlar = ozelMesajKolonlari();
    return kolonlar.has('deleted_for_sender_at') && kolonlar.has('deleted_for_recipient_at');
}

function gorunurMesajKosulu(alias) {
    if (!ozelMesajSilmeKolonlariVarMi()) return '1 = 1';
    return `NOT ((${alias}.gonderen_id = ? AND ${alias}.deleted_for_sender_at IS NOT NULL)
        OR (${alias}.alici_id = ? AND ${alias}.deleted_for_recipient_at IS NOT NULL))`;
}

function gorunurMesajParamlari(kullaniciId) {
    return ozelMesajSilmeKolonlariVarMi() ? [kullaniciId, kullaniciId] : [];
}

function aliciIcinGorunurMesajKosulu(alias) {
    return ozelMesajSilmeKolonlariVarMi() ? `${alias}.deleted_for_recipient_at IS NULL` : '1 = 1';
}

function mesajSilmeDesteklenmiyor(res) {
    return res.status(409).json({ hata: 'Mesaj silme bu veritabanı şemasında desteklenmiyor.' });
}

// GET /api/ozel-mesaj/sohbetler -> aktif sohbet listesi (en son mesajla)
router.get('/sohbetler', tokenDogrula, (req, res) => {
    const id = req.kullanici.id;
    const gorunurKosul = gorunurMesajKosulu('om');
    const okunmamisKosul = aliciIcinGorunurMesajKosulu('om3');

    // Her sohbet icin: karsi taraf bilgisi, son gorunur mesaj, gorunur okunmamis sayisi
    const sohbetler = db
        .prepare(
            `
        WITH gorunur AS (
            SELECT
                om.*,
                CASE WHEN om.gonderen_id = ? THEN om.alici_id ELSE om.gonderen_id END AS kisi_id
            FROM ozel_mesajlar om
            WHERE (om.gonderen_id = ? OR om.alici_id = ?)
              AND ${gorunurKosul}
        ),
        son_mesajlar AS (
            SELECT *
            FROM (
                SELECT gorunur.*, ROW_NUMBER() OVER (PARTITION BY kisi_id ORDER BY id DESC) AS sira
                FROM gorunur
            )
            WHERE sira = 1
        ),
        okunmamislar AS (
            SELECT om3.gonderen_id AS kisi_id, COUNT(*) AS okunmamis
            FROM ozel_mesajlar om3
            WHERE om3.alici_id = ? AND om3.okundu = 0 AND ${okunmamisKosul}
            GROUP BY om3.gonderen_id
        )
        SELECT
            sm.kisi_id,
            k.telefon, k.ad_soyad, k.renk, k.profil_foto, k.son_giris, k.rol,
            sm.metin AS son_mesaj,
            sm.tarih AS son_tarih,
            COALESCE(o.okunmamis, 0) AS okunmamis
        FROM son_mesajlar sm
        JOIN kullanicilar k ON k.id = sm.kisi_id
        LEFT JOIN okunmamislar o ON o.kisi_id = sm.kisi_id
        ORDER BY sm.tarih DESC, sm.id DESC
    `
        )
        .all(id, id, id, ...gorunurMesajParamlari(id), id);
    res.json(sohbetler);
});

// GET /api/ozel-mesaj/kullanicilar -> tum kullanicilar (yeni sohbet baslatmak icin)
router.get('/kullanicilar', tokenDogrula, (req, res) => {
    const kullanicilar = db
        .prepare(
            `
        SELECT id, telefon, ad_soyad, renk, profil_foto, son_giris, rol
        FROM kullanicilar
        WHERE id != ?
        ORDER BY
            CASE WHEN son_giris IS NOT NULL AND son_giris > datetime('now', '-5 minutes') THEN 0 ELSE 1 END,
            son_giris DESC,
            ad_soyad,
            telefon
    `
        )
        .all(req.kullanici.id);
    res.json(kullanicilar);
});

// GET /api/ozel-mesaj/:id -> belirli kisinin mesajlari
router.get('/:id', tokenDogrula, (req, res) => {
    const benId = req.kullanici.id;
    const kisiId = parseInt(req.params.id, 10);
    if (!Number.isInteger(kisiId) || kisiId <= 0) return res.status(400).json({ hata: 'Geçersiz kullanıcı.' });

    const gorunurKosul = gorunurMesajKosulu('om');
    const mesajlar = db
        .prepare(
            `
        SELECT *
        FROM (
            SELECT om.*, k.ad_soyad AS gonderen_ad_soyad, k.telefon AS gonderen_telefon,
                k.renk AS gonderen_renk, k.profil_foto AS gonderen_foto
            FROM ozel_mesajlar om
            JOIN kullanicilar k ON om.gonderen_id = k.id
            WHERE ((om.gonderen_id = ? AND om.alici_id = ?) OR (om.gonderen_id = ? AND om.alici_id = ?))
              AND ${gorunurKosul}
            ORDER BY om.id DESC
            LIMIT 200
        ) son_mesajlar
        ORDER BY son_mesajlar.id ASC
    `
        )
        .all(benId, kisiId, kisiId, benId, ...gorunurMesajParamlari(benId));

    // Karsi tarafin gonderdiklerini okundu yap
    db.prepare(
        `UPDATE ozel_mesajlar SET okundu = 1
        WHERE gonderen_id = ? AND alici_id = ? AND ${aliciIcinGorunurMesajKosulu('ozel_mesajlar')}`
    ).run(kisiId, benId);

    res.json(mesajlar);
});

// POST /api/ozel-mesaj -> yeni mesaj gonder
router.post('/', tokenDogrula, (req, res) => {
    const { alici_id, metin } = req.body;
    if (!alici_id || !metin || !metin.trim()) return res.status(400).json({ hata: 'Alici ve mesaj gereklidir.' });
    if (parseInt(alici_id) === req.kullanici.id)
        return res.status(400).json({ hata: 'Kendinize mesaj gönderemezsiniz.' });

    const sonuc = db
        .prepare('INSERT INTO ozel_mesajlar (gonderen_id, alici_id, metin) VALUES (?, ?, ?)')
        .run(req.kullanici.id, parseInt(alici_id), metin.trim());

    // Bildirim olustur
    const gonderen = db.prepare('SELECT ad_soyad, telefon FROM kullanicilar WHERE id = ?').get(req.kullanici.id);
    const ad = kullaniciGorunenAd(gonderen);
    const onIzleme = metin.trim().substring(0, 60) + (metin.length > 60 ? '...' : '');
    bildirimOlustur(
        parseInt(alici_id),
        'mesaj_yeni',
        '💬 ' + ad + ' size yazdı',
        onIzleme,
        '/panel/chat#chat-balon-' + req.kullanici.id
    );

    // Yaziyor durumunu temizle
    db.prepare('DELETE FROM yaziyor WHERE kullanici_id = ? AND alici_id = ?').run(req.kullanici.id, parseInt(alici_id));

    res.status(201).json({ mesaj: 'Mesaj gönderildi.', id: sonuc.lastInsertRowid });
});

// PUT /api/ozel-mesaj/yaziyor/:alici_id -> ben yaziyor olarak isaretle
router.put('/yaziyor/:alici_id', tokenDogrula, (req, res) => {
    const alici_id = parseInt(req.params.alici_id);
    db.prepare(
        `INSERT INTO yaziyor (kullanici_id, alici_id, son_zaman) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(kullanici_id, alici_id) DO UPDATE SET son_zaman = CURRENT_TIMESTAMP`
    ).run(req.kullanici.id, alici_id);
    res.json({ ok: true });
});

// GET /api/ozel-mesaj/yaziyor/:kisi_id -> kisi su an bana yaziyor mu?
router.get('/yaziyor/:kisi_id', tokenDogrula, (req, res) => {
    // Son 3 saniye icindeyse yaziyor sayilir
    const sonuc = db
        .prepare(
            `SELECT 1 FROM yaziyor WHERE kullanici_id = ? AND alici_id = ?
        AND son_zaman > datetime('now', '-3 seconds')`
        )
        .get(parseInt(req.params.kisi_id), req.kullanici.id);
    res.json({ yaziyor: !!sonuc });
});

// GET /api/ozel-mesaj/okunmamis/toplam -> tum okunmamis ozel mesaj sayisi
router.get('/okunmamis/toplam', tokenDogrula, (req, res) => {
    const s = db
        .prepare(
            `SELECT COUNT(*) s FROM ozel_mesajlar
            WHERE alici_id = ? AND okundu = 0 AND ${aliciIcinGorunurMesajKosulu('ozel_mesajlar')}`
        )
        .get(req.kullanici.id).s;
    res.json({ okunmamis: s });
});

// DELETE /api/ozel-mesaj/mesaj/:id -> tek bir mesaji sadece benim icin gizle
router.delete('/mesaj/:id', tokenDogrula, (req, res) => {
    const m = db.prepare('SELECT * FROM ozel_mesajlar WHERE id = ?').get(req.params.id);
    if (!m) return res.status(404).json({ hata: 'Mesaj bulunamadı.' });
    if (m.gonderen_id !== req.kullanici.id && m.alici_id !== req.kullanici.id) {
        return res.status(403).json({ hata: 'Yetkiniz yok.' });
    }
    if (!ozelMesajSilmeKolonlariVarMi()) return mesajSilmeDesteklenmiyor(res);

    const silmeKolonu = m.gonderen_id === req.kullanici.id ? 'deleted_for_sender_at' : 'deleted_for_recipient_at';
    db.prepare(
        `UPDATE ozel_mesajlar SET ${silmeKolonu} = COALESCE(${silmeKolonu}, CURRENT_TIMESTAMP) WHERE id = ?`
    ).run(req.params.id);
    res.json({ mesaj: 'Mesaj sizin için silindi.' });
});

// DELETE /api/ozel-mesaj/sohbet/:kisi_id -> tum sohbeti sil (benim icin)
router.delete('/sohbet/:kisi_id', tokenDogrula, (req, res) => {
    const kisiId = parseInt(req.params.kisi_id, 10);
    if (!Number.isInteger(kisiId) || kisiId <= 0) return res.status(400).json({ hata: 'Geçersiz kullanıcı.' });
    const benId = req.kullanici.id;
    if (!ozelMesajSilmeKolonlariVarMi()) return mesajSilmeDesteklenmiyor(res);

    db.withTransaction(() => {
        db.prepare(
            `UPDATE ozel_mesajlar
            SET deleted_for_sender_at = COALESCE(deleted_for_sender_at, CURRENT_TIMESTAMP)
            WHERE gonderen_id = ? AND alici_id = ? AND deleted_for_sender_at IS NULL`
        ).run(benId, kisiId);
        db.prepare(
            `UPDATE ozel_mesajlar
            SET deleted_for_recipient_at = COALESCE(deleted_for_recipient_at, CURRENT_TIMESTAMP)
            WHERE gonderen_id = ? AND alici_id = ? AND deleted_for_recipient_at IS NULL`
        ).run(kisiId, benId);
    });
    res.json({ mesaj: 'Sohbet sizin için silindi.' });
});

module.exports = router;
