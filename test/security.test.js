const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const jwt = require('jsonwebtoken');

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function restoreEnv(previous) {
    for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

async function startTestServer(t, envOverrides = {}) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-security-'));
    const previousEnv = {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        APP_ORIGIN: process.env.APP_ORIGIN,
        CORS_ORIGINS: process.env.CORS_ORIGINS,
        CORS_ALLOWLIST: process.env.CORS_ALLOWLIST,
        TRUST_PROXY: process.env.TRUST_PROXY,
        DATA_DIR: process.env.DATA_DIR,
        BACKUP_DIR: process.env.BACKUP_DIR,
        ADMIN_KULLANICI_ADI: process.env.ADMIN_KULLANICI_ADI,
        ADMIN_SIFRE: process.env.ADMIN_SIFRE,
        JWT_SECRET: process.env.JWT_SECRET,
        AUTH_COOKIE_SECURE: process.env.AUTH_COOKIE_SECURE,
        AUTH_COOKIE_SAMESITE: process.env.AUTH_COOKIE_SAMESITE,
        UPLOAD_DAILY_LIMIT: process.env.UPLOAD_DAILY_LIMIT,
        UPLOAD_TOTAL_BYTES_LIMIT: process.env.UPLOAD_TOTAL_BYTES_LIMIT,
        LOGIN_IP_KEY_LIMIT: process.env.LOGIN_IP_KEY_LIMIT
    };

    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.APP_ORIGIN = '';
    process.env.CORS_ORIGINS = '';
    process.env.CORS_ALLOWLIST = '';
    process.env.TRUST_PROXY = '1';
    process.env.DATA_DIR = path.join(tmpDir, 'data');
    process.env.BACKUP_DIR = path.join(tmpDir, 'backups');
    process.env.ADMIN_KULLANICI_ADI = 'security-admin';
    process.env.ADMIN_SIFRE = 'security-admin-password';
    process.env.JWT_SECRET = 'k9Vn4pQ7rT2xM8bL5cZ1aH6dF3wY0uS8';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAMESITE = 'lax';
    process.env.UPLOAD_DAILY_LIMIT = '1';
    process.env.UPLOAD_TOTAL_BYTES_LIMIT = '100';
    process.env.LOGIN_IP_KEY_LIMIT = '3';
    for (const [key, value] of Object.entries(envOverrides)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }

    for (const modulePath of [
        '../server',
        '../database/db',
        '../database/seed',
        '../middleware/auth',
        '../utils/upload-metadata',
        '../routes/auth',
        '../routes/yukle',
        '../routes/iller',
        '../routes/ilceler',
        '../routes/kullanicilar',
        '../routes/excel',
        '../routes/gorevler',
        '../routes/chat',
        '../routes/notlar',
        '../routes/bildirimler',
        '../routes/ozel-mesaj'
    ]) {
        try {
            delete require.cache[require.resolve(modulePath)];
        } catch (_) {}
    }

    require('../database/seed');
    const app = require('../server');
    const server = await new Promise((resolve, reject) => {
        const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
        listeningServer.once('error', reject);
    });

    t.after(async () => {
        await new Promise((resolve) => server.close(resolve));
        try {
            require('../database/db').close();
        } catch (_) {}
        restoreEnv(previousEnv);
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const { port } = server.address();
    return {
        baseUrl: `http://127.0.0.1:${port}`,
        async login(password = process.env.ADMIN_SIFRE, kullaniciAdi = process.env.ADMIN_KULLANICI_ADI) {
            const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kullanici_adi: kullaniciAdi,
                    sifre: password
                })
            });
            assert.equal(response.status, 200);
            const setCookie = response.headers.get('set-cookie') || '';
            assert.match(setCookie, /panel_oturum=/);
            assert.match(setCookie, /HttpOnly/i);
            const body = await response.json();
            assert.equal(Object.hasOwn(body, 'token'), false);
            assert.equal(typeof body.kullanici, 'object');
            return {
                cookie: setCookie.split(';')[0],
                kullanici: body.kullanici
            };
        }
    };
}

function cookieHeaders(session, extra = {}) {
    return { Cookie: session.cookie, ...extra };
}

function testKullanicisiOlustur(kullaniciAdi, sifre, rol = 'kullanici') {
    const db = require('../database/db');
    db.prepare('INSERT INTO kullanicilar (kullanici_adi, sifre, rol, ad_soyad) VALUES (?, ?, ?, ?)').run(
        kullaniciAdi,
        bcrypt.hashSync(sifre, 10),
        rol,
        kullaniciAdi
    );
    return db.prepare('SELECT * FROM kullanicilar WHERE kullanici_adi = ?').get(kullaniciAdi);
}

function bearerTokenOlustur(kullanici) {
    return jwt.sign(
        {
            id: kullanici.id,
            kullanici_adi: kullanici.kullanici_adi,
            rol: kullanici.rol,
            tokenVersion: Number(kullanici.token_version) || 0
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
    );
}

async function pngYukle(baseUrl, session) {
    return fetch(`${baseUrl}/api/yukle`, {
        method: 'POST',
        headers: cookieHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            dosya: `data:image/png;base64,${PNG_1X1_BASE64}`
        })
    });
}

async function workbookBase64(satirlar) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Veriler');
    satirlar.forEach((satir) => ws.addRow(satir));
    return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
}

const IL_BASLIKLAR = [
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

const ILCE_BASLIKLAR = [
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

test('auth cors supports credentialed allowed origins', async (t) => {
    const allowedOrigin = 'https://panel.example.test';
    const ctx = await startTestServer(t, { APP_ORIGIN: allowedOrigin });

    const preflight = await fetch(`${ctx.baseUrl}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
            Origin: allowedOrigin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type, Authorization'
        }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), allowedOrigin);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
    const preflightAllowedHeaders = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase();
    assert.match(preflightAllowedHeaders, /content-type/);
    assert.match(preflightAllowedHeaders, /authorization/);

    const login = await fetch(`${ctx.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
            Origin: allowedOrigin,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            kullanici_adi: process.env.ADMIN_KULLANICI_ADI,
            sifre: process.env.ADMIN_SIFRE
        })
    });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('access-control-allow-origin'), allowedOrigin);
    assert.equal(login.headers.get('access-control-allow-credentials'), 'true');
    assert.match(login.headers.get('set-cookie') || '', /panel_oturum=/);
    const loginBody = await login.json();
    assert.equal(Object.hasOwn(loginBody, 'token'), false);

    const blocked = await fetch(`${ctx.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
            Origin: 'https://blocked.example.test',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            kullanici_adi: process.env.ADMIN_KULLANICI_ADI,
            sifre: process.env.ADMIN_SIFRE
        })
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.kod, 'CORS_NOT_ALLOWED');
});

test('authorization bearer takes precedence over cookie tokens', async (t) => {
    const ctx = await startTestServer(t);
    const cookieUser = testKullanicisiOlustur('cookie-user', 'cookie-user-password');
    const bearerUser = testKullanicisiOlustur('bearer-user', 'bearer-user-password');
    const cookieSession = await ctx.login('cookie-user-password', 'cookie-user');
    const bearerToken = bearerTokenOlustur(bearerUser);

    const cookieOnly = await fetch(`${ctx.baseUrl}/api/auth/me`, {
        headers: cookieHeaders(cookieSession)
    });
    assert.equal(cookieOnly.status, 200);
    assert.equal((await cookieOnly.json()).id, cookieUser.id);

    const bearerOnly = await fetch(`${ctx.baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${bearerToken}` }
    });
    assert.equal(bearerOnly.status, 200);
    assert.equal((await bearerOnly.json()).id, bearerUser.id);

    const differentUsers = await fetch(`${ctx.baseUrl}/api/auth/me`, {
        headers: cookieHeaders(cookieSession, { Authorization: `Bearer ${bearerToken}` })
    });
    assert.equal(differentUsers.status, 200);
    assert.equal((await differentUsers.json()).id, bearerUser.id);

    const invalidBearer = await fetch(`${ctx.baseUrl}/api/auth/me`, {
        headers: cookieHeaders(cookieSession, { Authorization: 'Bearer invalid-token' })
    });
    assert.equal(invalidBearer.status, 401);

    const db = require('../database/db');
    db.prepare('UPDATE kullanicilar SET token_version = token_version + 1 WHERE id = ?').run(cookieUser.id);

    const staleCookieOnly = await fetch(`${ctx.baseUrl}/api/auth/me`, {
        headers: cookieHeaders(cookieSession)
    });
    assert.equal(staleCookieOnly.status, 401);

    const staleCookieWithBearer = await fetch(`${ctx.baseUrl}/api/auth/me`, {
        headers: cookieHeaders(cookieSession, { Authorization: `Bearer ${bearerToken}` })
    });
    assert.equal(staleCookieWithBearer.status, 200);
    assert.equal((await staleCookieWithBearer.json()).id, bearerUser.id);

    const withoutCredentials = await fetch(`${ctx.baseUrl}/api/auth/me`);
    assert.equal(withoutCredentials.status, 401);
});

test('security integration flows', async (t) => {
    const ctx = await startTestServer(t);
    const adminSession = await ctx.login();

    const legacyLogin = await fetch(`${ctx.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            kullanici_adi: process.env.ADMIN_KULLANICI_ADI,
            sifre: process.env.ADMIN_SIFRE,
            ozel_anahtar: 'ignored-legacy-value'
        })
    });
    assert.equal(legacyLogin.status, 200);
    assert.match(legacyLogin.headers.get('set-cookie') || '', /HttpOnly/i);

    const unauthenticated = await fetch(`${ctx.baseUrl}/uploads/aaaaaaaaaaaaaaaaaaaaaaaa.jpg`);
    assert.equal(unauthenticated.status, 401);

    const spoofed = await fetch(`${ctx.baseUrl}/api/yukle`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            dosya: `data:image/png;base64,${Buffer.from('not a png').toString('base64')}`
        })
    });
    assert.equal(spoofed.status, 400);

    const birinciKullanici = testKullanicisiOlustur('upload-user-1', 'upload-user-password-1');
    const ikinciKullanici = testKullanicisiOlustur('upload-user-2', 'upload-user-password-2');
    testKullanicisiOlustur('upload-user-3', 'upload-user-password-3');
    const birinciSession = await ctx.login('upload-user-password-1', 'upload-user-1');
    const ikinciSession = await ctx.login('upload-user-password-2', 'upload-user-2');
    const ucuncuSession = await ctx.login('upload-user-password-3', 'upload-user-3');

    const upload = await pngYukle(ctx.baseUrl, birinciSession);
    assert.equal(upload.status, 200);
    const uploadBody = await upload.json();
    assert.match(uploadBody.url, /^\/uploads\/[a-f0-9]{24}\.png$/);

    const db = require('../database/db');
    const dosyaAdi = path.basename(uploadBody.url);
    const metadata = db
        .prepare('SELECT dosya_adi, kullanici_id, mime, boyut FROM uploads WHERE dosya_adi = ?')
        .get(dosyaAdi);
    assert.deepEqual(
        { ...metadata },
        {
            dosya_adi: dosyaAdi,
            kullanici_id: birinciKullanici.id,
            mime: 'image/png',
            boyut: Buffer.from(PNG_1X1_BASE64, 'base64').length
        }
    );

    const staleAttemptKey = 'stale-ip:stale-user';
    db.prepare(
        `
        INSERT INTO login_attempts (anahtar, ip, kullanici_adi, sayi, ilk_deneme_ms, kilitli_kadar_ms)
        VALUES (?, '203.0.113.10', 'stale-user', 1, ?, 0)
    `
    ).run(staleAttemptKey, Date.now() - 31 * 60 * 1000);
    for (let i = 0; i < 3; i++) {
        const failedLogin = await fetch(`${ctx.baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kullanici_adi: `missing-login-${i}`, sifre: 'wrong-password' })
        });
        assert.equal(failedLogin.status, 401);
    }
    assert.equal(db.prepare('SELECT COUNT(*) s FROM login_attempts WHERE anahtar = ?').get(staleAttemptKey).s, 0);
    const cappedLogin = await fetch(`${ctx.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kullanici_adi: 'missing-login-3', sifre: 'wrong-password' })
    });
    assert.equal(cappedLogin.status, 429);
    assert.equal(
        db.prepare("SELECT COUNT(*) s FROM login_attempts WHERE kullanici_adi LIKE 'missing-login-%'").get().s,
        3
    );

    const ownUpload = await fetch(`${ctx.baseUrl}${uploadBody.url}`, {
        headers: cookieHeaders(birinciSession)
    });
    assert.equal(ownUpload.status, 200);

    const otherUserUpload = await fetch(`${ctx.baseUrl}${uploadBody.url}`, {
        headers: cookieHeaders(ikinciSession)
    });
    assert.equal(otherUserUpload.status, 403);

    const adminUpload = await fetch(`${ctx.baseUrl}${uploadBody.url}`, {
        headers: cookieHeaders(adminSession)
    });
    assert.equal(adminUpload.status, 200);

    const paylasilanIl = db.prepare('SELECT id FROM iller ORDER BY id LIMIT 1').get();
    db.prepare('INSERT OR IGNORE INTO kullanici_iller (kullanici_id, il_id) VALUES (?, ?)').run(
        ikinciKullanici.id,
        paylasilanIl.id
    );
    const ilFotoGuncelle = await fetch(`${ctx.baseUrl}/api/iller/${paylasilanIl.id}`, {
        method: 'PUT',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ baskan_foto: uploadBody.url })
    });
    assert.equal(ilFotoGuncelle.status, 200);
    assert.deepEqual(
        { ...db.prepare('SELECT scope, entity_type, entity_id FROM uploads WHERE dosya_adi = ?').get(dosyaAdi) },
        { scope: 'entity', entity_type: 'il', entity_id: paylasilanIl.id }
    );
    const sharedIlUpload = await fetch(`${ctx.baseUrl}${uploadBody.url}`, {
        headers: cookieHeaders(ikinciSession)
    });
    assert.equal(sharedIlUpload.status, 200);
    const unassignedSharedIlUpload = await fetch(`${ctx.baseUrl}${uploadBody.url}`, {
        headers: cookieHeaders(ucuncuSession)
    });
    assert.equal(unassignedSharedIlUpload.status, 403);

    const legacyDosyaAdi = 'cccccccccccccccccccccccc.png';
    fs.mkdirSync(path.join(process.env.DATA_DIR, 'uploads'), { recursive: true });
    fs.writeFileSync(path.join(process.env.DATA_DIR, 'uploads', legacyDosyaAdi), Buffer.from(PNG_1X1_BASE64, 'base64'));
    db.prepare('INSERT INTO ilceler (il_id, ilce_adi, baskan_foto) VALUES (?, ?, ?)').run(
        paylasilanIl.id,
        'Legacy Upload Test',
        '/uploads/' + legacyDosyaAdi
    );
    const legacySharedUpload = await fetch(`${ctx.baseUrl}/uploads/${legacyDosyaAdi}`, {
        headers: cookieHeaders(ikinciSession)
    });
    assert.equal(legacySharedUpload.status, 200);
    const legacyUnassignedUpload = await fetch(`${ctx.baseUrl}/uploads/${legacyDosyaAdi}`, {
        headers: cookieHeaders(ucuncuSession)
    });
    assert.equal(legacyUnassignedUpload.status, 403);

    const legacyProfilDosyaAdi = 'dddddddddddddddddddddddd.png';
    fs.writeFileSync(
        path.join(process.env.DATA_DIR, 'uploads', legacyProfilDosyaAdi),
        Buffer.from(PNG_1X1_BASE64, 'base64')
    );
    db.prepare('UPDATE kullanicilar SET profil_foto = ? WHERE id = ?').run(
        '/uploads/' + legacyProfilDosyaAdi,
        birinciKullanici.id
    );
    const legacyProfilUpload = await fetch(`${ctx.baseUrl}/uploads/${legacyProfilDosyaAdi}`, {
        headers: cookieHeaders(ucuncuSession)
    });
    assert.equal(legacyProfilUpload.status, 200);

    const adminKullanici = db
        .prepare('SELECT * FROM kullanicilar WHERE kullanici_adi = ?')
        .get(process.env.ADMIN_KULLANICI_ADI);
    const queryTokenUpload = await fetch(
        `${ctx.baseUrl}${uploadBody.url}?token=${encodeURIComponent(bearerTokenOlustur(adminKullanici))}`
    );
    assert.equal(queryTokenUpload.status, 401);

    const dailyLimitedUpload = await pngYukle(ctx.baseUrl, birinciSession);
    assert.equal(dailyLimitedUpload.status, 429);

    db.prepare(
        `
        INSERT INTO uploads (dosya_adi, kullanici_id, mime, boyut, olusturulma_tarihi)
        VALUES ('bbbbbbbbbbbbbbbbbbbbbbbb.png', ?, 'image/png', 80, datetime('now', '-2 days'))
    `
    ).run(ikinciKullanici.id);
    const quotaLimitedUpload = await pngYukle(ctx.baseUrl, ikinciSession);
    assert.equal(quotaLimitedUpload.status, 413);

    const note = await fetch(`${ctx.baseUrl}/api/notlar`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            baslik: '<img src=x onerror=alert(1)>Başlık',
            icerik: '<h1>Merhaba</h1><script>alert(1)</script><a href="javascript:alert(1)">x</a>'
        })
    });
    assert.equal(note.status, 201);
    const noteBody = await note.json();
    assert.doesNotMatch(noteBody.baslik, /onerror|<img/i);
    assert.doesNotMatch(noteBody.icerik, /script|javascript:/i);
    assert.match(noteBody.icerik, /<h1>Merhaba<\/h1>/);

    const ilSablonu = await fetch(`${ctx.baseUrl}/api/excel/sablon?tip=il`, {
        headers: cookieHeaders(adminSession)
    });
    assert.equal(ilSablonu.status, 200);
    const ilSablonuBase64 = Buffer.from(await ilSablonu.arrayBuffer()).toString('base64');
    const ilOnizleme = await fetch(`${ctx.baseUrl}/api/excel/onizle`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ dosya: ilSablonuBase64, tip: 'il' })
    });
    assert.equal(ilOnizleme.status, 200);
    const ilOnizlemeBody = await ilOnizleme.json();
    assert.equal(ilOnizlemeBody.sablon, 'il');
    assert.equal(ilOnizlemeBody.uygulanabilir, true);
    assert.equal(typeof ilOnizlemeBody.importId, 'string');
    assert.equal(ilOnizlemeBody.toplam, 1);
    assert.equal(ilOnizlemeBody.sonuclar[0].il_adi, 'Ordu');
    assert.equal(Object.hasOwn(ilOnizlemeBody.sonuclar[0], '_hedef'), false);

    const rawUygula = await fetch(`${ctx.baseUrl}/api/excel/uygula`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sonuclar: ilOnizlemeBody.sonuclar, tip: 'il' })
    });
    assert.equal(rawUygula.status, 400);

    const tipUyusmazligi = await fetch(`${ctx.baseUrl}/api/excel/uygula`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ importId: ilOnizlemeBody.importId, tip: 'ilce' })
    });
    assert.equal(tipUyusmazligi.status, 403);

    const ilUygula = await fetch(`${ctx.baseUrl}/api/excel/uygula`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ importId: ilOnizlemeBody.importId, tip: 'il' })
    });
    assert.equal(ilUygula.status, 200);
    const ilUygulaBody = await ilUygula.json();
    assert.equal(ilUygulaBody.basarili, 1);

    const tekrarUygula = await fetch(`${ctx.baseUrl}/api/excel/uygula`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ importId: ilOnizlemeBody.importId, tip: 'il' })
    });
    assert.equal(tekrarUygula.status, 410);

    const tutarsizIlBase64 = await workbookBase64([IL_BASLIKLAR, ['52', 'Ankara', '', '', '', '', '', '', '']]);
    const tutarsizIlOnizleme = await fetch(`${ctx.baseUrl}/api/excel/onizle`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ dosya: tutarsizIlBase64, tip: 'il' })
    });
    assert.equal(tutarsizIlOnizleme.status, 200);
    const tutarsizIlBody = await tutarsizIlOnizleme.json();
    assert.equal(tutarsizIlBody.uygulanabilir, false);
    assert.match(tutarsizIlBody.sorunlar[0].sorun, /Plaka ile il adı/i);
    const tutarsizIlUygula = await fetch(`${ctx.baseUrl}/api/excel/uygula`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ importId: tutarsizIlBody.importId, tip: 'il' })
    });
    assert.equal(tutarsizIlUygula.status, 409);

    const hataliIlceBase64 = await workbookBase64([
        ILCE_BASLIKLAR,
        ['Ordu', 'Olmayan İlçe', '', '', '', '', '', '', '']
    ]);
    const hataliIlceOnizleme = await fetch(`${ctx.baseUrl}/api/excel/onizle`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ dosya: hataliIlceBase64, tip: 'ilce' })
    });
    assert.equal(hataliIlceOnizleme.status, 200);
    const hataliIlceBody = await hataliIlceOnizleme.json();
    assert.equal(hataliIlceBody.uygulanabilir, false);
    assert.match(hataliIlceBody.sorunlar[0].sorun, /İlçe eşleşmedi/i);

    const guvenlikBase64 = await workbookBase64([
        IL_BASLIKLAR,
        ['52', 'Ordu', '', '123', '12345678901', 'https://evil.example/ordu', '', '', '']
    ]);
    const guvenlikOnizleme = await fetch(`${ctx.baseUrl}/api/excel/onizle`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ dosya: guvenlikBase64, tip: 'il' })
    });
    assert.equal(guvenlikOnizleme.status, 200);
    const guvenlikBody = await guvenlikOnizleme.json();
    assert.equal(guvenlikBody.uygulanabilir, false);
    assert.ok(guvenlikBody.sorunlar.some((s) => /TC Kimlik No geçersiz/i.test(s.sorun)));
    assert.ok(guvenlikBody.sorunlar.some((s) => /Telefon numarası geçersiz/i.test(s.sorun)));
    assert.ok(guvenlikBody.sorunlar.some((s) => /instagram bağlantısı/i.test(s.sorun)));

    const uzunHucreBase64 = await workbookBase64([
        IL_BASLIKLAR,
        ['52', 'Ordu', 'A'.repeat(301), '', '', '', '', '', '']
    ]);
    const uzunHucreOnizleme = await fetch(`${ctx.baseUrl}/api/excel/onizle`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ dosya: uzunHucreBase64, tip: 'il' })
    });
    assert.equal(uzunHucreOnizleme.status, 400);
    const uzunHucreBody = await uzunHucreOnizleme.json();
    assert.match(uzunHucreBody.hata, /hücreleri en fazla/i);

    const hataliWb = new ExcelJS.Workbook();
    const hataliWs = hataliWb.addWorksheet('Veriler');
    hataliWs.addRow(['Yanlış Başlık', 'İl Adı']);
    hataliWs.addRow(['52', 'Ordu']);
    const hataliBase64 = Buffer.from(await hataliWb.xlsx.writeBuffer()).toString('base64');
    const hataliOnizleme = await fetch(`${ctx.baseUrl}/api/excel/onizle`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ dosya: hataliBase64, tip: 'il' })
    });
    assert.equal(hataliOnizleme.status, 400);
    const hataliOnizlemeBody = await hataliOnizleme.json();
    assert.match(hataliOnizlemeBody.hata, /şablonu uyumsuz/i);

    const me = await fetch(`${ctx.baseUrl}/api/auth/me`, {
        headers: cookieHeaders(adminSession)
    });
    assert.equal(me.status, 200);

    const weakCreate = await fetch(`${ctx.baseUrl}/api/kullanicilar`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            kullanici_adi: 'weak-password-user',
            sifre: 'admin123'
        })
    });
    assert.equal(weakCreate.status, 400);

    const createdUser = await fetch(`${ctx.baseUrl}/api/kullanicilar`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            kullanici_adi: 'route-user',
            sifre: 'route-user-password-123',
            ad_soyad: 'Route User',
            il_idleri: []
        })
    });
    assert.equal(createdUser.status, 201);
    const createdUserBody = await createdUser.json();
    const routeUserId = createdUserBody.id;

    const weakReset = await fetch(`${ctx.baseUrl}/api/kullanicilar/${routeUserId}/sifre`, {
        method: 'PUT',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ yeni_sifre: 'password123' })
    });
    assert.equal(weakReset.status, 400);

    const usersList = await fetch(`${ctx.baseUrl}/api/kullanicilar`, {
        headers: cookieHeaders(adminSession)
    });
    assert.equal(usersList.status, 200);
    const usersListBody = await usersList.json();
    assert.equal(Array.isArray(usersListBody.find((k) => k.id === routeUserId)?.iller), true);

    const readNotificationId = db
        .prepare("INSERT INTO bildirimler (kullanici_id, tip, baslik, okundu) VALUES (?, 'test', 'read', 1)")
        .run(adminKullanici.id).lastInsertRowid;
    const unreadNotificationId = db
        .prepare("INSERT INTO bildirimler (kullanici_id, tip, baslik, okundu) VALUES (?, 'test', 'unread', 0)")
        .run(adminKullanici.id).lastInsertRowid;
    const clearNotifications = await fetch(`${ctx.baseUrl}/api/bildirimler`, {
        method: 'DELETE',
        headers: cookieHeaders(adminSession)
    });
    assert.equal(clearNotifications.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) s FROM bildirimler WHERE id = ?').get(readNotificationId).s, 0);
    assert.equal(db.prepare('SELECT COUNT(*) s FROM bildirimler WHERE id = ?').get(unreadNotificationId).s, 0);

    const task = await fetch(`${ctx.baseUrl}/api/gorevler`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            kullanici_id: routeUserId,
            baslik: 'Tekrar idempotent test',
            son_tarih: '2026-01-01T09:00:00.000Z',
            tekrar: 'haftalik'
        })
    });
    assert.equal(task.status, 201);
    const taskBody = await task.json();
    db.prepare(
        `INSERT INTO gorevler (kullanici_id, baslik, oncelik, kategori, son_tarih, tekrar, olusturan_id)
        VALUES (?, 'Tekrar idempotent test', 'normal', 'diger', '2026-01-08 09:00:00', 'haftalik', ?)`
    ).run(routeUserId, adminKullanici.id);
    const completeTask = await fetch(`${ctx.baseUrl}/api/gorevler/${taskBody.id}/durum`, {
        method: 'PUT',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ durum: 'tamamlandi' })
    });
    assert.equal(completeTask.status, 200);
    assert.equal(
        db
            .prepare("SELECT COUNT(*) s FROM gorevler WHERE baslik = 'Tekrar idempotent test' AND son_tarih = ?")
            .get('2026-01-08 09:00:00').s,
        1
    );

    const routeUserSession = await ctx.login('route-user-password-123', 'route-user');

    const firstMessage = await fetch(`${ctx.baseUrl}/api/ozel-mesaj`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ alici_id: routeUserId, metin: 'sadece benden gizle' })
    });
    assert.equal(firstMessage.status, 201);
    const firstMessageId = (await firstMessage.json()).id;
    const deleteForSender = await fetch(`${ctx.baseUrl}/api/ozel-mesaj/mesaj/${firstMessageId}`, {
        method: 'DELETE',
        headers: cookieHeaders(adminSession)
    });
    assert.equal(deleteForSender.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) s FROM ozel_mesajlar WHERE id = ?').get(firstMessageId).s, 1);
    assert.ok(
        db.prepare('SELECT deleted_for_sender_at FROM ozel_mesajlar WHERE id = ?').get(firstMessageId)
            .deleted_for_sender_at
    );

    const adminThreadAfterDelete = await fetch(`${ctx.baseUrl}/api/ozel-mesaj/${routeUserId}`, {
        headers: cookieHeaders(adminSession)
    });
    assert.equal(adminThreadAfterDelete.status, 200);
    assert.equal(
        (await adminThreadAfterDelete.json()).some((m) => m.id === firstMessageId),
        false
    );

    const userThreadAfterSenderDelete = await fetch(`${ctx.baseUrl}/api/ozel-mesaj/${adminKullanici.id}`, {
        headers: cookieHeaders(routeUserSession)
    });
    assert.equal(userThreadAfterSenderDelete.status, 200);
    assert.equal(
        (await userThreadAfterSenderDelete.json()).some((m) => m.id === firstMessageId),
        true
    );

    const secondMessage = await fetch(`${ctx.baseUrl}/api/ozel-mesaj`, {
        method: 'POST',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ alici_id: routeUserId, metin: 'alicidan gizle' })
    });
    assert.equal(secondMessage.status, 201);
    const secondMessageId = (await secondMessage.json()).id;
    const deleteForRecipient = await fetch(`${ctx.baseUrl}/api/ozel-mesaj/mesaj/${secondMessageId}`, {
        method: 'DELETE',
        headers: cookieHeaders(routeUserSession)
    });
    assert.equal(deleteForRecipient.status, 200);

    const unreadAfterRecipientDelete = await fetch(`${ctx.baseUrl}/api/ozel-mesaj/okunmamis/toplam`, {
        headers: cookieHeaders(routeUserSession)
    });
    assert.equal(unreadAfterRecipientDelete.status, 200);
    assert.equal((await unreadAfterRecipientDelete.json()).okunmamis, 0);

    const userThreadAfterRecipientDelete = await fetch(`${ctx.baseUrl}/api/ozel-mesaj/${adminKullanici.id}`, {
        headers: cookieHeaders(routeUserSession)
    });
    assert.equal(userThreadAfterRecipientDelete.status, 200);
    assert.equal(
        (await userThreadAfterRecipientDelete.json()).some((m) => m.id === secondMessageId),
        false
    );

    const adminThreadAfterRecipientDelete = await fetch(`${ctx.baseUrl}/api/ozel-mesaj/${routeUserId}`, {
        headers: cookieHeaders(adminSession)
    });
    assert.equal(adminThreadAfterRecipientDelete.status, 200);
    assert.equal(
        (await adminThreadAfterRecipientDelete.json()).some((m) => m.id === secondMessageId),
        true
    );

    const insertMessage = db.prepare('INSERT INTO ozel_mesajlar (gonderen_id, alici_id, metin) VALUES (?, ?, ?)');
    for (let i = 0; i < 205; i++) {
        insertMessage.run(adminKullanici.id, routeUserId, `gecmis-${i}`);
    }
    const history = await fetch(`${ctx.baseUrl}/api/ozel-mesaj/${routeUserId}`, {
        headers: cookieHeaders(adminSession)
    });
    assert.equal(history.status, 200);
    const historyBody = await history.json();
    assert.equal(historyBody.length, 200);
    assert.equal(historyBody[0].metin, 'gecmis-5');
    assert.equal(historyBody.at(-1).metin, 'gecmis-204');
    for (let i = 1; i < historyBody.length; i++) {
        assert.ok(historyBody[i - 1].id < historyBody[i].id);
    }

    const update = await fetch(`${ctx.baseUrl}/api/kullanicilar/profil/sifre`, {
        method: 'PUT',
        headers: cookieHeaders(adminSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            eski_sifre: 'security-admin-password',
            yeni_sifre: 'security-admin-password-2'
        })
    });
    assert.equal(update.status, 200);

    const oldTokenMe = await fetch(`${ctx.baseUrl}/api/auth/me`, {
        headers: cookieHeaders(adminSession)
    });
    assert.equal(oldTokenMe.status, 401);

    const yeniAdminSession = await ctx.login('security-admin-password-2');
    const logout = await fetch(`${ctx.baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: cookieHeaders(yeniAdminSession)
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie') || '', /panel_oturum=;/);
});
