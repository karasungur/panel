const fs = require('fs');
const path = require('path');
const db = require('../database/db');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'database');
const uploadDir = path.join(dataDir, 'uploads');
const legacyUploadDir = path.join(__dirname, '..', 'public', 'uploads');

const UPLOAD_METADATA_TABLOLARI = ['uploads', 'upload_metadata'];
const SAHIP_KOLONLARI = ['owner_user_id', 'kullanici_id'];
const BOYUT_KOLONLARI = ['size', 'boyut'];
const TARIH_KOLONLARI = ['olusturulma_tarihi', 'created_at', 'created'];
const DOSYA_ADI_PATTERN = /^[a-f0-9]{24}\.(jpg|jpeg|png|webp)$/i;
let uploadMetadataSemasiCache = null;

const mimeTipleri = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
};

function sqlKimlik(kimlik) {
    return '"' + kimlik.replace(/"/g, '""') + '"';
}

function ilkVarOlanKolon(kolonlar, adaylar) {
    return adaylar.find((kolon) => kolonlar.has(kolon)) || null;
}

function uploadMetadataSemasiAl() {
    if (uploadMetadataSemasiCache) return uploadMetadataSemasiCache;

    for (const tablo of UPLOAD_METADATA_TABLOLARI) {
        const kolonBilgisi = db.prepare(`PRAGMA table_info(${sqlKimlik(tablo)})`).all();
        if (!kolonBilgisi.length) continue;

        const kolonlar = new Set(kolonBilgisi.map((kolon) => kolon.name));
        const sahipKolonu = ilkVarOlanKolon(kolonlar, SAHIP_KOLONLARI);
        const boyutKolonu = ilkVarOlanKolon(kolonlar, BOYUT_KOLONLARI);
        const tarihKolonu = ilkVarOlanKolon(kolonlar, TARIH_KOLONLARI);

        if (kolonlar.has('dosya_adi') && kolonlar.has('mime') && sahipKolonu && boyutKolonu) {
            uploadMetadataSemasiCache = {
                tablo,
                kolonlar,
                sahipKolonu,
                boyutKolonu,
                tarihKolonu,
                scopeKolonu: kolonlar.has('scope') ? 'scope' : null,
                entityTypeKolonu: kolonlar.has('entity_type') ? 'entity_type' : null,
                entityIdKolonu: kolonlar.has('entity_id') ? 'entity_id' : null
            };
            return uploadMetadataSemasiCache;
        }
    }

    return null;
}

function uploadDosyaAdiCikar(deger) {
    const ham = String(deger || '').trim();
    if (!ham) return '';

    let aday = ham;
    try {
        const url = new URL(ham, 'http://panel.local');
        if (url.pathname.startsWith('/uploads/')) aday = url.pathname.split('/').pop() || '';
    } catch (_e) {}

    if (aday.startsWith('/uploads/')) aday = aday.split('/').pop() || '';
    if (!DOSYA_ADI_PATTERN.test(aday)) return '';
    return aday;
}

function dosyaBilgisiAl(dosyaAdi) {
    const uzanti = path.extname(dosyaAdi).toLowerCase();
    const mime = mimeTipleri[uzanti] || 'application/octet-stream';
    for (const dizin of [uploadDir, legacyUploadDir]) {
        try {
            const stat = fs.statSync(path.join(dizin, dosyaAdi));
            if (stat.isFile()) return { mime, boyut: stat.size };
        } catch (_e) {}
    }
    return { mime, boyut: 0 };
}

function uploadMetadataKaydiAl(dosyaAdi) {
    const sema = uploadMetadataSemasiAl();
    if (!sema) return null;

    const secilecekler = [
        `${sqlKimlik(sema.sahipKolonu)} AS owner_user_id`,
        sema.scopeKolonu ? `${sqlKimlik(sema.scopeKolonu)} AS scope` : 'NULL AS scope',
        sema.entityTypeKolonu ? `${sqlKimlik(sema.entityTypeKolonu)} AS entity_type` : 'NULL AS entity_type',
        sema.entityIdKolonu ? `${sqlKimlik(sema.entityIdKolonu)} AS entity_id` : 'NULL AS entity_id'
    ];

    return db
        .prepare(
            `
            SELECT ${secilecekler.join(', ')}
            FROM ${sqlKimlik(sema.tablo)}
            WHERE dosya_adi = ?
        `
        )
        .get(dosyaAdi);
}

function uploadMetadataKaydet(dosyaAdi, kullaniciId, mime, boyut) {
    const sema = uploadMetadataSemasiAl();
    if (!sema) return false;

    const kolonlar = ['dosya_adi', sema.sahipKolonu, 'mime', sema.boyutKolonu];
    const degerler = [dosyaAdi, kullaniciId, mime, boyut];
    const guncellemeler = [
        `${sqlKimlik(sema.sahipKolonu)} = excluded.${sqlKimlik(sema.sahipKolonu)}`,
        'mime = excluded.mime',
        `${sqlKimlik(sema.boyutKolonu)} = excluded.${sqlKimlik(sema.boyutKolonu)}`
    ];

    if (sema.scopeKolonu) {
        kolonlar.push(sema.scopeKolonu);
        degerler.push('owner');
        guncellemeler.push(`${sqlKimlik(sema.scopeKolonu)} = excluded.${sqlKimlik(sema.scopeKolonu)}`);
    }

    db.prepare(
        `
        INSERT INTO ${sqlKimlik(sema.tablo)}
            (${kolonlar.map(sqlKimlik).join(', ')})
        VALUES (${kolonlar.map(() => '?').join(', ')})
        ON CONFLICT(dosya_adi) DO UPDATE SET
            ${guncellemeler.join(', ')}
    `
    ).run(...degerler);

    return true;
}

function uploadMetadataIliskilendir(url, { scope, entityType, entityId }) {
    const dosyaAdi = uploadDosyaAdiCikar(url);
    if (!dosyaAdi) return false;

    const sema = uploadMetadataSemasiAl();
    if (!sema || !sema.scopeKolonu || !sema.entityTypeKolonu || !sema.entityIdKolonu) return false;

    const dosya = dosyaBilgisiAl(dosyaAdi);
    db.prepare(
        `
        INSERT INTO ${sqlKimlik(sema.tablo)}
            (dosya_adi, ${sqlKimlik(sema.sahipKolonu)}, mime, ${sqlKimlik(sema.boyutKolonu)},
             ${sqlKimlik(sema.scopeKolonu)}, ${sqlKimlik(sema.entityTypeKolonu)}, ${sqlKimlik(sema.entityIdKolonu)})
        VALUES (?, NULL, ?, ?, ?, ?, ?)
        ON CONFLICT(dosya_adi) DO UPDATE SET
            mime = excluded.mime,
            ${sqlKimlik(sema.boyutKolonu)} =
                CASE
                    WHEN ${sqlKimlik(sema.tablo)}.${sqlKimlik(sema.boyutKolonu)} > 0
                    THEN ${sqlKimlik(sema.tablo)}.${sqlKimlik(sema.boyutKolonu)}
                    ELSE excluded.${sqlKimlik(sema.boyutKolonu)}
                END,
            ${sqlKimlik(sema.scopeKolonu)} = excluded.${sqlKimlik(sema.scopeKolonu)},
            ${sqlKimlik(sema.entityTypeKolonu)} = excluded.${sqlKimlik(sema.entityTypeKolonu)},
            ${sqlKimlik(sema.entityIdKolonu)} = excluded.${sqlKimlik(sema.entityIdKolonu)}
    `
    ).run(dosyaAdi, dosya.mime, dosya.boyut, scope, entityType, entityId);

    return true;
}

module.exports = {
    DOSYA_ADI_PATTERN,
    uploadDosyaAdiCikar,
    uploadMetadataIliskilendir,
    uploadMetadataKaydet,
    uploadMetadataKaydiAl,
    uploadMetadataSemasiAl
};
