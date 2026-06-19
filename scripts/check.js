#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIN_NODE = '22.13.0';
const DOCUMENTED_ENV_KEYS = [
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
const PRODUCTION_REQUIRED = ['PORT', 'DATA_DIR', 'BACKUP_DIR', 'ADMIN_KULLANICI_ADI', 'ADMIN_SIFRE', 'JWT_SECRET'];
const PLACEHOLDER_PATTERN = /(admin123|gizli|degistir|change-me|example|varsayilan)/i;

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

function isPlaceholder(value) {
    return !value || PLACEHOLDER_PATTERN.test(value);
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
        if (isPlaceholder(process.env[key])) {
            errors.push(`Production icin ${key} gercek bir deger olmalidir.`);
        }
    }

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
