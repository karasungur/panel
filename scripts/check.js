#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { telefonNormalizeEt } = require('../utils/phone');

const ROOT = path.resolve(__dirname, '..');
const MIN_NODE = '22.13.0';
const DOCUMENTED_ENV_KEYS = [
    'NODE_ENV',
    'PORT',
    'APP_ORIGIN',
    'TRUST_PROXY',
    'DATA_DIR',
    'BACKUP_DIR',
    'BACKUP_RETENTION_DAYS',
    'ADMIN_TELEFON',
    'ADMIN_SIFRE',
    'JWT_SECRET',
    'AUTH_COOKIE_SECURE',
    'AUTH_COOKIE_SAMESITE'
];
const PRODUCTION_REQUIRED = ['PORT', 'DATA_DIR', 'BACKUP_DIR', 'ADMIN_TELEFON', 'ADMIN_SIFRE', 'JWT_SECRET'];
const MIN_ADMIN_PASSWORD_LENGTH = 12;
const MIN_JWT_SECRET_LENGTH = 32;
const PLACEHOLDER_PATTERN =
    /(admin123|changeme|change-me|change_me|degistir|example|gizli|placeholder|secret|varsayilan)/i;
const UNSAFE_ADMIN_PASSWORDS = new Set([
    'admin',
    'admin123',
    'password',
    'password123',
    'panel',
    'qwerty',
    'test',
    '123456',
    '12345678',
    '123456789'
]);
const DEFAULT_JWT_SECRETS = new Set([
    'varsayilan-gizli-anahtar-degistirin',
    'cok-gizli-jwt-anahtari-degistirin',
    'change-me',
    'changeme'
]);

const errors = [];
const warnings = [];

function parseVersion(version) {
    return version
        .replace(/^v/, '')
        .split('.')
        .map((part) => Number.parseInt(part, 10));
}

function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    for (let i = 0; i < 3; i += 1) {
        if ((a[i] || 0) > (b[i] || 0)) return 1;
        if ((a[i] || 0) < (b[i] || 0)) return -1;
    }
    return 0;
}

function readEnvExampleKeys() {
    const envExamplePath = path.join(ROOT, '.env.example');
    if (!fs.existsSync(envExamplePath)) {
        errors.push('.env.example bulunamadi.');
        return new Set();
    }

    const content = fs.readFileSync(envExamplePath, 'utf8');
    return new Set(
        content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#') && line.includes('='))
            .map((line) => line.split('=')[0].trim())
    );
}

function envValue(key) {
    return (process.env[key] || '').trim();
}

function isPlaceholder(value) {
    return !value || PLACEHOLDER_PATTERN.test(value);
}

function checkProductionAdminPassword() {
    const password = envValue('ADMIN_SIFRE');
    const adminPhone = envValue('ADMIN_TELEFON');
    const adminPhoneDigits = adminPhone.replace(/\D/g, '');
    const normalizedPassword = password.toLowerCase();
    const normalizedPasswordDigits = normalizedPassword.replace(/\D/g, '');

    if (!telefonNormalizeEt(adminPhone)) {
        errors.push('Production icin ADMIN_TELEFON +905xxxxxxxxx formatinda gecerli bir GSM numarasi olmalidir.');
    }

    if (isPlaceholder(password) || UNSAFE_ADMIN_PASSWORDS.has(normalizedPassword)) {
        errors.push('Production icin ADMIN_SIFRE placeholder/default olmayan guclu bir deger olmalidir.');
    }

    if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
        errors.push(`Production icin ADMIN_SIFRE en az ${MIN_ADMIN_PASSWORD_LENGTH} karakter olmalidir.`);
    }

    if (adminPhoneDigits && normalizedPasswordDigits === adminPhoneDigits) {
        errors.push('Production icin ADMIN_SIFRE telefon numarasi ile ayni olamaz.');
    }
}

function checkProductionJwtSecret() {
    const secret = envValue('JWT_SECRET');
    const normalizedSecret = secret.toLowerCase();

    if (isPlaceholder(secret) || DEFAULT_JWT_SECRETS.has(normalizedSecret)) {
        errors.push('Production icin JWT_SECRET placeholder/default olmayan rastgele bir deger olmalidir.');
    }

    if (secret.length < MIN_JWT_SECRET_LENGTH) {
        errors.push(`Production icin JWT_SECRET en az ${MIN_JWT_SECRET_LENGTH} karakter olmalidir.`);
    }

    if (secret && secret === envValue('ADMIN_SIFRE')) {
        errors.push('Production icin JWT_SECRET ADMIN_SIFRE ile ayni olamaz.');
    }
}

function checkTrustProxy() {
    const trustProxy = envValue('TRUST_PROXY').toLowerCase();

    if (process.env.NODE_ENV === 'production' && trustProxy === 'true') {
        errors.push('Production icin TRUST_PROXY=true kullanmayin; sayisal hop degeri kullanin (ornegin 1).');
    }
}

function checkBackupRetention() {
    const rawValue = envValue('BACKUP_RETENTION_DAYS');
    if (!rawValue) return;

    const retentionDays = Number(rawValue);
    if (!Number.isInteger(retentionDays) || retentionDays < 0) {
        errors.push('BACKUP_RETENTION_DAYS negatif olmayan bir tam sayi olmalidir.');
    }
}

function checkNodeVersion() {
    const current = process.versions.node;
    if (compareVersions(current, MIN_NODE) < 0) {
        errors.push(`Node.js ${MIN_NODE}+ gerekli, mevcut surum ${current}.`);
    }
}

function checkPackageEngine() {
    const packageJson = require('../package.json');
    const engine = packageJson.engines && packageJson.engines.node;
    if (engine !== `>=${MIN_NODE}`) {
        errors.push(`package.json engines.node >=${MIN_NODE} olmali, mevcut: ${engine || 'yok'}.`);
    }
}

function checkEnvDocs() {
    const keys = readEnvExampleKeys();
    for (const key of DOCUMENTED_ENV_KEYS) {
        if (!keys.has(key)) {
            errors.push(`.env.example ${key} anahtarini belgelemiyor.`);
        }
    }
}

function checkRuntimeEnv() {
    const envPath = path.join(ROOT, '.env');
    if (!fs.existsSync(envPath)) {
        warnings.push('.env bulunamadi; lokal kurulum icin .env.example dosyasini .env olarak kopyalayin.');
    }

    if (process.env.NODE_ENV !== 'production') {
        return;
    }

    for (const key of PRODUCTION_REQUIRED) {
        if (!envValue(key)) {
            errors.push(`Production icin ${key} gercek bir deger olmalidir.`);
        }
    }

    checkProductionAdminPassword();
    checkProductionJwtSecret();

    for (const key of ['DATA_DIR', 'BACKUP_DIR']) {
        if (process.env[key] && !path.isAbsolute(process.env[key])) {
            errors.push(`Production icin ${key} mutlak path olmalidir: ${process.env[key]}`);
        }
    }
}

function checkExpectedFiles() {
    const requiredFiles = [
        'server.js',
        'database/schema.sql',
        'database/seed.js',
        'public/index.html',
        'public/panel.html',
        'public/turkiye.svg'
    ];

    for (const file of requiredFiles) {
        if (!fs.existsSync(path.join(ROOT, file))) {
            errors.push(`Beklenen dosya bulunamadi: ${file}`);
        }
    }
}

checkNodeVersion();
checkPackageEngine();
checkEnvDocs();
checkTrustProxy();
checkBackupRetention();
checkRuntimeEnv();
checkExpectedFiles();

for (const warning of warnings) {
    console.warn(`UYARI: ${warning}`);
}

if (errors.length > 0) {
    console.error('Kontrol basarisiz:');
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}

console.log(
    `Kontrol tamam: Node.js ${process.versions.node}, engine >=${MIN_NODE}, env dokumani ve temel dosyalar uygun.`
);
