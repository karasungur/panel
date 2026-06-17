const express = require('express');
const db = require('../database/db');
const { tokenDogrula } = require('../middleware/auth');
const router = express.Router();

// Yardimci: bildirim olustur
function bildirimOlustur(kullanici_id, tip, baslik, icerik, link) {
    try {
        db.prepare('INSERT INTO bildirimler (kullanici_id, tip, baslik, icerik, link) VALUES (?, ?, ?, ?, ?)')
            .run(kullanici_id, tip, baslik, icerik || null, link || null);
    } catch(e) {}
}

// GET /api/ozel-mesaj/sohbetler -> aktif sohbet listesi (en son mesajla)
router.get('/sohbetler', tokenDogrula, (req, res) => {
    const id = req.kullanici.id;
    // Her sohbet icin: karsi taraf bilgisi, son mesaj, okunmamis sayisi
    const sohbetler = db.prepare(`
        SELECT
            CASE WHEN om.gonderen_id = ? THEN om.alici_id ELSE om.gonderen_id END AS kisi_id,
            k.kullanici_adi, k.ad_soyad, k.renk, k.profil_foto, k.son_giris, k.rol,
            (SELECT metin FROM ozel_mesajlar om2 WHERE
                (om2.gonderen_id = ? AND om2.alici_id = k.id) OR
                (om2.gonderen_id = k.id AND om2.alici_id = ?)
                ORDER BY om2.id DESC LIMIT 1) AS son_mesaj,
            (SELECT tarih FROM ozel_mesajlar om2 WHERE
                (om2.gonderen_id = ? AND om2.alici_id = k.id) OR
                (om2.gonderen_id = k.id AND om2.alici_id = ?)
                ORDER BY om2.id DESC LIMIT 1) AS son_tarih,
            (SELECT COUNT(*) FROM ozel_mesajlar om3 WHERE om3.gonderen_id = k.id AND om3.alici_id = ? AND om3.okundu = 0) AS okunmamis
        FROM ozel_mesajlar om
        JOIN kullanicilar k ON k.id = CASE WHEN om.gonderen_id = ? THEN om.alici_id ELSE om.gonderen_id END
        WHERE om.gonderen_id = ? OR om.alici_id = ?
        GROUP BY kisi_id
        ORDER BY son_tarih DESC
    `).all(id, id, id, id, id, id, id, id, id);
    res.json(sohbetler);
});

// GET /api/ozel-mesaj/kullanicilar -> tum kullanicilar (yeni sohbet baslatmak icin)
router.get('/kullanicilar', tokenDogrula, (req, res) => {
    const kullanicilar = db.prepare(`
        SELECT id, kullanici_adi, ad_soyad, renk, profil_foto, son_giris, rol
        FROM kullanicilar
        WHERE id != ?
        ORDER BY
            CASE WHEN son_giris IS NOT NULL AND son_giris > datetime('now', '-5 minutes') THEN 0 ELSE 1 END,
            son_giris DESC,
            kullanici_adi
    `).all(req.kullanici.id);
    res.json(kullanicilar);
});

// GET /api/ozel-mesaj/:id -> belirli kisinin mesajlari
router.get('/:id', tokenDogrula, (req, res) => {
    const benId = req.kullanici.id;
    const kisiId = parseInt(req.params.id);
    const mesajlar = db.prepare(`
        SELECT om.*, k.ad_soyad AS gonderen_ad_soyad, k.kullanici_adi AS gonderen_kullanici_adi, k.renk AS gonderen_renk, k.profil_foto AS gonderen_foto
        FROM ozel_mesajlar om
        JOIN kullanicilar k ON om.gonderen_id = k.id
        WHERE (om.gonderen_id = ? AND om.alici_id = ?) OR (om.gonderen_id = ? AND om.alici_id = ?)
        ORDER BY om.id ASC
        LIMIT 200
    `).all(benId, kisiId, kisiId, benId);

    // Karsi tarafin gonderdiklerini okundu yap
    db.prepare('UPDATE ozel_mesajlar SET okundu = 1 WHERE gonderen_id = ? AND alici_id = ?').run(kisiId, benId);

    res.json(mesajlar);
});

// POST /api/ozel-mesaj -> yeni mesaj gonder
router.post('/', tokenDogrula, (req, res) => {
    const { alici_id, metin } = req.body;
    if (!alici_id || !metin || !metin.trim()) return res.status(400).json({ hata: 'Alici ve mesaj gereklidir.' });
    if (parseInt(alici_id) === req.kullanici.id) return res.status(400).json({ hata: 'Kendinize mesaj gönderemezsiniz.' });

    const sonuc = db.prepare('INSERT INTO ozel_mesajlar (gonderen_id, alici_id, metin) VALUES (?, ?, ?)')
        .run(req.kullanici.id, parseInt(alici_id), metin.trim());

    // Bildirim olustur
    const gonderen = db.prepare('SELECT ad_soyad, kullanici_adi FROM kullanicilar WHERE id = ?').get(req.kullanici.id);
    const ad = gonderen?.ad_soyad || gonderen?.kullanici_adi || 'Kullanıcı';
    const onIzleme = metin.trim().substring(0, 60) + (metin.length > 60 ? '...' : '');
    bildirimOlustur(parseInt(alici_id), 'mesaj_yeni', '💬 ' + ad + ' size yazdı', onIzleme, '/panel.html#chat-balon-' + req.kullanici.id);

    // Yaziyor durumunu temizle
    db.prepare('DELETE FROM yaziyor WHERE kullanici_id = ? AND alici_id = ?').run(req.kullanici.id, parseInt(alici_id));

    res.status(201).json({ mesaj: 'Mesaj gönderildi.', id: sonuc.lastInsertRowid });
});

// PUT /api/ozel-mesaj/yaziyor/:alici_id -> ben yaziyor olarak isaretle
router.put('/yaziyor/:alici_id', tokenDogrula, (req, res) => {
    const alici_id = parseInt(req.params.alici_id);
    db.prepare(`INSERT INTO yaziyor (kullanici_id, alici_id, son_zaman) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(kullanici_id, alici_id) DO UPDATE SET son_zaman = CURRENT_TIMESTAMP`)
        .run(req.kullanici.id, alici_id);
    res.json({ ok: true });
});

// GET /api/ozel-mesaj/yaziyor/:kisi_id -> kisi su an bana yaziyor mu?
router.get('/yaziyor/:kisi_id', tokenDogrula, (req, res) => {
    // Son 3 saniye icindeyse yaziyor sayilir
    const sonuc = db.prepare(`SELECT 1 FROM yaziyor WHERE kullanici_id = ? AND alici_id = ?
        AND son_zaman > datetime('now', '-3 seconds')`)
        .get(parseInt(req.params.kisi_id), req.kullanici.id);
    res.json({ yaziyor: !!sonuc });
});

// GET /api/ozel-mesaj/okunmamis/toplam -> tum okunmamis ozel mesaj sayisi
router.get('/okunmamis/toplam', tokenDogrula, (req, res) => {
    const s = db.prepare('SELECT COUNT(*) s FROM ozel_mesajlar WHERE alici_id = ? AND okundu = 0').get(req.kullanici.id).s;
    res.json({ okunmamis: s });
});

// DELETE /api/ozel-mesaj/mesaj/:id -> tek bir mesaj sil (sadece kendi gonderdigimi silebilirim)
router.delete('/mesaj/:id', tokenDogrula, (req, res) => {
    const m = db.prepare('SELECT * FROM ozel_mesajlar WHERE id = ?').get(req.params.id);
    if (!m) return res.status(404).json({ hata: 'Mesaj bulunamadı.' });
    if (m.gonderen_id !== req.kullanici.id && m.alici_id !== req.kullanici.id) {
        return res.status(403).json({ hata: 'Yetkiniz yok.' });
    }
    db.prepare('DELETE FROM ozel_mesajlar WHERE id = ?').run(req.params.id);
    res.json({ mesaj: 'Mesaj silindi.' });
});

// DELETE /api/ozel-mesaj/sohbet/:kisi_id -> tum sohbeti sil (benim icin)
router.delete('/sohbet/:kisi_id', tokenDogrula, (req, res) => {
    const kisiId = parseInt(req.params.kisi_id);
    const benId = req.kullanici.id;
    db.prepare(`DELETE FROM ozel_mesajlar WHERE
        (gonderen_id = ? AND alici_id = ?) OR (gonderen_id = ? AND alici_id = ?)`)
        .run(benId, kisiId, kisiId, benId);
    res.json({ mesaj: 'Sohbet silindi.' });
});

module.exports = router;
