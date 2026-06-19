const express = require('express');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const db = require('../database/db');
const { tokenDogrula } = require('../middleware/auth');
const { kayitFormatla, kayitMaskele } = require('../middleware/format');
const router = express.Router();

const IMPORT_TTL_MS = 15 * 60 * 1000;
const MAX_XLSX_DECODED_BYTES = 5 * 1024 * 1024;
const MAX_EXCEL_ROWS = 2000;
const MAX_EXCEL_COLUMNS = 12;
const MAX_EXCEL_CELL_LENGTH = 300;
const IMPORT_OTURUMLARI = new Map();

const ALAN_UZUNLUK_LIMITLERI = {
    plaka: 2,
    il_adi: 80,
    ilce_adi: 100,
    baskan_ad_soyad: 120,
    baskan_telefon: 20,
    baskan_tc: 11,
    instagram_url: 250,
    twitter_url: 250,
    facebook_url: 250,
    tiktok_url: 250
};

const SOSYAL_PLATFORM_ALANLARI = {
    instagram_url: 'instagram',
    twitter_url: 'twitter',
    facebook_url: 'facebook',
    tiktok_url: 'tiktok'
};

const SOSYAL_HOST_ALLOWLIST = {
    instagram: new Set(['instagram.com', 'www.instagram.com']),
    twitter: new Set(['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com']),
    facebook: new Set(['facebook.com', 'www.facebook.com']),
    tiktok: new Set(['tiktok.com', 'www.tiktok.com'])
};

class ExcelLimitError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ExcelLimitError';
        this.clientMessage = message;
    }
}

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

function base64VerisiniCikar(dosya) {
    if (typeof dosya !== 'string') throw new ExcelLimitError('Dosya verisi geçersiz.');

    const raw = dosya.includes(',') ? dosya.split(',').pop() : dosya;
    const temiz = String(raw || '').replace(/\s/g, '');
    if (!temiz) throw new ExcelLimitError('Dosya verisi boş.');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(temiz) || temiz.length % 4 === 1) {
        throw new ExcelLimitError('Dosya verisi base64 formatında değil.');
    }

    const padding = temiz.endsWith('==') ? 2 : temiz.endsWith('=') ? 1 : 0;
    const tahminiByte = Math.floor((temiz.length * 3) / 4) - padding;
    if (tahminiByte > MAX_XLSX_DECODED_BYTES) {
        throw new ExcelLimitError(
            `Excel dosyası en fazla ${Math.floor(MAX_XLSX_DECODED_BYTES / (1024 * 1024))} MB olabilir.`
        );
    }

    const buf = Buffer.from(temiz, 'base64');
    if (!buf.length) throw new ExcelLimitError('Dosya verisi boş.');
    if (buf.length > MAX_XLSX_DECODED_BYTES) {
        throw new ExcelLimitError(
            `Excel dosyası en fazla ${Math.floor(MAX_XLSX_DECODED_BYTES / (1024 * 1024))} MB olabilir.`
        );
    }
    return buf;
}

function suresiDolanImportlariTemizle(now = Date.now()) {
    for (const [importId, oturum] of IMPORT_OTURUMLARI.entries()) {
        if (!oturum || oturum.expiresAt <= now) IMPORT_OTURUMLARI.delete(importId);
    }
}

function importOturumuKaydet({ kullaniciId, tip, satirlar, sorunlar, uygulanabilir }) {
    suresiDolanImportlariTemizle();
    const importId = crypto.randomUUID();
    IMPORT_OTURUMLARI.set(importId, {
        importId,
        kullaniciId,
        tip,
        satirlar,
        sorunlar,
        uygulanabilir,
        olusturuldu: Date.now(),
        expiresAt: Date.now() + IMPORT_TTL_MS
    });
    return importId;
}

function importOturumuAl(importId) {
    suresiDolanImportlariTemizle();
    const oturum = IMPORT_OTURUMLARI.get(importId);
    if (!oturum) return null;
    if (oturum.expiresAt <= Date.now()) {
        IMPORT_OTURUMLARI.delete(importId);
        return null;
    }
    return oturum;
}

function izinliIlSeti(req) {
    if (req.kullanici.rol !== 'kullanici') return null;
    return new Set(
        db
            .prepare('SELECT il_id FROM kullanici_iller WHERE kullanici_id = ?')
            .all(req.kullanici.id)
            .map((r) => r.il_id)
    );
}

function dogrulamaBaglamiOlustur(req) {
    const tumIller = db.prepare('SELECT id, plaka, il_adi FROM iller').all();
    const ilByPlaka = new Map();
    const ilByNorm = new Map();
    for (const il of tumIller) {
        if (il.plaka !== null && il.plaka !== undefined) ilByPlaka.set(String(Number(il.plaka)), il);
        ilByNorm.set(norm(il.il_adi), il);
    }

    const ilceCache = new Map();
    function ilceEslestir(ilId, ilceAdi) {
        if (!ilId || !ilceAdi) return null;
        if (!ilceCache.has(ilId)) {
            const ilceler = db.prepare('SELECT id, il_id, ilce_adi FROM ilceler WHERE il_id = ?').all(ilId);
            const byExact = new Map();
            const byNorm = new Map();
            for (const ilce of ilceler) {
                byExact.set(String(ilce.ilce_adi).toLocaleLowerCase('tr-TR'), ilce);
                byNorm.set(norm(ilce.ilce_adi), ilce);
            }
            ilceCache.set(ilId, { byExact, byNorm });
        }
        const cache = ilceCache.get(ilId);
        const aranan = String(ilceAdi).trim();
        return cache.byExact.get(aranan.toLocaleLowerCase('tr-TR')) || cache.byNorm.get(norm(aranan)) || null;
    }

    return {
        izinliIller: izinliIlSeti(req),
        ilByPlaka,
        ilByNorm,
        ilEslestir(ad) {
            return ilByNorm.get(norm(ad)) || null;
        },
        ilceEslestir
    };
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
    const buf = base64VerisiniCikar(base64);
    const wb = new ExcelJS.Workbook();
    // @ts-expect-error ExcelJS v4 types expect a pre-generic Node Buffer.
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const rowCount = ws.rowCount || ws.actualRowCount || 0;
    const columnCount = ws.columnCount || ws.actualColumnCount || 0;
    if (rowCount > MAX_EXCEL_ROWS) {
        throw new ExcelLimitError(`Excel dosyası en fazla ${MAX_EXCEL_ROWS} satır içerebilir.`);
    }
    if (columnCount > MAX_EXCEL_COLUMNS) {
        throw new ExcelLimitError(`Excel dosyası en fazla ${MAX_EXCEL_COLUMNS} sütun içerebilir.`);
    }

    const satirlar = [];
    for (let r = 1; r <= rowCount; r++) {
        const row = ws.getRow(r);
        const maxCol = Math.max(ws.actualColumnCount || 0, row.cellCount || 0, row.actualCellCount || 0);
        if (maxCol > MAX_EXCEL_COLUMNS) {
            throw new ExcelLimitError(`Excel dosyası en fazla ${MAX_EXCEL_COLUMNS} sütun içerebilir.`);
        }
        const arr = [];
        for (let c = 1; c <= maxCol; c++) {
            const metin = hucreMetni(row.getCell(c).value);
            if (metin.length > MAX_EXCEL_CELL_LENGTH) {
                throw new ExcelLimitError(
                    `Excel hücreleri en fazla ${MAX_EXCEL_CELL_LENGTH} karakter içerebilir. Satır ${r}, sütun ${c}.`
                );
            }
            arr.push(metin);
        }
        satirlar.push(arr);
    }
    return satirlar;
}

function eksikAlanlarBul(tip, kayit) {
    const eksik = [];
    if (tip === 'il' && !kayit.plaka) eksik.push('plaka');
    if (!kayit.il_adi) eksik.push('il_adi');
    if (tip === 'ilce' && !kayit.ilce_adi) eksik.push('ilce_adi');
    return eksik;
}

function sorunMesaji(tip, eksikAlanlar) {
    if (tip === 'il') {
        if (eksikAlanlar.includes('plaka') && eksikAlanlar.includes('il_adi'))
            return 'Plaka ve il adı boş veya algılanamadı';
        if (eksikAlanlar.includes('plaka')) return 'Plaka boş veya algılanamadı';
        return 'İl adı boş veya algılanamadı';
    }
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

function kritikSorunEkle(sorunlar, satir, sorun, detay = {}) {
    sorunlar.push({ satir, sorun, kritik: true, ...detay });
}

function tcKimlikNoGecerliMi(deger) {
    const rakam = String(deger || '').replace(/\D/g, '');
    if (!/^[1-9][0-9]{10}$/.test(rakam)) return false;
    const haneler = rakam.split('').map((n) => Number(n));
    const tekler = haneler[0] + haneler[2] + haneler[4] + haneler[6] + haneler[8];
    const ciftler = haneler[1] + haneler[3] + haneler[5] + haneler[7];
    const onuncu = (((tekler * 7 - ciftler) % 10) + 10) % 10;
    const onBirinci = haneler.slice(0, 10).reduce((toplam, n) => toplam + n, 0) % 10;
    return haneler[9] === onuncu && haneler[10] === onBirinci;
}

function telefonRakamlariniNormalizeEt(deger) {
    let rakam = String(deger || '').replace(/\D/g, '');
    if (rakam.startsWith('90') && rakam.length === 12) rakam = rakam.slice(2);
    if (rakam.startsWith('0') && rakam.length === 11) rakam = rakam.slice(1);
    return rakam;
}

function telefonGecerliMi(deger) {
    const rakam = telefonRakamlariniNormalizeEt(deger);
    return /^5[0-9]{9}$/.test(rakam);
}

function sosyalUrlGecerliMi(deger, platform) {
    const metin = String(deger || '').trim();
    if (!metin || /\s/.test(metin)) return false;
    try {
        const url = new URL(metin);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        if (url.username || url.password) return false;
        const host = url.hostname.toLowerCase().replace(/\.$/, '');
        return SOSYAL_HOST_ALLOWLIST[platform]?.has(host) || false;
    } catch (_e) {
        return false;
    }
}

function alanUzunluklariniDogrula(kayit, sorunlar, satirNo) {
    for (const [alan, limit] of Object.entries(ALAN_UZUNLUK_LIMITLERI)) {
        if (kayit[alan] === undefined || kayit[alan] === null || kayit[alan] === '') continue;
        if (String(kayit[alan]).length > limit) {
            kritikSorunEkle(sorunlar, satirNo, `${alan} alanı en fazla ${limit} karakter olabilir`, { alan });
        }
    }
}

function hassasVeSosyalAlanlariDogrula(kayit, sorunlar, satirNo) {
    if (kayit.baskan_tc && !tcKimlikNoGecerliMi(kayit.baskan_tc)) {
        kritikSorunEkle(sorunlar, satirNo, 'TC Kimlik No geçersiz', { alan: 'baskan_tc' });
    }
    if (kayit.baskan_telefon && !telefonGecerliMi(kayit.baskan_telefon)) {
        kritikSorunEkle(sorunlar, satirNo, 'Telefon numarası geçersiz', { alan: 'baskan_telefon' });
    }
    for (const [alan, platform] of Object.entries(SOSYAL_PLATFORM_ALANLARI)) {
        if (!kayit[alan]) continue;
        if (!sosyalUrlGecerliMi(kayit[alan], platform)) {
            kritikSorunEkle(sorunlar, satirNo, `${platform} bağlantısı izin verilen alan adında değil`, { alan });
        }
    }
}

function ilSatiriniDogrula(kayit, sorunlar, satirNo, baglam) {
    const plakaMetni = String(kayit.plaka || '').trim();
    if (!/^[0-9]{1,2}$/.test(plakaMetni)) {
        kritikSorunEkle(sorunlar, satirNo, 'Plaka 1-81 arasında sayısal olmalıdır', { alan: 'plaka' });
        return null;
    }

    const plaka = Number(plakaMetni);
    if (!Number.isInteger(plaka) || plaka < 1 || plaka > 81) {
        kritikSorunEkle(sorunlar, satirNo, 'Plaka 1-81 arasında olmalıdır', { alan: 'plaka' });
        return null;
    }

    const il = baglam.ilByPlaka.get(String(plaka));
    if (!il) {
        kritikSorunEkle(sorunlar, satirNo, 'Plaka mevcut bir il ile eşleşmedi', { plaka });
        return null;
    }

    if (norm(il.il_adi) !== norm(kayit.il_adi)) {
        kritikSorunEkle(sorunlar, satirNo, 'Plaka ile il adı eşleşmiyor', {
            plaka,
            il_adi: kayit.il_adi || '',
            beklenenIlAdi: il.il_adi
        });
        return null;
    }

    if (baglam.izinliIller && !baglam.izinliIller.has(il.id)) {
        kritikSorunEkle(sorunlar, satirNo, 'Bu il için yetki yok', { il_adi: il.il_adi });
        return null;
    }

    return { ilId: il.id };
}

function ilceSatiriniDogrula(kayit, sorunlar, satirNo, baglam) {
    const il = baglam.ilEslestir(kayit.il_adi);
    if (!il) {
        kritikSorunEkle(sorunlar, satirNo, 'İl eşleşmedi', { il_adi: kayit.il_adi || '' });
        return null;
    }

    if (baglam.izinliIller && !baglam.izinliIller.has(il.id)) {
        kritikSorunEkle(sorunlar, satirNo, 'Bu il için yetki yok', { il_adi: il.il_adi });
        return null;
    }

    const ilce = baglam.ilceEslestir(il.id, kayit.ilce_adi);
    if (!ilce) {
        kritikSorunEkle(sorunlar, satirNo, 'İlçe eşleşmedi', {
            il_adi: kayit.il_adi || '',
            ilce_adi: kayit.ilce_adi || ''
        });
        return null;
    }

    return { ilId: il.id, ilceId: ilce.id };
}

function satiriDogrula(tip, hamKayit, satirNo, satir, baglam) {
    const sorunlar = [];
    const eksikAlanlar = eksikAlanlarBul(tip, hamKayit);
    if (eksikAlanlar.length) {
        kritikSorunEkle(sorunlar, satirNo, sorunMesaji(tip, eksikAlanlar), {
            eksikAlanlar,
            algilananAlanlar: algilananAlanlar(hamKayit),
            doluHucreSayisi: satir.filter((h) => String(h).trim() !== '').length
        });
    }

    const kayit = kayitFormatla(hamKayit);
    alanUzunluklariniDogrula(kayit, sorunlar, satirNo);
    hassasVeSosyalAlanlariDogrula(kayit, sorunlar, satirNo);

    let hedef = null;
    if (!eksikAlanlar.length) {
        hedef =
            tip === 'il'
                ? ilSatiriniDogrula(kayit, sorunlar, satirNo, baglam)
                : ilceSatiriniDogrula(kayit, sorunlar, satirNo, baglam);
    }

    if (sorunlar.length) return { kayit: null, sorunlar };
    return { kayit: { ...kayit, _satir: satirNo, _hedef: hedef }, sorunlar };
}

function importKaydiniYanitaHazirla(kayit) {
    const disKayit = { ...kayit };
    delete disKayit._hedef;
    return disKayit;
}

// POST /api/excel/onizle - sablon bazli onizleme
router.post('/onizle', tokenDogrula, async (req, res) => {
    const { dosya } = req.body;
    const tip = req.body.tip === 'ilce' ? 'ilce' : 'il';
    if (!dosya) return res.status(400).json({ hata: 'Dosya gereklidir.' });
    let satirlar;
    try {
        satirlar = await dosyaOku(dosya);
    } catch (err) {
        return res.status(400).json({
            hata:
                err instanceof ExcelLimitError
                    ? err.clientMessage
                    : 'Excel dosyası okunamadı. Lütfen indirilen .xlsx şablonunu yükleyin.'
        });
    }
    if (!satirlar.length) return res.status(400).json({ hata: 'Dosya boş.' });

    const baslikKontrolu = sablonBasliklariniDogrula(tip, satirlar[0]);
    if (!baslikKontrolu.ok) {
        return res.status(400).json(baslikKontrolu);
    }

    const sonuclar = [];
    const sorunlar = [];
    const baglam = dogrulamaBaglamiOlustur(req);
    for (let r = 1; r < satirlar.length; r++) {
        const satir = satirlar[r];
        if (satir.every((h) => String(h).trim() === '')) continue;
        const kayit = satirdanKayitOlustur(tip, satir);
        const dogrulama = satiriDogrula(tip, kayit, r + 1, satir, baglam);
        sorunlar.push(...dogrulama.sorunlar);
        if (dogrulama.kayit) sonuclar.push(dogrulama.kayit);
    }

    if (!sonuclar.length && !sorunlar.length) {
        kritikSorunEkle(sorunlar, 0, 'Aktarılacak kayıt bulunamadı');
    }

    const uygulanabilir = sonuclar.length > 0 && !sorunlar.some((s) => s.kritik);
    const importId = importOturumuKaydet({
        kullaniciId: req.kullanici.id,
        tip,
        satirlar: sonuclar,
        sorunlar,
        uygulanabilir
    });

    res.json({
        importId,
        tip,
        toplam: sonuclar.length,
        sonuclar: sonuclar.map(importKaydiniYanitaHazirla),
        sorunlar,
        sablon: tip,
        uygulanabilir,
        ttlSaniye: Math.floor(IMPORT_TTL_MS / 1000)
    });
});

// POST /api/excel/uygula
router.post('/uygula', tokenDogrula, (req, res) => {
    const importId = typeof req.body.importId === 'string' ? req.body.importId.trim() : '';
    const tip = req.body.tip === 'il' || req.body.tip === 'ilce' ? req.body.tip : null;
    if (!importId || !tip) return res.status(400).json({ hata: 'importId ve tip gereklidir.' });

    const oturum = importOturumuAl(importId);
    if (!oturum) return res.status(410).json({ hata: 'Import oturumu bulunamadı veya süresi doldu.' });
    if (oturum.kullaniciId !== req.kullanici.id) {
        return res.status(403).json({ hata: 'Import oturumu bu kullanıcıya ait değil.' });
    }
    if (oturum.tip !== tip) return res.status(403).json({ hata: 'Import tipi eşleşmiyor.' });
    if (!oturum.uygulanabilir) {
        return res.status(409).json({
            hata: 'Önizlemede kritik sorunlar var; hiçbir kayıt uygulanmadı.',
            sorunlar: oturum.sorunlar
        });
    }

    const izinliIller = izinliIlSeti(req);
    const ilVarMiSorgu = db.prepare('SELECT 1 FROM iller WHERE id = ?');
    const ilceVarMiSorgu = db.prepare('SELECT 1 FROM ilceler WHERE id = ? AND il_id = ?');
    for (const kayit of oturum.satirlar) {
        const hedef = kayit._hedef || {};
        if (izinliIller && !izinliIller.has(hedef.ilId)) {
            return res.status(403).json({ hata: 'Bu il için yetki yok; hiçbir kayıt uygulanmadı.' });
        }
        const hedefVarMi = tip === 'il' ? ilVarMiSorgu.get(hedef.ilId) : ilceVarMiSorgu.get(hedef.ilceId, hedef.ilId);
        if (!hedefVarMi) {
            return res.status(409).json({ hata: 'Hedef kayıtlar değişmiş; lütfen dosyayı yeniden önizleyin.' });
        }
    }

    const ilGuncelle = db.prepare(
        `UPDATE iller SET
        baskan_ad_soyad=COALESCE(?,baskan_ad_soyad), baskan_telefon=COALESCE(?,baskan_telefon),
        baskan_tc=COALESCE(?,baskan_tc), instagram_url=COALESCE(?,instagram_url),
        twitter_url=COALESCE(?,twitter_url), facebook_url=COALESCE(?,facebook_url), tiktok_url=COALESCE(?,tiktok_url)
        WHERE id=?`
    );
    const ilceGuncelle = db.prepare(
        `UPDATE ilceler SET
        baskan_ad_soyad=COALESCE(?,baskan_ad_soyad), baskan_telefon=COALESCE(?,baskan_telefon),
        baskan_tc=COALESCE(?,baskan_tc), instagram_url=COALESCE(?,instagram_url),
        twitter_url=COALESCE(?,twitter_url), facebook_url=COALESCE(?,facebook_url), tiktok_url=COALESCE(?,tiktok_url)
        WHERE id=? AND il_id=?`
    );

    let basarili = 0;
    let ilceBasarili = 0;
    try {
        db.withTransaction(() => {
            for (const k of oturum.satirlar) {
                const hedef = k._hedef || {};
                const sonuc =
                    tip === 'il'
                        ? ilGuncelle.run(
                              k.baskan_ad_soyad || null,
                              k.baskan_telefon || null,
                              k.baskan_tc || null,
                              k.instagram_url || null,
                              k.twitter_url || null,
                              k.facebook_url || null,
                              k.tiktok_url || null,
                              hedef.ilId
                          )
                        : ilceGuncelle.run(
                              k.baskan_ad_soyad || null,
                              k.baskan_telefon || null,
                              k.baskan_tc || null,
                              k.instagram_url || null,
                              k.twitter_url || null,
                              k.facebook_url || null,
                              k.tiktok_url || null,
                              hedef.ilceId,
                              hedef.ilId
                          );
                if (sonuc.changes === 0) throw new Error('Hedef kayıt bulunamadı');
                if (tip === 'il') basarili++;
                else ilceBasarili++;
            }
        });
    } catch (_e) {
        return res.status(409).json({ hata: 'Kayıtlar uygulanamadı; hiçbir kayıt güncellenmedi.' });
    }

    IMPORT_OTURUMLARI.delete(importId);
    const parcalar = [];
    if (basarili > 0) parcalar.push(basarili + ' il güncellendi');
    if (ilceBasarili > 0) parcalar.push(ilceBasarili + ' ilçe güncellendi');
    const mesaj = parcalar.length ? parcalar.join(', ') + '.' : 'Hiç kayıt güncellenmedi.';
    res.json({ mesaj, basarili: basarili + ilceBasarili, ilceBasarili, atlanan: 0, sorunlar: [] });
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
