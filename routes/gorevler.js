const express = require('express');
const db = require('../database/db');
const { tokenDogrula, adminVeyaYardimci } = require('../middleware/auth');
const router = express.Router();

// Yardimci: bildirim olustur
function bildirimOlustur(kullanici_id, tip, baslik, icerik, link) {
    try {
        db.prepare('INSERT INTO bildirimler (kullanici_id, tip, baslik, icerik, link) VALUES (?, ?, ?, ?, ?)')
            .run(kullanici_id, tip, baslik, icerik || null, link || null);
    } catch(e) { console.log('Bildirim hatasi:', e.message); }
}

router.get('/', tokenDogrula, (req, res) => {
    if (req.kullanici.rol === 'admin' || req.kullanici.rol === 'yardimci') {
        const g = db.prepare(`SELECT g.*, k.kullanici_adi, k.ad_soyad,
            o.kullanici_adi AS olusturan_adi, o.ad_soyad AS olusturan_ad_soyad
            FROM gorevler g
            JOIN kullanicilar k ON g.kullanici_id=k.id
            LEFT JOIN kullanicilar o ON g.olusturan_id=o.id
            ORDER BY
                CASE g.durum WHEN 'bekliyor' THEN 0 ELSE 1 END,
                CASE g.oncelik WHEN 'acil' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                g.son_tarih IS NULL,
                g.son_tarih ASC,
                g.id DESC`).all();
        return res.json(g);
    }
    const g = db.prepare(`SELECT g.*, o.kullanici_adi AS olusturan_adi, o.ad_soyad AS olusturan_ad_soyad
        FROM gorevler g
        LEFT JOIN kullanicilar o ON g.olusturan_id=o.id
        WHERE g.kullanici_id = ?
        ORDER BY
            CASE g.durum WHEN 'bekliyor' THEN 0 ELSE 1 END,
            CASE g.oncelik WHEN 'acil' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
            g.son_tarih IS NULL,
            g.son_tarih ASC,
            g.id DESC`).all(req.kullanici.id);
    res.json(g);
});

router.post('/', tokenDogrula, adminVeyaYardimci, (req, res) => {
    const { kullanici_id, baslik, aciklama, oncelik, kategori, son_tarih, tekrar } = req.body;
    if (!kullanici_id || !baslik) return res.status(400).json({ hata: 'Kullanıcı ve başlık gereklidir.' });
    const hedef = db.prepare('SELECT id FROM kullanicilar WHERE id = ?').get(kullanici_id);
    if (!hedef) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });

    const oncelikDeg = ['dusuk','normal','acil'].includes(oncelik) ? oncelik : 'normal';
    const tekrarDeg = ['tek','haftalik','aylik'].includes(tekrar) ? tekrar : 'tek';
    const kategoriDeg = kategori || 'diger';
    const sonTarihDeg = son_tarih || null;

    const sonuc = db.prepare(`INSERT INTO gorevler
        (kullanici_id, baslik, aciklama, oncelik, kategori, son_tarih, tekrar, olusturan_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(kullanici_id, baslik, aciklama || null, oncelikDeg, kategoriDeg, sonTarihDeg, tekrarDeg, req.kullanici.id);

    // Bildirim olustur
    const olusturan = db.prepare('SELECT ad_soyad, kullanici_adi FROM kullanicilar WHERE id = ?').get(req.kullanici.id);
    const olusturanAd = olusturan?.ad_soyad || olusturan?.kullanici_adi || 'Yönetici';
    let bildirimBaslik = 'Yeni görev: ' + baslik;
    if (oncelikDeg === 'acil') bildirimBaslik = '🚨 ACİL Görev: ' + baslik;
    bildirimOlustur(
        kullanici_id,
        'gorev_yeni',
        bildirimBaslik,
        olusturanAd + ' size yeni bir görev atadı.',
        '/panel.html#gorevler'
    );

    res.status(201).json({ mesaj: 'Görev eklendi.', id: sonuc.lastInsertRowid });
});

router.put('/:id', tokenDogrula, adminVeyaYardimci, (req, res) => {
    const { baslik, aciklama, oncelik, kategori, son_tarih, tekrar } = req.body;
    const g = db.prepare('SELECT * FROM gorevler WHERE id = ?').get(req.params.id);
    if (!g) return res.status(404).json({ hata: 'Görev bulunamadı.' });

    const oncelikDeg = ['dusuk','normal','acil'].includes(oncelik) ? oncelik : g.oncelik;
    const tekrarDeg = ['tek','haftalik','aylik'].includes(tekrar) ? tekrar : g.tekrar;

    db.prepare(`UPDATE gorevler SET
        baslik = COALESCE(?, baslik),
        aciklama = COALESCE(?, aciklama),
        oncelik = ?,
        kategori = COALESCE(?, kategori),
        son_tarih = ?,
        tekrar = ?
        WHERE id = ?`)
        .run(baslik || null, aciklama ?? null, oncelikDeg, kategori || null,
             son_tarih !== undefined ? son_tarih : g.son_tarih,
             tekrarDeg, req.params.id);

    res.json({ mesaj: 'Görev güncellendi.' });
});

router.put('/:id/durum', tokenDogrula, (req, res) => {
    const { durum } = req.body;
    if (!['bekliyor','tamamlandi'].includes(durum)) return res.status(400).json({ hata: 'Geçersiz durum.' });
    const g = db.prepare('SELECT * FROM gorevler WHERE id = ?').get(req.params.id);
    if (!g) return res.status(404).json({ hata: 'Görev bulunamadı.' });
    if (req.kullanici.rol !== 'admin' && req.kullanici.rol !== 'yardimci' && g.kullanici_id !== req.kullanici.id) {
        return res.status(403).json({ hata: 'Yetkiniz yok.' });
    }
    if (g.durum === durum) {
        return res.json({ mesaj: 'Görev zaten bu durumda.' });
    }

    db.prepare('UPDATE gorevler SET durum = ? WHERE id = ?').run(durum, req.params.id);

    // Tamamlandiginda olusturani bilgilendir + tekrarliysa yeni gorev olustur
    if (durum === 'tamamlandi' && g.durum !== 'tamamlandi') {
        if (g.olusturan_id && g.olusturan_id !== req.kullanici.id) {
            const k = db.prepare('SELECT ad_soyad, kullanici_adi FROM kullanicilar WHERE id = ?').get(g.kullanici_id);
            const ad = k?.ad_soyad || k?.kullanici_adi || 'Kullanıcı';
            bildirimOlustur(g.olusturan_id, 'gorev_tamamlandi', 'Görev tamamlandı: ' + g.baslik,
                ad + ' atadığınız görevi tamamladı.', '/panel.html#gorevler');
        }
        // Tekrarliysa yeni gorev olustur
        if (g.tekrar && g.tekrar !== 'tek' && g.son_tarih) {
            const eskiTarih = new Date(g.son_tarih);
            const yeniTarih = new Date(eskiTarih);
            if (g.tekrar === 'haftalik') yeniTarih.setDate(yeniTarih.getDate() + 7);
            else if (g.tekrar === 'aylik') yeniTarih.setMonth(yeniTarih.getMonth() + 1);
            const yeniTarihStr = yeniTarih.toISOString().slice(0, 19).replace('T', ' ');
            const r = db.prepare(`INSERT INTO gorevler (kullanici_id, baslik, aciklama, oncelik, kategori, son_tarih, tekrar, olusturan_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(g.kullanici_id, g.baslik, g.aciklama, g.oncelik, g.kategori, yeniTarihStr, g.tekrar, g.olusturan_id);
            bildirimOlustur(g.kullanici_id, 'gorev_tekrar', '🔁 Tekrarlayan görev: ' + g.baslik,
                'Yeni tekrar oluşturuldu. Son tarih: ' + yeniTarihStr.split(' ')[0], '/panel.html#gorevler');
        }
    }
    res.json({ mesaj: 'Görev güncellendi.' });
});

router.delete('/:id', tokenDogrula, adminVeyaYardimci, (req, res) => {
    db.prepare('DELETE FROM gorevler WHERE id = ?').run(req.params.id);
    res.json({ mesaj: 'Görev silindi.' });
});

module.exports = router;
