const fs = require('fs');
const path = require('path');

const DOSYA_ADI_PATTERN = /^[a-f0-9]{24}\.(jpg|jpeg|png|webp)$/i;
const mimeTipleri = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
};

function addColumnIfMissing(db, helpers, table, column, ddl) {
    if (!helpers.tableExists(db, table)) return;
    if (!helpers.columns(db, table).includes(column)) {
        db.exec(`ALTER TABLE ${helpers.quoteIdentifier(table)} ADD COLUMN ${ddl}`);
    }
}

function uploadDosyaAdiCikar(deger) {
    const ham = String(deger || '').trim();
    if (!ham) return '';

    let aday = ham;
    try {
        const url = new URL(ham, 'http://panel.local');
        const index = url.pathname.lastIndexOf('/uploads/');
        if (index >= 0)
            aday =
                url.pathname
                    .slice(index + '/uploads/'.length)
                    .split('/')
                    .pop() || '';
    } catch (_e) {}

    if (aday.startsWith('/uploads/')) aday = aday.split('/').pop() || '';
    if (!DOSYA_ADI_PATTERN.test(aday)) return '';
    return aday;
}

function dosyaBilgisiAl(dosyaAdi) {
    const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..');
    const adayDizinler = [path.join(dataDir, 'uploads'), path.join(__dirname, '..', '..', 'public', 'uploads')];
    const mime = mimeTipleri[path.extname(dosyaAdi).toLowerCase()] || 'application/octet-stream';

    for (const dizin of adayDizinler) {
        try {
            const stat = fs.statSync(path.join(dizin, dosyaAdi));
            if (stat.isFile()) return { mime, boyut: stat.size };
        } catch (_e) {}
    }

    return { mime, boyut: 0 };
}

function uploadKaydiBackfill(db, dosyaAdi, scope, entityType, entityId) {
    if (!dosyaAdi) return;
    const dosya = dosyaBilgisiAl(dosyaAdi);
    db.prepare(
        `
        INSERT INTO uploads (dosya_adi, kullanici_id, mime, boyut, scope, entity_type, entity_id)
        VALUES (?, NULL, ?, ?, ?, ?, ?)
        ON CONFLICT(dosya_adi) DO UPDATE SET
            scope = excluded.scope,
            entity_type = excluded.entity_type,
            entity_id = excluded.entity_id,
            mime = excluded.mime,
            boyut = CASE WHEN uploads.boyut > 0 THEN uploads.boyut ELSE excluded.boyut END
    `
    ).run(dosyaAdi, dosya.mime, dosya.boyut, scope, entityType, entityId);
}

function uploadReferanslariniBackfill(db) {
    for (const il of db.prepare("SELECT id, baskan_foto FROM iller WHERE COALESCE(baskan_foto, '') != ''").all()) {
        uploadKaydiBackfill(db, uploadDosyaAdiCikar(il.baskan_foto), 'entity', 'il', il.id);
    }

    for (const ilce of db.prepare("SELECT id, baskan_foto FROM ilceler WHERE COALESCE(baskan_foto, '') != ''").all()) {
        uploadKaydiBackfill(db, uploadDosyaAdiCikar(ilce.baskan_foto), 'entity', 'ilce', ilce.id);
    }

    for (const kullanici of db
        .prepare("SELECT id, profil_foto FROM kullanicilar WHERE COALESCE(profil_foto, '') != ''")
        .all()) {
        uploadKaydiBackfill(db, uploadDosyaAdiCikar(kullanici.profil_foto), 'profile', 'profil', kullanici.id);
    }
}

module.exports = {
    id: '004_upload_entity_metadata_and_login_limits',
    description: 'Upload entity metadata backfill ve login attempt IP limit indexlerini ekler.',
    up(db, helpers) {
        addColumnIfMissing(db, helpers, 'uploads', 'scope', "scope TEXT NOT NULL DEFAULT 'general'");
        addColumnIfMissing(db, helpers, 'uploads', 'entity_type', 'entity_type TEXT');
        addColumnIfMissing(db, helpers, 'uploads', 'entity_id', 'entity_id INTEGER');

        if (helpers.tableExists(db, 'uploads')) {
            uploadReferanslariniBackfill(db);
            db.exec('CREATE INDEX IF NOT EXISTS idx_uploads_scope_entity ON uploads(scope, entity_type, entity_id)');
        }

        if (helpers.tableExists(db, 'login_attempts')) {
            addColumnIfMissing(db, helpers, 'login_attempts', 'guncellenme_tarihi', 'guncellenme_tarihi DATETIME');
            db.exec('UPDATE login_attempts SET guncellenme_tarihi = COALESCE(guncellenme_tarihi, CURRENT_TIMESTAMP)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_ilk ON login_attempts(ip, ilk_deneme_ms)');
        }
    }
};
