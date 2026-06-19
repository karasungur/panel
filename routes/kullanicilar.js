const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { tokenDogrula, adminVeyaYardimci } = require('../middleware/auth');
const router = express.Router();

// Yardimciya da admin'in degistirme/silme yapamamasi icin kontrol
function adminEtkilemeKontrolu(req, res, hedefId, izinVer) {
    // izinVer fonksiyonu cagrilir (callback) eger hedef admin DEGILSE veya yapan admin ise
    const hedef = db.prepare('SELECT rol FROM kullanicilar WHERE id = ?').get(hedefId);
    if (!hedef) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
    if (hedef.rol === 'admin' && req.kullanici.rol !== 'admin') {
        return res.status(403).json({ hata: 'Yönetici hesabını yalnızca yönetici değiştirebilir.' });
    }
    izinVer(hedef);
}

router.get('/', tokenDogrula, adminVeyaYardimci, (req, res) => {
    const kullanicilar = db
        .prepare(
            `
        SELECT id, kullanici_adi, rol, ad_soyad, gorev_adi, renk, profil_foto, son_giris, olusturulma_tarihi
        FROM kullanicilar ORDER BY id
    `
        )
        .all();
    const ilSorgu = db.prepare(`
        SELECT i.id, i.il_adi FROM kullanici_iller ki
        JOIN iller i ON ki.il_id = i.id
        WHERE ki.kullanici_id = ? ORDER BY i.plaka
    `);
    const sonuc = kullanicilar.map((k) => ({
        ...k,
        iller: k.rol === 'admin' || k.rol === 'yardimci' ? [] : ilSorgu.all(k.id)
    }));
    res.json(sonuc);
});

router.get('/ben', tokenDogrula, (req, res) => {
    const k = db
        .prepare(
            'SELECT id, kullanici_adi, rol, ad_soyad, gorev_adi, renk, profil_foto, son_giris FROM kullanicilar WHERE id = ?'
        )
        .get(req.kullanici.id);
    const iller = db
        .prepare(
            `SELECT i.id, i.il_adi FROM kullanici_iller ki JOIN iller i ON ki.il_id=i.id WHERE ki.kullanici_id=? ORDER BY i.plaka`
        )
        .all(req.kullanici.id);
    res.json({ ...k, iller });
});

router.post('/', tokenDogrula, adminVeyaYardimci, (req, res) => {
    const { kullanici_adi, sifre, ad_soyad, gorev_adi, renk, il_idleri, rol } = req.body;
    if (!kullanici_adi || !sifre) {
        return res.status(400).json({ hata: 'Kullanıcı adı ve şifre gereklidir.' });
    }
    // Sadece admin baskasini admin/yardimci yapabilir; yardimci sadece normal kullanici olusturabilir
    let yeniRol = 'kullanici';
    if (rol === 'yardimci' || rol === 'admin') {
        if (req.kullanici.rol !== 'admin') {
            return res.status(403).json({ hata: 'Yetkili kullanıcı sadece yönetici tarafından oluşturulabilir.' });
        }
        yeniRol = rol;
    }
    const hash = bcrypt.hashSync(sifre, 10);
    try {
        const yeniId = db.withTransaction(() => {
            const sonuc = db
                .prepare(
                    `INSERT INTO kullanicilar (kullanici_adi, sifre, rol, ad_soyad, gorev_adi, renk) VALUES (?, ?, ?, ?, ?, ?)`
                )
                .run(kullanici_adi, hash, yeniRol, ad_soyad || null, gorev_adi || null, renk || '#24467c');
            const id = sonuc.lastInsertRowid;
            if (Array.isArray(il_idleri) && yeniRol === 'kullanici') {
                const ekle = db.prepare('INSERT OR IGNORE INTO kullanici_iller (kullanici_id, il_id) VALUES (?, ?)');
                for (const ilId of il_idleri) ekle.run(id, parseInt(ilId));
            }
            return id;
        });
        res.status(201).json({ mesaj: 'Kullanıcı oluşturuldu.', id: yeniId });
    } catch (err) {
        if (err.message.includes('UNIQUE'))
            return res.status(409).json({ hata: 'Bu kullanıcı adı zaten kullanılıyor.' });
        res.status(500).json({ hata: 'Sunucu hatası.', detay: err.message });
    }
});

router.put('/profil/guncelle', tokenDogrula, (req, res) => {
    const { ad_soyad, kullanici_adi, profil_foto } = req.body;
    try {
        db.prepare(
            'UPDATE kullanicilar SET ad_soyad = COALESCE(?, ad_soyad), kullanici_adi = COALESCE(?, kullanici_adi), profil_foto = COALESCE(?, profil_foto) WHERE id = ?'
        ).run(ad_soyad ?? null, kullanici_adi || null, profil_foto ?? null, req.kullanici.id);
        res.json({ mesaj: 'Profiliniz güncellendi.' });
    } catch (err) {
        if (err.message.includes('UNIQUE'))
            return res.status(409).json({ hata: 'Bu kullanıcı adı zaten kullanılıyor.' });
        res.status(500).json({ hata: 'Sunucu hatası.' });
    }
});

router.put('/profil/sifre', tokenDogrula, (req, res) => {
    const { eski_sifre, yeni_sifre } = req.body;
    if (!eski_sifre || !yeni_sifre) return res.status(400).json({ hata: 'Eski ve yeni şifre gereklidir.' });
    const k = db.prepare('SELECT sifre FROM kullanicilar WHERE id = ?').get(req.kullanici.id);
    if (!k || !bcrypt.compareSync(eski_sifre, String(k.sifre || '')))
        return res.status(400).json({ hata: 'Mevcut şifreniz hatalı.' });
    const hash = bcrypt.hashSync(yeni_sifre, 10);
    db.prepare('UPDATE kullanicilar SET sifre = ?, token_version = token_version + 1 WHERE id = ?').run(
        hash,
        req.kullanici.id
    );
    res.json({ mesaj: 'Şifreniz güncellendi.' });
});

router.put('/:id', tokenDogrula, adminVeyaYardimci, (req, res) => {
    const { ad_soyad, gorev_adi, renk, profil_foto, kullanici_adi, rol } = req.body;
    adminEtkilemeKontrolu(req, res, req.params.id, (hedef) => {
        // Rol degisikligi sadece admin tarafindan ve hedef admin degilse
        let rolGuncelle = null;
        if (rol && rol !== hedef.rol) {
            if (req.kullanici.rol !== 'admin') {
                return res.status(403).json({ hata: 'Rol değişimi yetkiniz yok.' });
            }
            if (!['admin', 'yardimci', 'kullanici'].includes(rol)) {
                return res.status(400).json({ hata: 'Geçersiz rol.' });
            }
            rolGuncelle = rol;
        }
        try {
            db.prepare(
                `UPDATE kullanicilar SET
                kullanici_adi = COALESCE(?, kullanici_adi),
                ad_soyad = COALESCE(?, ad_soyad),
                gorev_adi = COALESCE(?, gorev_adi),
                renk = COALESCE(?, renk),
                profil_foto = COALESCE(?, profil_foto),
                rol = COALESCE(?, rol),
                token_version = token_version + CASE WHEN ? IS NULL THEN 0 ELSE 1 END
                WHERE id = ?`
            ).run(
                kullanici_adi || null,
                ad_soyad ?? null,
                gorev_adi ?? null,
                renk || null,
                profil_foto ?? null,
                rolGuncelle,
                rolGuncelle,
                req.params.id
            );
            res.json({ mesaj: 'Kullanıcı güncellendi.' });
        } catch (err) {
            if (err.message.includes('UNIQUE'))
                return res.status(409).json({ hata: 'Bu kullanıcı adı zaten kullanılıyor.' });
            res.status(500).json({ hata: 'Sunucu hatası.', detay: err.message });
        }
    });
});

router.put('/:id/sifre', tokenDogrula, adminVeyaYardimci, (req, res) => {
    const { yeni_sifre } = req.body;
    if (!yeni_sifre) return res.status(400).json({ hata: 'Yeni şifre gereklidir.' });
    adminEtkilemeKontrolu(req, res, req.params.id, () => {
        const hash = bcrypt.hashSync(yeni_sifre, 10);
        db.prepare('UPDATE kullanicilar SET sifre = ?, token_version = token_version + 1 WHERE id = ?').run(
            hash,
            req.params.id
        );
        res.json({ mesaj: 'Şifre güncellendi.' });
    });
});

router.put('/:id/iller', tokenDogrula, adminVeyaYardimci, (req, res) => {
    const { il_idleri } = req.body;
    if (!Array.isArray(il_idleri)) return res.status(400).json({ hata: 'il_idleri liste olmalıdır.' });
    adminEtkilemeKontrolu(req, res, req.params.id, () => {
        db.withTransaction(() => {
            db.prepare('DELETE FROM kullanici_iller WHERE kullanici_id = ?').run(req.params.id);
            const ekle = db.prepare('INSERT OR IGNORE INTO kullanici_iller (kullanici_id, il_id) VALUES (?, ?)');
            for (const ilId of il_idleri) ekle.run(req.params.id, parseInt(ilId));
        });
        res.json({ mesaj: 'İl atamaları güncellendi.' });
    });
});

router.delete('/:id', tokenDogrula, adminVeyaYardimci, (req, res) => {
    if (Number(req.params.id) === req.kullanici.id)
        return res.status(400).json({ hata: 'Kendi hesabınızı silemezsiniz.' });
    adminEtkilemeKontrolu(req, res, req.params.id, () => {
        const sonuc = db.prepare('DELETE FROM kullanicilar WHERE id = ?').run(req.params.id);
        if (sonuc.changes === 0) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
        res.json({ mesaj: 'Kullanıcı silindi.' });
    });
});

module.exports = router;
