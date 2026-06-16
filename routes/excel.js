const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../database/db');
const { tokenDogrula } = require('../middleware/auth');
const router = express.Router();

// Turkce normalize: kucuk harf + tr karakter sadelestirme
function norm(s) {
    if (s === null || s === undefined) return '';
    return String(s).toLowerCase()
        .replace(/ı/g,'i').replace(/İ/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g')
        .replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c')
        .replace(/[^a-z0-9]/g,'').trim();
}

function sutunTipiBul(baslik) {
    const n = norm(baslik);
    if (!n) return null;
    if (n.includes('plaka')) return 'plaka';
    if ((n.includes('ilce')||n.includes('ilçe')) && n.includes('ad')) return 'ilce_adi';
    if (n==='ilce'||n==='ilçe') return 'ilce_adi';
    if (n.includes('il')&&n.includes('ad')&&!n.includes('ilce')) return 'il_adi';
    if (n==='il'||n==='sehir'||n==='şehir') return 'il_adi';
    if ((n.includes('ad')&&n.includes('soyad'))||n.includes('baskan')||n.includes('isim')||n.includes('sorumlu')||n.includes('yetkili')) return 'baskan_ad_soyad';
    if (n.includes('telefon')||n.includes('tel')||n.includes('gsm')||n.includes('cep')) return 'baskan_telefon';
    if (n.includes('tc')||n.includes('kimlik')) return 'baskan_tc';
    if (n.includes('instagram')||n.includes('insta')||n==='ig') return 'instagram_url';
    if (n.includes('twitter')||n.includes('tweet')||n==='x') return 'twitter_url';
    if (n.includes('facebook')||n.includes('face')||n==='fb') return 'facebook_url';
    if (n.includes('tiktok')||n.includes('tik')||n==='tt') return 'tiktok_url';
    return null;
}

function icerikTipiBul(deger) {
    const d = String(deger||'').toLowerCase();
    if (d.includes('instagram.com')) return 'instagram_url';
    if (d.includes('twitter.com')||d.includes('x.com')) return 'twitter_url';
    if (d.includes('facebook.com')||d.includes('fb.com')) return 'facebook_url';
    if (d.includes('tiktok.com')) return 'tiktok_url';
    return null;
}

// Hucre degerini string'e cevir (ExcelJS bazen obje dondurur - hyperlink, formula vs)
function hucreMetni(deger) {
    if (deger === null || deger === undefined) return '';
    if (typeof deger === 'object') {
        if (deger.text) return String(deger.text);
        if (deger.result) return String(deger.result);
        if (deger.richText) return deger.richText.map(t => t.text).join('');
        if (deger.hyperlink) return String(deger.hyperlink);
        return '';
    }
    return String(deger);
}

async function dosyaOku(base64) {
    const veri = base64.includes(',') ? base64.split(',')[1] : base64;
    const buf = Buffer.from(veri, 'base64');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const satirlar = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
        const arr = [];
        const maxCol = ws.actualColumnCount || row.cellCount || 0;
        for (let c = 1; c <= Math.max(maxCol, row.cellCount); c++) {
            arr.push(hucreMetni(row.getCell(c).value));
        }
        satirlar.push(arr);
    });
    return satirlar;
}

// POST /api/excel/onizle
router.post('/onizle', tokenDogrula, async (req, res) => {
    const { dosya, tip } = req.body;
    if (!dosya) return res.status(400).json({ hata: 'Dosya gereklidir.' });
    let satirlar;
    try { satirlar = await dosyaOku(dosya); } catch (e) { return res.status(400).json({ hata: 'Excel dosyası okunamadı.' }); }
    if (!satirlar.length) return res.status(400).json({ hata: 'Dosya boş.' });

    const basliklar = satirlar[0];
    const sutunMap = {};
    const taninanSutunlar = [];
    basliklar.forEach((b, i) => {
        const t = sutunTipiBul(b);
        if (t && !Object.values(sutunMap).includes(t)) { sutunMap[i] = t; taninanSutunlar.push({ index: i, baslik: b, tip: t }); }
    });
    if (satirlar.length > 1) {
        basliklar.forEach((b, i) => {
            if (sutunMap[i]) return;
            for (let r = 1; r < Math.min(satirlar.length, 6); r++) {
                const it = icerikTipiBul(satirlar[r][i]);
                if (it && !Object.values(sutunMap).includes(it)) { sutunMap[i] = it; taninanSutunlar.push({ index: i, baslik: b||'(otomatik)', tip: it }); break; }
            }
        });
    }

    const sonuclar = [];
    const sorunlar = [];
    for (let r = 1; r < satirlar.length; r++) {
        const satir = satirlar[r];
        if (satir.every(h => String(h).trim() === '')) continue;
        const kayit = {};
        for (const [idx, tip] of Object.entries(sutunMap)) {
            const v = String(satir[idx] ?? '').trim();
            if (v) kayit[tip] = v;
        }
        if (tip === 'il' && !kayit.il_adi) { sorunlar.push({ satir: r+1, sorun: 'İl adı boş' }); continue; }
        if (tip === 'ilce' && (!kayit.il_adi || !kayit.ilce_adi)) { sorunlar.push({ satir: r+1, sorun: 'İl veya ilçe adı boş' }); continue; }
        sonuclar.push(kayit);
    }
    res.json({ toplam: sonuclar.length, sonuclar, sorunlar, taninanSutunlar });
});

// POST /api/excel/uygula
router.post('/uygula', tokenDogrula, (req, res) => {
    const { sonuclar, tip } = req.body;
    if (!Array.isArray(sonuclar)) return res.status(400).json({ hata: 'Geçersiz veri.' });

    let izinliIller = null;
    if (req.kullanici.rol === 'kullanici') {
        izinliIller = new Set(db.prepare('SELECT il_id FROM kullanici_iller WHERE kullanici_id = ?').all(req.kullanici.id).map(r => r.il_id));
    }

    let basarili = 0;
    const ilBul = db.prepare('SELECT id FROM iller WHERE il_adi = ? COLLATE NOCASE');
    const tumIller = db.prepare('SELECT id, il_adi FROM iller').all();
    function ilEslestir(ad) {
        const tam = ilBul.get(ad); if (tam) return tam.id;
        const na = norm(ad);
        const bul = tumIller.find(i => norm(i.il_adi) === na);
        return bul ? bul.id : null;
    }

    for (const k of sonuclar) {
        try {
            if (tip === 'il') {
                const ilId = ilEslestir(k.il_adi); if (!ilId) continue;
                if (izinliIller && !izinliIller.has(ilId)) continue;
                db.prepare(`UPDATE iller SET
                    baskan_ad_soyad=COALESCE(?,baskan_ad_soyad), baskan_telefon=COALESCE(?,baskan_telefon),
                    baskan_tc=COALESCE(?,baskan_tc), instagram_url=COALESCE(?,instagram_url),
                    twitter_url=COALESCE(?,twitter_url), facebook_url=COALESCE(?,facebook_url), tiktok_url=COALESCE(?,tiktok_url)
                    WHERE id=?`).run(k.baskan_ad_soyad||null,k.baskan_telefon||null,k.baskan_tc||null,k.instagram_url||null,k.twitter_url||null,k.facebook_url||null,k.tiktok_url||null,ilId);
                basarili++;
            } else {
                const ilId = ilEslestir(k.il_adi); if (!ilId) continue;
                if (izinliIller && !izinliIller.has(ilId)) continue;
                const mevcut = db.prepare('SELECT id FROM ilceler WHERE il_id=? AND ilce_adi=? COLLATE NOCASE').get(ilId, k.ilce_adi);
                if (mevcut) {
                    db.prepare(`UPDATE ilceler SET
                        baskan_ad_soyad=COALESCE(?,baskan_ad_soyad), baskan_telefon=COALESCE(?,baskan_telefon),
                        baskan_tc=COALESCE(?,baskan_tc), instagram_url=COALESCE(?,instagram_url),
                        twitter_url=COALESCE(?,twitter_url), facebook_url=COALESCE(?,facebook_url), tiktok_url=COALESCE(?,tiktok_url)
                        WHERE id=?`).run(k.baskan_ad_soyad||null,k.baskan_telefon||null,k.baskan_tc||null,k.instagram_url||null,k.twitter_url||null,k.facebook_url||null,k.tiktok_url||null,mevcut.id);
                } else {
                    db.prepare(`INSERT INTO ilceler (il_id,ilce_adi,baskan_ad_soyad,baskan_telefon,baskan_tc,instagram_url,twitter_url,facebook_url,tiktok_url)
                        VALUES (?,?,?,?,?,?,?,?,?)`).run(ilId,k.ilce_adi,k.baskan_ad_soyad||null,k.baskan_telefon||null,k.baskan_tc||null,k.instagram_url||null,k.twitter_url||null,k.facebook_url||null,k.tiktok_url||null);
                }
                basarili++;
            }
        } catch (e) { /* atla */ }
    }
    res.json({ mesaj: 'İçe aktarma tamamlandı.', basarili });
});

async function excelGonder(res, satirlar, ad) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Veriler');
    satirlar.forEach(s => ws.addRow(s));
    // Baslik satirini kalin yap
    ws.getRow(1).font = { bold: true };
    // Sutun genisliklerini otomatik
    ws.columns.forEach((col, i) => {
        let max = 10;
        satirlar.forEach(s => { const v = String(s[i] ?? ''); if (v.length > max) max = Math.min(v.length, 50); });
        col.width = max + 2;
    });
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Disposition', 'attachment; filename="' + ad + '.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buf));
}

// GET /api/excel/sablon?tip=il|ilce
router.get('/sablon', tokenDogrula, async (req, res) => {
    const tip = req.query.tip === 'ilce' ? 'ilce' : 'il';
    let basliklar, ornek;
    if (tip === 'il') {
        basliklar = ['İl Adı','Başkan Ad Soyad','Telefon','TC Kimlik No','Instagram','Twitter','Facebook','TikTok'];
        ornek = ['Ordu','Ahmet Yılmaz','05001112233','','https://instagram.com/ornek','','',''];
    } else {
        basliklar = ['İl Adı','İlçe Adı','Başkan Ad Soyad','Telefon','TC Kimlik No','Instagram','Twitter','Facebook','TikTok'];
        ornek = ['Ordu','Altınordu','Mehmet Demir','05001112233','','','','',''];
    }
    await excelGonder(res, [basliklar, ornek], 'sablon-' + tip);
});

// GET /api/excel/disa-aktar?tip=il|ilce
router.get('/disa-aktar', tokenDogrula, async (req, res) => {
    const tip = req.query.tip === 'ilce' ? 'ilce' : 'il';
    let izinliIller = null;
    if (req.kullanici.rol === 'kullanici') {
        izinliIller = db.prepare('SELECT il_id FROM kullanici_iller WHERE kullanici_id = ?').all(req.kullanici.id).map(r => r.il_id);
    }
    if (tip === 'il') {
        let sorgu = 'SELECT plaka, il_adi, baskan_ad_soyad, baskan_telefon, baskan_tc, instagram_url, twitter_url, facebook_url, tiktok_url FROM iller';
        let params = [];
        let veri;
        if (izinliIller) {
            if (!izinliIller.length) veri = [];
            else { sorgu += ' WHERE id IN ('+izinliIller.map(()=>'?').join(',')+')'; params = izinliIller; }
        }
        sorgu += ' ORDER BY plaka';
        if (veri === undefined) veri = db.prepare(sorgu).all(...params);
        const basliklar = ['Plaka','İl Adı','Başkan Ad Soyad','Telefon','TC Kimlik No','Instagram','Twitter','Facebook','TikTok'];
        const satirlar = [basliklar];
        veri.forEach(r => satirlar.push([r.plaka, r.il_adi, r.baskan_ad_soyad, r.baskan_telefon, r.baskan_tc, r.instagram_url, r.twitter_url, r.facebook_url, r.tiktok_url]));
        return await excelGonder(res, satirlar, 'iller');
    } else {
        let sorgu = `SELECT i.il_adi, c.ilce_adi, c.baskan_ad_soyad, c.baskan_telefon, c.baskan_tc, c.instagram_url, c.twitter_url, c.facebook_url, c.tiktok_url FROM ilceler c JOIN iller i ON c.il_id = i.id`;
        let params = [];
        let veri;
        if (izinliIller) {
            if (!izinliIller.length) veri = [];
            else { sorgu += ' WHERE c.il_id IN ('+izinliIller.map(()=>'?').join(',')+')'; params = izinliIller; }
        }
        sorgu += ' ORDER BY i.il_adi, c.ilce_adi';
        if (veri === undefined) veri = db.prepare(sorgu).all(...params);
        const basliklar = ['İl Adı','İlçe Adı','Başkan Ad Soyad','Telefon','TC Kimlik No','Instagram','Twitter','Facebook','TikTok'];
        const satirlar = [basliklar];
        veri.forEach(r => satirlar.push([r.il_adi, r.ilce_adi, r.baskan_ad_soyad, r.baskan_telefon, r.baskan_tc, r.instagram_url, r.twitter_url, r.facebook_url, r.tiktok_url]));
        return await excelGonder(res, satirlar, 'ilceler');
    }
});

module.exports = router;
