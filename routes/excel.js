const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../database/db');
const { tokenDogrula } = require('../middleware/auth');
const { kayitFormatla, kayitMaskele } = require('../middleware/format');
const router = express.Router();

const EXCEL_SABLONLARI = {
    il: {
        basliklar: [
            'Plaka',
            'İl Adı',
            'Tanıtım ve Medya Başkanı',
            'Telefon',
            'TC Kimlik No',
            'Instagram',
            'Twitter',
            'Facebook',
            'TikTok'
        ],
        alanlar: [
            'plaka',
            'il_adi',
            'baskan_ad_soyad',
            'baskan_telefon',
            'baskan_tc',
            'instagram_url',
            'twitter_url',
            'facebook_url',
            'tiktok_url'
        ]
    },
    ilce: {
        basliklar: [
            'İl Adı',
            'İlçe Adı',
            'Tanıtım ve Medya Başkanı',
            'Telefon',
            'TC Kimlik No',
            'Instagram',
            'Twitter',
            'Facebook',
            'TikTok'
        ],
        alanlar: [
            'il_adi',
            'ilce_adi',
            'baskan_ad_soyad',
            'baskan_telefon',
            'baskan_tc',
            'instagram_url',
            'twitter_url',
            'facebook_url',
            'tiktok_url'
        ]
    }
};

function bayrakAcikMi(deger) {
    return ['1', 'true', 'yes', 'evet', 'on'].includes(
        String(deger || '')
            .trim()
            .toLowerCase()
    );
}

function hassasVeriIndirilebilirMi(req) {
    const yetkili = req.kullanici.rol === 'admin' || req.kullanici.rol === 'yardimci';
    return yetkili && bayrakAcikMi(req.query.hassas || req.query.raw || req.query.unmasked);
}

function exportMaskelemeAktifMi(req) {
    if (bayrakAcikMi(req.query.maskele || req.query.mask || req.query.maskeli)) return true;
    return !hassasVeriIndirilebilirMi(req);
}

// Turkce normalize: kucuk harf + tr karakter sadelestirme
function norm(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/İ/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/Ş/g, 's')
        .replace(/Ğ/g, 'g')
        .replace(/Ü/g, 'u')
        .replace(/Ö/g, 'o')
        .replace(/Ç/g, 'c')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

// Hucre degerini string'e cevir
function hucreMetni(deger) {
    if (deger === null || deger === undefined) return '';
    if (typeof deger === 'object') {
        if (deger.text) return String(deger.text);
        if (deger.result) return String(deger.result);
        if (deger.richText) return deger.richText.map((t) => t.text).join('');
        if (deger.hyperlink) return String(deger.hyperlink);
        return '';
    }
    return String(deger);
}

async function dosyaOku(base64) {
    const veri = base64.includes(',') ? base64.split(',')[1] : base64;
    const buf = Buffer.from(veri, 'base64');
    const wb = new ExcelJS.Workbook();
    // @ts-expect-error ExcelJS v4 types expect a pre-generic Node Buffer.
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

function eksikAlanlarBul(tip, kayit) {
    const eksik = [];
    if (!kayit.il_adi) eksik.push('il_adi');
    if (tip === 'ilce' && !kayit.ilce_adi) eksik.push('ilce_adi');
    return eksik;
}

function sorunMesaji(tip, eksikAlanlar) {
    if (tip === 'il') return 'İl adı boş veya algılanamadı';
    if (eksikAlanlar.includes('il_adi') && eksikAlanlar.includes('ilce_adi'))
        return 'İl ve ilçe adı boş veya algılanamadı';
    if (eksikAlanlar.includes('il_adi')) return 'İl adı boş veya algılanamadı';
    return 'İlçe adı boş veya algılanamadı';
}

function algilananAlanlar(kayit) {
    return Object.keys(kayit).filter(
        (k) => k && !k.startsWith('_') && kayit[k] !== null && kayit[k] !== undefined && kayit[k] !== ''
    );
}

function aiSatirNo(ham, index) {
    const n = parseInt(ham?._satir || ham?.satir || '', 10);
    return Number.isFinite(n) && n > 0 ? n : index + 1;
}

function sablonBasliklariniDogrula(tip, baslikSatiri) {
    const sablon = EXCEL_SABLONLARI[tip];
    if (!sablon) return { ok: false, hata: 'Geçersiz Excel tipi.' };

    const gelenBasliklar = (baslikSatiri || []).map((h) => String(h || '').trim());
    const beklenen = sablon.basliklar;
    const fazlaBasliklar = gelenBasliklar.slice(beklenen.length).filter(Boolean);
    const eksikVeyaFarkli = beklenen.filter((baslik, i) => gelenBasliklar[i] !== baslik);

    if (eksikVeyaFarkli.length || fazlaBasliklar.length) {
        return {
            ok: false,
            hata: 'Excel şablonu uyumsuz. Lütfen örnek şablonu indirip başlık satırını değiştirmeden doldurun.',
            beklenenBasliklar: beklenen
        };
    }

    return { ok: true };
}

function satirdanKayitOlustur(tip, satir) {
    const sablon = EXCEL_SABLONLARI[tip];
    const kayit = {};
    sablon.alanlar.forEach((alan, index) => {
        const deger = String(satir[index] ?? '').trim();
        if (deger) kayit[alan] = deger;
    });
    return kayit;
}

// POST /api/excel/onizle - sablon bazli onizleme
router.post('/onizle', tokenDogrula, async (req, res) => {
    const { dosya } = req.body;
    const tip = req.body.tip === 'ilce' ? 'ilce' : 'il';
    if (!dosya) return res.status(400).json({ hata: 'Dosya gereklidir.' });
    let satirlar;
    try {
        satirlar = await dosyaOku(dosya);
    } catch (_e) {
        return res.status(400).json({ hata: 'Excel dosyası okunamadı. Lütfen indirilen .xlsx şablonunu yükleyin.' });
    }
    if (!satirlar.length) return res.status(400).json({ hata: 'Dosya boş.' });

    const baslikKontrolu = sablonBasliklariniDogrula(tip, satirlar[0]);
    if (!baslikKontrolu.ok) {
        return res.status(400).json(baslikKontrolu);
    }

    const sonuclar = [];
    const sorunlar = [];
    for (let r = 1; r < satirlar.length; r++) {
        const satir = satirlar[r];
        if (satir.every((h) => String(h).trim() === '')) continue;
        const kayit = satirdanKayitOlustur(tip, satir);
        const eksikAlanlar = eksikAlanlarBul(tip, kayit);
        if (eksikAlanlar.length) {
            sorunlar.push({
                satir: r + 1,
                sorun: sorunMesaji(tip, eksikAlanlar),
                eksikAlanlar,
                algilananAlanlar: algilananAlanlar(kayit),
                doluHucreSayisi: satir.filter((h) => String(h).trim() !== '').length
            });
            continue;
        }
        kayit._satir = r + 1;
        sonuclar.push(kayitFormatla(kayit));
    }
    res.json({ toplam: sonuclar.length, sonuclar, sorunlar, sablon: tip });
});

// POST /api/excel/uygula
router.post('/uygula', tokenDogrula, (req, res) => {
    const { sonuclar } = req.body;
    if (!Array.isArray(sonuclar)) return res.status(400).json({ hata: 'Geçersiz veri.' });

    let izinliIller = null;
    if (req.kullanici.rol === 'kullanici') {
        izinliIller = new Set(
            db
                .prepare('SELECT il_id FROM kullanici_iller WHERE kullanici_id = ?')
                .all(req.kullanici.id)
                .map((r) => r.il_id)
        );
    }

    let basarili = 0,
        ilceBasarili = 0,
        atlanan = 0;
    const sorunlar = [];
    const ilBul = db.prepare('SELECT id FROM iller WHERE il_adi = ? COLLATE NOCASE');
    const tumIller = db.prepare('SELECT id, il_adi FROM iller').all();
    function ilEslestir(ad) {
        const tam = ilBul.get(ad);
        if (tam) return tam.id;
        const na = norm(ad);
        const bul = tumIller.find((i) => norm(i.il_adi) === na);
        return bul ? bul.id : null;
    }
    // Mevcut ilceyi bul (yeni ekleme yapma)
    function ilceEslestir(ilId, ilceAdi) {
        if (!ilId || !ilceAdi) return null;
        const tam = db
            .prepare('SELECT id FROM ilceler WHERE il_id=? AND ilce_adi=? COLLATE NOCASE')
            .get(ilId, String(ilceAdi).trim());
        if (tam) return tam.id;
        const na = norm(ilceAdi);
        const tumIlceler = db.prepare('SELECT id, ilce_adi FROM ilceler WHERE il_id=?').all(ilId);
        const bul = tumIlceler.find((i) => norm(i.ilce_adi) === na);
        return bul ? bul.id : null;
    }

    db.withTransaction(() => {
        sonuclar.forEach((ham, index) => {
            const satirNo = aiSatirNo(ham, index);
            const k = kayitFormatla(ham && typeof ham === 'object' ? ham : {});
            try {
                const ilId = ilEslestir(k.il_adi);
                if (!ilId) {
                    atlanan++;
                    sorunlar.push({ satir: satirNo, sorun: 'İl eşleşmedi', il_adi: k.il_adi || '' });
                    return;
                }
                if (izinliIller && !izinliIller.has(ilId)) {
                    atlanan++;
                    sorunlar.push({ satir: satirNo, sorun: 'Bu il için yetki yok', il_adi: k.il_adi || '' });
                    return;
                }

                // Kayitta ilce_adi varsa: ILCEYI guncelle (il'e dokunma)
                if (k.ilce_adi && String(k.ilce_adi).trim()) {
                    const ilceId = ilceEslestir(ilId, k.ilce_adi);
                    if (ilceId) {
                        db.prepare(
                            `UPDATE ilceler SET
                            baskan_ad_soyad=COALESCE(?,baskan_ad_soyad), baskan_telefon=COALESCE(?,baskan_telefon),
                            baskan_tc=COALESCE(?,baskan_tc), instagram_url=COALESCE(?,instagram_url),
                            twitter_url=COALESCE(?,twitter_url), facebook_url=COALESCE(?,facebook_url), tiktok_url=COALESCE(?,tiktok_url)
                            WHERE id=?`
                        ).run(
                            k.baskan_ad_soyad || null,
                            k.baskan_telefon || null,
                            k.baskan_tc || null,
                            k.instagram_url || null,
                            k.twitter_url || null,
                            k.facebook_url || null,
                            k.tiktok_url || null,
                            ilceId
                        );
                        ilceBasarili++;
                    } else {
                        // Mevcut ilce bulunamadi - YENI EKLEMIYORUZ, sadece atla
                        atlanan++;
                        sorunlar.push({
                            satir: satirNo,
                            sorun: 'İlçe eşleşmedi',
                            il_adi: k.il_adi || '',
                            ilce_adi: k.ilce_adi || ''
                        });
                    }
                } else {
                    // Sadece il bilgisi - il'i guncelle
                    db.prepare(
                        `UPDATE iller SET
                        baskan_ad_soyad=COALESCE(?,baskan_ad_soyad), baskan_telefon=COALESCE(?,baskan_telefon),
                        baskan_tc=COALESCE(?,baskan_tc), instagram_url=COALESCE(?,instagram_url),
                        twitter_url=COALESCE(?,twitter_url), facebook_url=COALESCE(?,facebook_url), tiktok_url=COALESCE(?,tiktok_url)
                        WHERE id=?`
                    ).run(
                        k.baskan_ad_soyad || null,
                        k.baskan_telefon || null,
                        k.baskan_tc || null,
                        k.instagram_url || null,
                        k.twitter_url || null,
                        k.facebook_url || null,
                        k.tiktok_url || null,
                        ilId
                    );
                    basarili++;
                }
            } catch (_e) {
                atlanan++;
                sorunlar.push({
                    satir: satirNo,
                    sorun: 'Kayıt uygulanamadı',
                    il_adi: k.il_adi || '',
                    ilce_adi: k.ilce_adi || ''
                });
            }
        });
    });
    const parcalar = [];
    if (basarili > 0) parcalar.push(basarili + ' il güncellendi');
    if (ilceBasarili > 0) parcalar.push(ilceBasarili + ' ilçe güncellendi');
    if (atlanan > 0) parcalar.push(atlanan + ' kayıt atlandı (eşleşmeyen il/ilçe)');
    const mesaj = parcalar.length ? parcalar.join(', ') + '.' : 'Hiç kayıt güncellenmedi.';
    res.json({ mesaj, basarili: basarili + ilceBasarili, ilceBasarili, atlanan, sorunlar });
});

async function excelGonder(res, satirlar, ad) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Veriler');
    satirlar.forEach((s) => ws.addRow(s));
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((col, i) => {
        let max = 10;
        satirlar.forEach((s) => {
            const v = String(s[i] ?? '');
            if (v.length > max) max = Math.min(v.length, 50);
        });
        col.width = max + 2;
    });
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Disposition', 'attachment; filename="' + ad + '.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buf));
}

router.get('/sablon', tokenDogrula, async (req, res) => {
    const tip = req.query.tip === 'ilce' ? 'ilce' : 'il';
    const basliklar = EXCEL_SABLONLARI[tip].basliklar;
    let satirlar;
    if (tip === 'il') {
        satirlar = [
            basliklar,
            ['52', 'Ordu', 'Ahmet YILMAZ', '0555-123-45-67', '', 'https://instagram.com/ornek', '', '', '']
        ];
    } else {
        satirlar = [
            basliklar,
            ['Ordu', 'Altınordu', 'Mehmet DEMİR', '0555-111-22-33', '', '', '', '', ''],
            ['Ordu', 'Ünye', 'Hasan KARA', '0555-444-55-66', '', '', '', '', '']
        ];
    }
    await excelGonder(res, satirlar, 'sablon-' + tip);
});

router.get('/disa-aktar', tokenDogrula, async (req, res) => {
    const tip = req.query.tip === 'ilce' ? 'ilce' : req.query.tip === 'birlesik' ? 'birlesik' : 'il';
    const ilIdsRaw = typeof req.query.il_ids === 'string' ? req.query.il_ids : ''; // ornek: "1,5,12"
    const secimIller = ilIdsRaw
        .split(',')
        .map((s) => parseInt(s))
        .filter((n) => n > 0);
    const maskele = exportMaskelemeAktifMi(req);

    let izinliIller = null;
    if (req.kullanici.rol === 'kullanici') {
        izinliIller = db
            .prepare('SELECT il_id FROM kullanici_iller WHERE kullanici_id = ?')
            .all(req.kullanici.id)
            .map((r) => r.il_id);
    }

    // Filtre uygulama: secim varsa onu kullan, yoksa izinli, yoksa hepsi
    function ilIdFiltresi() {
        if (secimIller.length) {
            if (izinliIller) {
                // Kullanici hem secim hem izin var - kesisim
                return secimIller.filter((id) => izinliIller.includes(id));
            }
            return secimIller;
        }
        return izinliIller; // null veya array
    }

    const filtre = ilIdFiltresi();

    if (tip === 'il') {
        let sorgu =
            'SELECT plaka, il_adi, baskan_ad_soyad, baskan_telefon, baskan_tc, instagram_url, twitter_url, facebook_url, tiktok_url FROM iller';
        let params = [];
        let veri;
        if (filtre !== null) {
            if (!filtre.length) veri = [];
            else {
                sorgu += ' WHERE id IN (' + filtre.map(() => '?').join(',') + ')';
                params = filtre;
            }
        }
        sorgu += ' ORDER BY plaka';
        if (veri === undefined) veri = db.prepare(sorgu).all(...params);
        const basliklar = [
            'Plaka',
            'İl Adı',
            'Tanıtım ve Medya Başkanı',
            'Telefon',
            'TC Kimlik No',
            'Instagram',
            'Twitter',
            'Facebook',
            'TikTok'
        ];
        const satirlar = [basliklar];
        veri.forEach((r) => {
            const k = maskele ? kayitMaskele(r) : r;
            satirlar.push([
                k.plaka,
                k.il_adi,
                k.baskan_ad_soyad,
                k.baskan_telefon,
                k.baskan_tc,
                k.instagram_url,
                k.twitter_url,
                k.facebook_url,
                k.tiktok_url
            ]);
        });
        return await excelGonder(
            res,
            satirlar,
            'iller-' + (secimIller.length === 1 ? 'tekil' : 'liste') + (maskele ? '-maskeli' : '')
        );
    } else if (tip === 'ilce') {
        let sorgu = `SELECT i.il_adi, c.ilce_adi, c.baskan_ad_soyad, c.baskan_telefon, c.baskan_tc, c.instagram_url, c.twitter_url, c.facebook_url, c.tiktok_url FROM ilceler c JOIN iller i ON c.il_id = i.id`;
        let params = [];
        let veri;
        if (filtre !== null) {
            if (!filtre.length) veri = [];
            else {
                sorgu += ' WHERE c.il_id IN (' + filtre.map(() => '?').join(',') + ')';
                params = filtre;
            }
        }
        sorgu += ' ORDER BY i.il_adi, c.ilce_adi';
        if (veri === undefined) veri = db.prepare(sorgu).all(...params);
        const basliklar = [
            'İl Adı',
            'İlçe Adı',
            'Tanıtım ve Medya Başkanı',
            'Telefon',
            'TC Kimlik No',
            'Instagram',
            'Twitter',
            'Facebook',
            'TikTok'
        ];
        const satirlar = [basliklar];
        veri.forEach((r) => {
            const k = maskele ? kayitMaskele(r) : r;
            satirlar.push([
                k.il_adi,
                k.ilce_adi,
                k.baskan_ad_soyad,
                k.baskan_telefon,
                k.baskan_tc,
                k.instagram_url,
                k.twitter_url,
                k.facebook_url,
                k.tiktok_url
            ]);
        });
        return await excelGonder(
            res,
            satirlar,
            'ilceler-' + (secimIller.length === 1 ? 'tekil' : 'liste') + (maskele ? '-maskeli' : '')
        );
    } else {
        // BIRLESIK: hem il hem ilceleri
        let ilSorgu =
            'SELECT id, plaka, il_adi, baskan_ad_soyad, baskan_telefon, baskan_tc, instagram_url, twitter_url, facebook_url, tiktok_url FROM iller';
        let ilParams = [];
        let iller;
        if (filtre !== null) {
            if (!filtre.length) iller = [];
            else {
                ilSorgu += ' WHERE id IN (' + filtre.map(() => '?').join(',') + ')';
                ilParams = filtre;
            }
        }
        ilSorgu += ' ORDER BY plaka';
        if (iller === undefined) iller = db.prepare(ilSorgu).all(...ilParams);

        const basliklar = [
            'Plaka',
            'İl Adı',
            'İlçe Adı',
            'Tanıtım ve Medya Başkanı',
            'Telefon',
            'TC Kimlik No',
            'Instagram',
            'Twitter',
            'Facebook',
            'TikTok'
        ];
        const satirlar = [basliklar];
        for (const il of iller) {
            const ilKayit = maskele ? kayitMaskele(il) : il;
            // Once il satiri (ilce_adi bos)
            satirlar.push([
                ilKayit.plaka,
                ilKayit.il_adi,
                '',
                ilKayit.baskan_ad_soyad,
                ilKayit.baskan_telefon,
                ilKayit.baskan_tc,
                ilKayit.instagram_url,
                ilKayit.twitter_url,
                ilKayit.facebook_url,
                ilKayit.tiktok_url
            ]);
            // Sonra o ilin ilceleri
            const ilceler = db
                .prepare(
                    `SELECT ilce_adi, baskan_ad_soyad, baskan_telefon, baskan_tc, instagram_url, twitter_url, facebook_url, tiktok_url FROM ilceler WHERE il_id = ? ORDER BY ilce_adi`
                )
                .all(il.id);
            for (const c of ilceler) {
                const k = maskele ? kayitMaskele(c) : c;
                satirlar.push([
                    '',
                    il.il_adi,
                    k.ilce_adi,
                    k.baskan_ad_soyad,
                    k.baskan_telefon,
                    k.baskan_tc,
                    k.instagram_url,
                    k.twitter_url,
                    k.facebook_url,
                    k.tiktok_url
                ]);
            }
        }
        return await excelGonder(
            res,
            satirlar,
            'iller-ve-ilceler-' + (secimIller.length === 1 ? 'tekil' : 'liste') + (maskele ? '-maskeli' : '')
        );
    }
});

module.exports = router;
