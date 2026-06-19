# Native systemd deploy

Bu dokuman platform servisi kullanmadan Linux sunucuda native Node.js + systemd ile calistirma akisini anlatir.

## Gereksinimler

- Node.js `>=22.13.0`
- npm
- systemd tabanli Linux
- Uygulama kullanicisi icin yazilabilir kalici veri dizinleri

Node ve npm path'lerini unit dosyasina yazmadan once kontrol edin:

```bash
command -v node
command -v npm
node -v
```

## Dizinler ve kullanici

```bash
sudo useradd --system --home /var/lib/panel --shell /usr/sbin/nologin panel
sudo install -d -m 0755 -o root -g root /opt/panel
sudo install -d -m 0750 -o panel -g panel /var/lib/panel
sudo install -d -m 0750 -o panel -g panel /var/backups/panel
sudo install -d -m 0750 -o root -g panel /etc/panel
```

`/opt/panel` root-owned ve servis kullanicisi icin read-only kalmalidir. `panel` kullanicisi yalnizca
`/var/lib/panel` ve `/var/backups/panel` altina yazabilmelidir.

Uygulamayi `/opt/panel` altina kopyalayin; runtime verilerini rsync ile tasimayin:

```bash
sudo rsync -a --delete --chown=root:root \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'database/panel.db' \
  --exclude 'database/panel.db-*' \
  --exclude 'database/backups/' \
  --exclude 'database/uploads/' \
  --exclude 'public/uploads/' \
  ./ /opt/panel/
sudo find /opt/panel -type d -exec chmod 0755 {} +
sudo find /opt/panel -type f -exec chmod 0644 {} +
```

## Ortam dosyasi

`/etc/panel/panel.env` olusturun:

```ini
NODE_ENV=production
PORT=3000
APP_ORIGIN=https://panel.example.com
TRUST_PROXY=1
DATA_DIR=/var/lib/panel
BACKUP_DIR=/var/backups/panel
BACKUP_RETENTION_DAYS=14
ADMIN_KULLANICI_ADI=admin
ADMIN_SIFRE=degistirilecek-guclu-sifre
JWT_SECRET=degistirilecek-uzun-rastgele-jwt-secret
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAMESITE=lax
```

Panel ve API farkli originlerde yayinlanacaksa `APP_ORIGIN` panel origin'ini icermeli ve cookie icin `AUTH_COOKIE_SAMESITE=none` kullanilmalidir. `SameSite=None` cookie'ler browser tarafinda HTTPS/`Secure` gerektirir.

Dosya izinlerini sinirlayin:

```bash
sudo chown root:panel /etc/panel/panel.env
sudo chmod 0640 /etc/panel/panel.env
```

## Kurulum ve ilk calistirma

```bash
cd /opt/panel
sudo npm ci --omit=dev
sudo -u panel bash -lc 'cd /opt/panel && set -a; source /etc/panel/panel.env; set +a; npm run check'
sudo -u panel bash -lc 'cd /opt/panel && set -a; source /etc/panel/panel.env; set +a; npm run migrate'
sudo -u panel bash -lc 'cd /opt/panel && set -a; source /etc/panel/panel.env; set +a; npm run seed'
```

`seed` admin kullaniciyi ve temel il/ilce verilerini olusturur. Mevcut admin varsa tekrar olusturmaz.

## systemd unit

`/etc/systemd/system/panel.service`:

```ini
[Unit]
Description=Teskilat Yonetim Paneli
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=panel
Group=panel
WorkingDirectory=/opt/panel
EnvironmentFile=/etc/panel/panel.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/panel /var/backups/panel

[Install]
WantedBy=multi-user.target
```

`/usr/bin/node` ve `/usr/bin/npm` path'lerini kendi sunucunuzdaki `command -v` ciktilarina gore degistirin.

Servisi etkinlestirin:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now panel
sudo systemctl status panel
journalctl -u panel -f
```

## Guncelleme akisi

Asagidaki rsync komutunu yeni release kaynak dizininden calistirin; backup komutu mevcut
`/opt/panel` surumundeki kodla calisir.

```bash
sudo systemctl stop panel
sudo -u panel bash -lc 'cd /opt/panel && set -a; source /etc/panel/panel.env; set +a; npm run backup'
sudo rsync -a --delete --chown=root:root \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'database/panel.db' \
  --exclude 'database/panel.db-*' \
  --exclude 'database/backups/' \
  --exclude 'database/uploads/' \
  --exclude 'public/uploads/' \
  ./ /opt/panel/
cd /opt/panel
sudo find /opt/panel -type d -exec chmod 0755 {} +
sudo find /opt/panel -type f -exec chmod 0644 {} +
sudo npm ci --omit=dev
sudo -u panel bash -lc 'cd /opt/panel && set -a; source /etc/panel/panel.env; set +a; npm run check'
sudo -u panel bash -lc 'cd /opt/panel && set -a; source /etc/panel/panel.env; set +a; npm run migrate'
sudo systemctl start panel
```

Guncelleme sirasinda sira bilincli olarak `backup -> migrate -> start` tutulur. Migration systemd
`ExecStartPre` icinde calistirilmaz; her deployda backup alindiktan sonra manuel calistirilir.

## Manuel yedek

```bash
cd /opt/panel
sudo -u panel bash -lc 'cd /opt/panel && set -a; source /etc/panel/panel.env; set +a; npm run backup'
```

Yedekler `BACKUP_DIR/panel-<timestamp>/` altinda tutulur. Artifact icinde:

- `panel.db`: SQLite yedegi
- `uploads.tar.gz`: `DATA_DIR/uploads` arsivi
- `manifest.json`: kaynaklar, retention ve sha256 bilgileri

`BACKUP_RETENTION_DAYS` varsayilan `14` gundur. `0` verilirse otomatik temizlik yapilmaz.

## Opsiyonel systemd backup timer

`/etc/systemd/system/panel-backup.service`:

```ini
[Unit]
Description=Teskilat Yonetim Paneli SQLite backup

[Service]
Type=oneshot
User=panel
Group=panel
WorkingDirectory=/opt/panel
EnvironmentFile=/etc/panel/panel.env
ExecStart=/usr/bin/npm run backup
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/panel /var/backups/panel
```

`/etc/systemd/system/panel-backup.timer`:

```ini
[Unit]
Description=Daily panel SQLite backup

[Timer]
OnCalendar=*-*-* 03:10:00
Persistent=true

[Install]
WantedBy=timers.target
```

Etkinlestirme:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now panel-backup.timer
systemctl list-timers panel-backup.timer
```
