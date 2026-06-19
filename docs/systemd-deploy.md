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
sudo useradd --system --home /opt/panel --shell /usr/sbin/nologin panel
sudo install -d -o panel -g panel /opt/panel
sudo install -d -o panel -g panel /var/lib/panel
sudo install -d -o panel -g panel /var/backups/panel
sudo install -d -m 0750 -o root -g panel /etc/panel
```

Uygulamayi `/opt/panel` altina kopyalayin. Ornek:

```bash
sudo rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  ./ /opt/panel/
sudo chown -R panel:panel /opt/panel /var/lib/panel /var/backups/panel
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
ADMIN_KULLANICI_ADI=admin
ADMIN_SIFRE=degistirilecek-guclu-sifre
JWT_SECRET=degistirilecek-uzun-rastgele-jwt-secret
```

Dosya izinlerini sinirlayin:

```bash
sudo chown root:panel /etc/panel/panel.env
sudo chmod 0640 /etc/panel/panel.env
```

## Kurulum ve ilk calistirma

```bash
cd /opt/panel
sudo -u panel npm ci --omit=dev
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
ExecStartPre=/usr/bin/npm run migrate
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
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

```bash
sudo systemctl stop panel
sudo rsync -a --delete --exclude node_modules --exclude .git --exclude .env ./ /opt/panel/
sudo chown -R panel:panel /opt/panel
cd /opt/panel
sudo -u panel npm ci --omit=dev
sudo -u panel bash -lc 'cd /opt/panel && set -a; source /etc/panel/panel.env; set +a; npm run check'
sudo systemctl start panel
```

`panel.service` icindeki `ExecStartPre` her baslangicta `npm run migrate` calistirir.

## Manuel yedek

```bash
cd /opt/panel
sudo -u panel bash -lc 'cd /opt/panel && set -a; source /etc/panel/panel.env; set +a; npm run backup'
```

Yedek dosyalari `BACKUP_DIR` altinda `panel-<timestamp>.db` formatinda tutulur.

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
