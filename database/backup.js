require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { backup } = require('node:sqlite');
const db = require('./db');

function backupTarget() {
    const hedefArg = process.argv[2] ? path.resolve(process.argv[2]) : null;
    const varsayilanDir = process.env.BACKUP_DIR
        ? path.resolve(process.env.BACKUP_DIR)
        : path.join(db.dataDir, 'backups');

    if (hedefArg && path.extname(hedefArg).toLowerCase() === '.db') {
        return hedefArg;
    }

    const backupDir = hedefArg || varsayilanDir;
    const zaman = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(backupDir, `panel-${zaman}.db`);
}

async function main() {
    const hedef = backupTarget();
    fs.mkdirSync(path.dirname(hedef), { recursive: true });

    db.exec('PRAGMA wal_checkpoint(FULL)');
    await backup(db, hedef);

    const boyut = fs.statSync(hedef).size;
    console.log(`Yedek olusturuldu: ${hedef} (${boyut} bytes)`);
}

main()
    .catch((err) => {
        console.error('Yedek olusturulamadi:', err.message);
        process.exitCode = 1;
    })
    .finally(() => {
        try {
            db.close();
        } catch (_) {}
    });
