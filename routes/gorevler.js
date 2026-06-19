const express = require('express');
const db = require('../database/db');
const { tokenDogrula, adminVeyaYardimci } = require('../middleware/auth');
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
    } catch (e) {
        console.log('Bildirim hatasi:', e.message);
    }
}

let gorevKolonlariCache = null;

function gorevKolonlari() {
    if (!gorevKolonlariCache) {
        gorevKolonlariCache = new Set(
            db
                .prepare('PRAGMA table_info(gorevler)')
                .all()
                .map((kolon) => kolon.name)
        );
    }
    return gorevKolonlariCache;
}

function gorevKolonuVarMi(kolon) {
    return gorevKolonlari().has(kolon);
}

function sonrakiTekrarTarihi(gorev) {
    const eskiTarih = new Date(String(gorev.son_tarih));
    if (Number.isNaN(eskiTarih.getTime())) return null;

    const yeniTarih = new Date(eskiTarih);
    if (gorev.tekrar === 'haftalik') yeniTarih.setDate(yeniTarih.getDate() + 7);
    else if (gorev.tekrar === 'aylik') yeniTarih.setMonth(yeniTarih.getMonth() + 1);
    else return null;

    return yeniTarih.toISOString().slice(0, 19).replace('T', ' ');
}

function benzerTekrarliGorevVarMi(gorev, yeniTarihStr, sadeceEskiKayitlar) {
    const eskiKayitKosulu = sadeceEskiKayitlar ? 'AND (parent_task_id IS NULL OR occurrence_due_at IS NULL)' : '';
    const mevcut = db
        .prepare(
            `SELECT id FROM gorevler
            WHERE kullanici_id = ? AND baslik = ? AND son_tarih = ? AND tekrar = ?
              AND COALESCE(olusturan_id, 0) = COALESCE(?, 0)
              ${eskiKayitKosulu}
            LIMIT 1`
        )
        .get(gorev.kullanici_id, gorev.baslik, yeniTarihStr, gorev.tekrar, gorev.olusturan_id);

    return !!mevcut;
}

function tekrarliGorevOlustur(gorev, yeniTarihStr) {
    const parentAlanlariVar = gorevKolonuVarMi('parent_task_id') && gorevKolonuVarMi('occurrence_due_at');
    const parentTaskId = parentAlanlariVar ? Number(gorev.parent_task_id || gorev.id) : null;

    if (parentAlanlariVar) {
        const mevcut = db
            .prepare('SELECT id FROM gorevler WHERE parent_task_id = ? AND occurrence_due_at = ? LIMIT 1')
            .get(parentTaskId, yeniTarihStr);
        if (mevcut) return null;
        if (benzerTekrarliGorevVarMi(gorev, yeniTarihStr, true)) return null;
    } else {
        if (benzerTekrarliGorevVarMi(gorev, yeniTarihStr, false)) return null;
    }

    const kolonlar = [
        'kullanici_id',
        'baslik',
        'aciklama',
        'oncelik',
        'kategori',
        'son_tarih',
        'tekrar',
        'olusturan_id'
    ];
    const degerler = [
        gorev.kullanici_id,
        gorev.baslik,
        gorev.aciklama,
        gorev.oncelik,
        gorev.kategori,
        yeniTarihStr,
        gorev.tekrar,
        gorev.olusturan_id
    ];

    if (parentAlanlariVar) {
        kolonlar.push('parent_task_id', 'occurrence_due_at');
        degerler.push(parentTaskId, yeniTarihStr);
    }

    const yerTutucular = kolonlar.map(() => '?').join(', ');
    const sonuc = db
        .prepare(`INSERT OR IGNORE INTO gorevler (${kolonlar.join(', ')}) VALUES (${yerTutucular})`)
        .run(...degerler);

    return sonuc.changes > 0 ? sonuc.lastInsertRowid : null;
}

router.get('/', tokenDogrula, (req, res) => {
    if (req.kullanici.rol === 'admin' || req.kullanici.rol === 'yardimci') {
        const g = db
            .prepare(
                `SELECT g.*, k.telefon, k.ad_soyad,
            o.telefon AS olusturan_telefon, o.ad_soyad AS olusturan_ad_soyad
            FROM gorevler g
            JOIN kullanicilar k ON g.kullanici_id=k.id
            LEFT JOIN kullanicilar o ON g.olusturan_id=o.id
            ORDER BY
                CASE g.durum WHEN 'bekliyor' THEN 0 ELSE 1 END,
                CASE g.oncelik WHEN 'acil' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                g.son_tarih IS NULL,
                g.son_tarih ASC,
                g.id DESC`
            )
            .all();
        return res.json(g);
    }
    const g = db
        .prepare(
            `SELECT g.*, o.telefon AS olusturan_telefon, o.ad_soyad AS olusturan_ad_soyad
        FROM gorevler g
        LEFT JOIN kullanicilar o ON g.olusturan_id=o.id
        WHERE g.kullanici_id = ?
        ORDER BY
            CASE g.durum WHEN 'bekliyor' THEN 0 ELSE 1 END,
            CASE g.oncelik WHEN 'acil' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
            g.son_tarih IS NULL,
            g.son_tarih ASC,
            g.id DESC`
        )
        .all(req.kullanici.id);
    res.json(g);
});

router.post('/', tokenDogrula, adminVeyaYardimci, (req, res) => {
    const { kullanici_id, baslik, aciklama, oncelik, kategori, son_tarih, tekrar } = req.body;
    if (!kullanici_id || !baslik) return res.status(400).json({ hata: 'Kullanıcı ve başlık gereklidir.' });
    const hedef = db.prepare('SELECT id FROM kullanicilar WHERE id = ?').get(kullanici_id);
    if (!hedef) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });

    const oncelikDeg = ['dusuk', 'normal', 'acil'].includes(oncelik) ? oncelik : 'normal';
    const tekrarDeg = ['tek', 'haftalik', 'aylik'].includes(tekrar) ? tekrar : 'tek';
    const kategoriDeg = kategori || 'diger';
    const sonTarihDeg = son_tarih || null;

    const sonuc = db
        .prepare(
            `INSERT INTO gorevler
        (kullanici_id, baslik, aciklama, oncelik, kategori, son_tarih, tekrar, olusturan_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(kullanici_id, baslik, aciklama || null, oncelikDeg, kategoriDeg, sonTarihDeg, tekrarDeg, req.kullanici.id);

    // Bildirim olustur
    const olusturan = db.prepare('SELECT ad_soyad, telefon FROM kullanicilar WHERE id = ?').get(req.kullanici.id);
    const olusturanAd = kullaniciGorunenAd(olusturan, 'Yönetici');
    let bildirimBaslik = 'Yeni görev: ' + baslik;
    if (oncelikDeg === 'acil') bildirimBaslik = '🚨 ACİL Görev: ' + baslik;
    bildirimOlustur(
        kullanici_id,
        'gorev_yeni',
        bildirimBaslik,
        olusturanAd + ' size yeni bir görev atadı.',
        '/panel/gorevler'
    );

    res.status(201).json({ mesaj: 'Görev eklendi.', id: sonuc.lastInsertRowid });
});

router.put('/:id', tokenDogrula, adminVeyaYardimci, (req, res) => {
    const { baslik, aciklama, oncelik, kategori, son_tarih, tekrar } = req.body;
    const g = db.prepare('SELECT * FROM gorevler WHERE id = ?').get(req.params.id);
    if (!g) return res.status(404).json({ hata: 'Görev bulunamadı.' });

    const oncelikDeg = ['dusuk', 'normal', 'acil'].includes(oncelik) ? oncelik : g.oncelik;
    const tekrarDeg = ['tek', 'haftalik', 'aylik'].includes(tekrar) ? tekrar : g.tekrar;

    db.prepare(
        `UPDATE gorevler SET
        baslik = COALESCE(?, baslik),
        aciklama = COALESCE(?, aciklama),
        oncelik = ?,
        kategori = COALESCE(?, kategori),
        son_tarih = ?,
        tekrar = ?
        WHERE id = ?`
    ).run(
        baslik || null,
        aciklama ?? null,
        oncelikDeg,
        kategori || null,
        son_tarih !== undefined ? son_tarih : g.son_tarih,
        tekrarDeg,
        req.params.id
    );

    res.json({ mesaj: 'Görev güncellendi.' });
});

router.put('/:id/durum', tokenDogrula, (req, res) => {
    const { durum } = req.body;
    if (!['bekliyor', 'tamamlandi'].includes(durum)) return res.status(400).json({ hata: 'Geçersiz durum.' });
    const g = db.prepare('SELECT * FROM gorevler WHERE id = ?').get(req.params.id);
    if (!g) return res.status(404).json({ hata: 'Görev bulunamadı.' });
    if (req.kullanici.rol !== 'admin' && req.kullanici.rol !== 'yardimci' && g.kullanici_id !== req.kullanici.id) {
        return res.status(403).json({ hata: 'Yetkiniz yok.' });
    }
    if (g.durum === durum) {
        return res.json({ mesaj: 'Görev zaten bu durumda.' });
    }

    let mesaj = 'Görev güncellendi.';
    let gorevKayboldu = false;
    /** @type {{ kullanici_id: number, baslik: string, icerik: string } | null} */
    let tamamlandiBildirimi = null;
    /** @type {{ kullanici_id: number, baslik: string, icerik: string } | null} */
    let tekrarBildirimi = null;

    db.withTransaction(() => {
        const guncelGorev = db.prepare('SELECT * FROM gorevler WHERE id = ?').get(req.params.id);
        if (!guncelGorev) {
            gorevKayboldu = true;
            return;
        }
        if (guncelGorev.durum === durum) {
            mesaj = 'Görev zaten bu durumda.';
            return;
        }

        db.prepare('UPDATE gorevler SET durum = ? WHERE id = ?').run(durum, req.params.id);

        // Tamamlandiginda olusturani bilgilendir + tekrarliysa yeni gorev olustur
        if (durum === 'tamamlandi') {
            if (guncelGorev.olusturan_id && guncelGorev.olusturan_id !== req.kullanici.id) {
                const k = db
                    .prepare('SELECT ad_soyad, telefon FROM kullanicilar WHERE id = ?')
                    .get(guncelGorev.kullanici_id);
                const ad = kullaniciGorunenAd(k);
                tamamlandiBildirimi = {
                    kullanici_id: Number(guncelGorev.olusturan_id),
                    baslik: 'Görev tamamlandı: ' + guncelGorev.baslik,
                    icerik: ad + ' atadığınız görevi tamamladı.'
                };
            }

            if (guncelGorev.tekrar && guncelGorev.tekrar !== 'tek' && guncelGorev.son_tarih) {
                const yeniTarihStr = sonrakiTekrarTarihi(guncelGorev);
                if (yeniTarihStr && tekrarliGorevOlustur(guncelGorev, yeniTarihStr)) {
                    tekrarBildirimi = {
                        kullanici_id: Number(guncelGorev.kullanici_id),
                        baslik: '🔁 Tekrarlayan görev: ' + guncelGorev.baslik,
                        icerik: 'Yeni tekrar oluşturuldu. Son tarih: ' + yeniTarihStr.split(' ')[0]
                    };
                }
            }
        }
    });

    if (gorevKayboldu) return res.status(404).json({ hata: 'Görev bulunamadı.' });

    if (tamamlandiBildirimi) {
        bildirimOlustur(
            tamamlandiBildirimi.kullanici_id,
            'gorev_tamamlandi',
            tamamlandiBildirimi.baslik,
            tamamlandiBildirimi.icerik,
            '/panel/gorevler'
        );
    }
    if (tekrarBildirimi) {
        bildirimOlustur(
            tekrarBildirimi.kullanici_id,
            'gorev_tekrar',
            tekrarBildirimi.baslik,
            tekrarBildirimi.icerik,
            '/panel/gorevler'
        );
    }

    res.json({ mesaj });
});

router.delete('/:id', tokenDogrula, adminVeyaYardimci, (req, res) => {
    db.prepare('DELETE FROM gorevler WHERE id = ?').run(req.params.id);
    res.json({ mesaj: 'Görev silindi.' });
});

module.exports = router;
