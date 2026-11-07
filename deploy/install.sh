#!/usr/bin/env bash
# Monipack CRM - first-time install on an Ubuntu VPS (Hostinger KVM).
# Run as root from the cloned repo:  bash /opt/monipack-crm/deploy/install.sh crm.monipack.com
# Safe to run again: it keeps the existing database, passwords and uploads.
set -euo pipefail
DOMAIN="${1:-crm.monipack.com}"
ADMIN_EMAIL="${2:-admin@monipack.com}"
APP_DIR=/opt/monipack-crm
DATA_DIR=/var/lib/monipack
APP_USER=monipack
PORT=3000
say() { printf '\n\033[1;31m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }
cd "$APP_DIR"

say "1/8 System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git nginx postgresql postgresql-contrib openssl ca-certificates ufw

say "2/8 Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

say "3/8 App user and folders"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/backups"
chown -R "$APP_USER:$APP_USER" "$DATA_DIR"

say "4/8 Database"
systemctl enable --now postgresql
if [ ! -f "$APP_DIR/.env" ]; then
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DO \$\$BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='monipack') THEN CREATE ROLE monipack LOGIN; END IF; END\$\$;"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE monipack PASSWORD '${DB_PASS}';"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='monipack'" | grep -q 1 || sudo -u postgres createdb -O monipack monipack
  ADMIN_PASS="Mp-$(openssl rand -hex 6)"
  cat > "$APP_DIR/.env" <<ENV
NODE_ENV=production
PORT=${PORT}
JWT_SECRET=$(openssl rand -hex 48)
ALLOWED_ORIGINS=https://${DOMAIN}
DATABASE_URL=postgresql://monipack:${DB_PASS}@127.0.0.1:5432/monipack
UPLOAD_DIR=${DATA_DIR}/uploads
SEED_ADMIN_EMAIL=${ADMIN_EMAIL}
SEED_ADMIN_PASSWORD=${ADMIN_PASS}
ENV
  printf 'Monipack CRM first login\nAddress:  https://%s\nEmail:    %s\nPassword: %s\n(You must change it at first login.)\n' "$DOMAIN" "$ADMIN_EMAIL" "$ADMIN_PASS" > /root/monipack-first-login.txt
  chmod 600 /root/monipack-first-login.txt
fi
chown root:"$APP_USER" "$APP_DIR/.env"; chmod 640 "$APP_DIR/.env"

say "5/8 Install and build (takes a few minutes)"
npm ci --no-audit --no-fund
npm run build
set -a; . "$APP_DIR/.env"; set +a
npm run migrate

say "6/8 Background service"
cat > /etc/systemd/system/monipack-crm.service <<UNIT
[Unit]
Description=Monipack CRM
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable monipack-crm
systemctl restart monipack-crm

say "7/8 Web server (nginx) + Cloudflare"
if [ ! -f /etc/ssl/monipack/origin.crt ]; then
  mkdir -p /etc/ssl/monipack
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=${DOMAIN}" \
    -keyout /etc/ssl/monipack/origin.key -out /etc/ssl/monipack/origin.crt
fi
{
  echo "# Cloudflare edge IPs: take the real visitor IP from CF-Connecting-IP"
  for u in https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6; do
    curl -fsS "$u" | sed 's/.*/set_real_ip_from &;/' || true
  done
  echo "real_ip_header CF-Connecting-IP;"
} > /etc/nginx/conf.d/cloudflare-realip.conf
cat > /etc/nginx/sites-available/monipack-crm <<NGX
server {
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${DOMAIN};
    ssl_certificate     /etc/ssl/monipack/origin.crt;
    ssl_certificate_key /etc/ssl/monipack/origin.key;
    client_max_body_size 60m;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
    }
}
NGX
ln -sf /etc/nginx/sites-available/monipack-crm /etc/nginx/sites-enabled/monipack-crm
[ -n "$(ls /var/www 2>/dev/null | grep -v html)" ] || true  # keep any existing site untouched
nginx -t 2>/dev/null || sed -i 's/^    http2 on;$//' /etc/nginx/sites-available/monipack-crm   # older nginx
nginx -t
systemctl enable nginx
systemctl reload nginx || systemctl restart nginx
ufw status | grep -q "Status: active" && ufw allow "Nginx Full" >/dev/null || true

say "8/8 Daily database backup (keeps 14 days)"
cat > /etc/cron.daily/monipack-backup <<'CRON'
#!/bin/sh
f=/var/lib/monipack/backups/monipack-$(date +%F).sql.gz
sudo -u postgres pg_dump monipack | gzip > "$f"
find /var/lib/monipack/backups -name '*.sql.gz' -mtime +14 -delete
CRON
chmod +x /etc/cron.daily/monipack-backup

sleep 3
if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
  say "DONE - Monipack CRM is running"
  [ -f /root/monipack-first-login.txt ] && cat /root/monipack-first-login.txt
else
  say "The app did not start. Last log lines:"; journalctl -u monipack-crm -n 40 --no-pager; exit 1
fi
