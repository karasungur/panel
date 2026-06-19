const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REQUIRED_ENV_KEYS = [
    'NODE_ENV',
    'PORT',
    'APP_ORIGIN',
    'TRUST_PROXY',
    'DATA_DIR',
    'BACKUP_DIR',
    'ADMIN_KULLANICI_ADI',
    'ADMIN_SIFRE',
    'JWT_SECRET'
];

function envExampleKeys() {
    const content = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
    return new Set(
        content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#') && line.includes('='))
            .map((line) => line.split('=')[0].trim())
    );
}

function restoreEnv(previous) {
    for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
}

test('.env.example documents runtime keys', () => {
    const keys = envExampleKeys();
    const missing = REQUIRED_ENV_KEYS.filter((key) => !keys.has(key));
    assert.deepEqual(missing, []);
});

test('GET /api returns API status', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-smoke-'));
    const managedEnv = {
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
    process.env.DATA_DIR = tmpDir;
    process.env.BACKUP_DIR = path.join(tmpDir, 'backups');
    process.env.ADMIN_KULLANICI_ADI = 'smoke-admin';
    process.env.ADMIN_SIFRE = 'smoke-admin-password';
    process.env.JWT_SECRET = 'smoke-jwt-secret-with-enough-length-for-tests';

    delete require.cache[require.resolve('../server')];
    try {
        delete require.cache[require.resolve('../database/db')];
    } catch (_) {}

    const app = require('../server');
    assert.equal(typeof app.listen, 'function');

    const server = await new Promise((resolve, reject) => {
        const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
        listeningServer.once('error', reject);
    });

    t.after(async () => {
        await new Promise((resolve) => server.close(resolve));

        try {
            require('../database/db').close();
        } catch (_) {}

        restoreEnv(managedEnv);
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.match(body.durum, /API/);
});
