#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');

let sqlite;
try {
    sqlite = require('node:sqlite');
} catch (_err) {
    console.error('node:sqlite bulunamadi. Node.js >=22.13.0 ile calistirin.');
    process.exit(1);
}

const { DatabaseSync } = sqlite;
const DEFAULT_RETENTION_DAYS = 14;

function timestamp(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-');
}

function sqlString(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function retentionDays() {
    const rawValue = (process.env.BACKUP_RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS)).trim();
    const days = Number(rawValue);

    if (!Number.isInteger(days) || days < 0) {
        throw new Error('BACKUP_RETENTION_DAYS negatif olmayan bir tam sayi olmalidir.');
    }

    return days;
}

function fileInfo(filePath) {
    const stat = fs.statSync(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));

    return {
        bytes: stat.size,
        sha256: hash.digest('hex')
    };
}

function archiveUploads(uploadDir, target) {
    const uploadsExists = fs.existsSync(uploadDir);
    let cwd = path.dirname(uploadDir);
    let tempDir;

    if (!uploadsExists) {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-uploads-'));
        fs.mkdirSync(path.join(tempDir, 'uploads'));
        cwd = tempDir;
    }

    try {
        execFileSync('tar', ['-czf', target, '-C', cwd, 'uploads'], { stdio: 'pipe' });
    } catch (err) {
        const detail = err.stderr ? err.stderr.toString().trim() : err.message;
        throw new Error(`Uploads yedegi olusturulamadi: ${detail}`, { cause: err });
    } finally {
        if (tempDir) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }

    return { existed: uploadsExists };
}

function cleanupOldBackups(backupDir, days, currentArtifactDir) {
    if (days === 0) {
        return [];
    }

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const removed = [];

    for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
        if (!entry.name.startsWith('panel-')) {
            continue;
        }

        const entryPath = path.join(backupDir, entry.name);
        if (entryPath === currentArtifactDir) {
            continue;
        }

        const stat = fs.statSync(entryPath);
        if (stat.mtimeMs >= cutoff) {
            continue;
        }

        fs.rmSync(entryPath, { recursive: true, force: true });
        removed.push(entry.name);
    }

    return removed;
}

async function main() {
    const rootDir = path.resolve(__dirname, '..');
    const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'database');
    const dbPath = path.join(dataDir, 'panel.db');
    const uploadDir = path.join(dataDir, 'uploads');
    const backupDir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(dataDir, 'backups');
    const retention = retentionDays();

    if (!fs.existsSync(dbPath)) {
        throw new Error(`Veritabani bulunamadi: ${dbPath}. Once npm run migrate veya npm run seed calistirin.`);
    }

    fs.mkdirSync(backupDir, { recursive: true });

    const createdAt = new Date();
    const artifactName = `panel-${timestamp(createdAt)}`;
    const artifactDir = path.join(backupDir, artifactName);
    const tempArtifactDir = path.join(backupDir, `${artifactName}.tmp`);
    const dbTarget = path.join(tempArtifactDir, 'panel.db');
    const uploadsTarget = path.join(tempArtifactDir, 'uploads.tar.gz');
    const manifestTarget = path.join(tempArtifactDir, 'manifest.json');

    if (fs.existsSync(artifactDir) || fs.existsSync(tempArtifactDir)) {
        throw new Error(`Yedek hedefi zaten var: ${artifactDir}`);
    }

    fs.mkdirSync(tempArtifactDir, { recursive: true });

    const db = new DatabaseSync(dbPath, { timeout: 5000 });
    let method = 'VACUUM INTO';

    try {
        db.exec('PRAGMA wal_checkpoint(FULL)');

        if (typeof sqlite.backup === 'function') {
            method = 'node:sqlite backup';
            await sqlite.backup(db, dbTarget, { rate: 100 });
        } else {
            db.exec(`VACUUM INTO ${sqlString(dbTarget)}`);
        }
    } finally {
        db.close();
    }

    const uploads = archiveUploads(uploadDir, uploadsTarget);
    const manifest = {
        createdAt: createdAt.toISOString(),
        artifact: {
            name: artifactName,
            path: artifactDir
        },
        source: {
            database: dbPath,
            uploads: uploadDir
        },
        retentionDays: retention,
        files: {
            database: {
                name: 'panel.db',
                method,
                ...fileInfo(dbTarget)
            },
            uploads: {
                name: 'uploads.tar.gz',
                sourceExists: uploads.existed,
                ...fileInfo(uploadsTarget)
            }
        }
    };

    fs.writeFileSync(manifestTarget, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    fs.renameSync(tempArtifactDir, artifactDir);

    const removed = cleanupOldBackups(backupDir, retention, artifactDir);

    console.log(`Yedek artifact olusturuldu: ${artifactDir}`);
    console.log(`Veritabani: ${path.join(artifactDir, 'panel.db')}`);
    console.log(`Uploads: ${path.join(artifactDir, 'uploads.tar.gz')}`);
    console.log(`Manifest: ${path.join(artifactDir, 'manifest.json')}`);
    console.log(`Yontem: ${method}`);
    if (removed.length > 0) {
        console.log(`Retention temizligi: ${removed.length} eski yedek silindi.`);
    }
}

main().catch((err) => {
    console.error('Yedekleme basarisiz oldu.');
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
