const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');

function restoreEnv(previous) {
    for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

async function startTestServer(t) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-security-'));
    const previousEnv = {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        APP_ORIGIN: process.env.APP_ORIGIN,
        TRUST_PROXY: process.env.TRUST_PROXY,
        DATA_DIR: process.env.DATA_DIR,
        BACKUP_DIR: process.env.BACKUP_DIR,
        ADMIN_KULLANICI_ADI: process.env.ADMIN_KULLANICI_ADI,
        ADMIN_SIFRE: process.env.ADMIN_SIFRE,
        JWT_SECRET: process.env.JWT_SECRET
    };

    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.APP_ORIGIN = '';
    process.env.TRUST_PROXY = '1';
    process.env.DATA_DIR = path.join(tmpDir, 'data');
    process.env.BACKUP_DIR = path.join(tmpDir, 'backups');
    process.env.ADMIN_KULLANICI_ADI = 'security-admin';
    process.env.ADMIN_SIFRE = 'security-admin-password';
    process.env.JWT_SECRET = 'security-jwt-secret-with-enough-length-for-tests';

    for (const modulePath of ['../server', '../database/db', '../database/seed']) {
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
        async login(password = process.env.ADMIN_SIFRE) {
            const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kullanici_adi: process.env.ADMIN_KULLANICI_ADI,
                    sifre: password
                })
            });
            assert.equal(response.status, 200);
            const body = await response.json();
            assert.equal(typeof body.token, 'string');
            return body.token;
        }
    };
}

test('security integration flows', async (t) => {
    const ctx = await startTestServer(t);
    const token = await ctx.login();

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

    const unauthenticated = await fetch(`${ctx.baseUrl}/uploads/aaaaaaaaaaaaaaaaaaaaaaaa.jpg`);
    assert.equal(unauthenticated.status, 401);

    const spoofed = await fetch(`${ctx.baseUrl}/api/yukle`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            dosya: `data:image/png;base64,${Buffer.from('not a png').toString('base64')}`
        })
    });
    assert.equal(spoofed.status, 400);

    const note = await fetch(`${ctx.baseUrl}/api/notlar`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
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
        headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(ilSablonu.status, 200);
    const ilSablonuBase64 = Buffer.from(await ilSablonu.arrayBuffer()).toString('base64');
    const ilOnizleme = await fetch(`${ctx.baseUrl}/api/excel/onizle`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ dosya: ilSablonuBase64, tip: 'il' })
    });
    assert.equal(ilOnizleme.status, 200);
    const ilOnizlemeBody = await ilOnizleme.json();
    assert.equal(ilOnizlemeBody.sablon, 'il');
    assert.equal(ilOnizlemeBody.toplam, 1);
    assert.equal(ilOnizlemeBody.sonuclar[0].il_adi, 'Ordu');

    const hataliWb = new ExcelJS.Workbook();
    const hataliWs = hataliWb.addWorksheet('Veriler');
    hataliWs.addRow(['Yanlış Başlık', 'İl Adı']);
    hataliWs.addRow(['52', 'Ordu']);
    const hataliBase64 = Buffer.from(await hataliWb.xlsx.writeBuffer()).toString('base64');
    const hataliOnizleme = await fetch(`${ctx.baseUrl}/api/excel/onizle`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ dosya: hataliBase64, tip: 'il' })
    });
    assert.equal(hataliOnizleme.status, 400);
    const hataliOnizlemeBody = await hataliOnizleme.json();
    assert.match(hataliOnizlemeBody.hata, /şablonu uyumsuz/i);

    const me = await fetch(`${ctx.baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(me.status, 200);

    const update = await fetch(`${ctx.baseUrl}/api/kullanicilar/profil/sifre`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            eski_sifre: 'security-admin-password',
            yeni_sifre: 'security-admin-password-2'
        })
    });
    assert.equal(update.status, 200);

    const oldTokenMe = await fetch(`${ctx.baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(oldTokenMe.status, 401);

    await ctx.login('security-admin-password-2');
});
