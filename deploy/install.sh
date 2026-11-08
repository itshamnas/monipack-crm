#!/usr/bin/env bash
# Monipack CRM - isolated install. Touches NOTHING used by other apps:
#  - own database + login: monipack_crm (refuses if the name is already taken)
#  - own Node.js copy in /opt/node22 (system Node untouched)
#  - listens only on 127.0.0.1:3077 (no nginx/apache/firewall changes)
#  - reached from the internet through the existing Cloudflare tunnel
# Usage (as root):  bash /opt/monipack-crm/deploy/install.sh crm.monipack.com admin@monipack.com
set -euo pipefail
DOMAIN="${1:-crm.monipack.com}"; ADMIN_EMAIL="${2:-admin@monipack.com}"
APP_DIR=/opt/monipack-crm; DATA_DIR=/var/lib/monipack-crm; APP_USER=monipackcrm; PORT=3077; DB=monipack_crm
say() { printf '\n\033[1;31m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }
cd "$APP_DIR"

say "1/6 Checks (nothing changed yet)"
command -v psql >/dev/null || { echo "PostgreSQL is not installed on this server - stopping."; exit 1; }
if [ -f .env ] && ! grep -q "/${DB}\$" .env; then mv .env ".env.old-$(date +%s)"; echo "Old .env from an earlier attempt moved aside."; fi
if ss -ltn | grep -q "127.0.0.1:${PORT} \|0.0.0.0:${PORT} \|\*:${PORT} "; then
  systemctl is-active --quiet monipack-crm || { echo "Port ${PORT} is used by another app - stopping."; exit 1; }
fi
if [ ! -f .env ]; then
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB}'" | grep -q 1 || \
     sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" | grep -q 1; then
    echo "A database or login called ${DB} already exists - stopping so nothing is overwritten."; exit 1
  fi
fi

say "2/6 Node.js 22 (private copy)"
if [ ! -x /opt/node22/bin/node ]; then
  curl -fsSL https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz -o /tmp/node22.tar.xz
  mkdir -p /opt/node22 && tar -xJf /tmp/node22.tar.xz -C /opt/node22 --strip-components=1
fi
export PATH=/opt/node22/bin:$PATH; node -v

say "3/6 Own database + folders"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/backups"; chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
if [ ! -f .env ]; then
  DB_PASS="$(openssl rand -hex 24)"; ADMIN_PASS="Mp-$(openssl rand -hex 6)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE ${DB} LOGIN PASSWORD '${DB_PASS}';"
  sudo -u postgres createdb -O "${DB}" "${DB}"
  cat > .env <<ENV
NODE_ENV=production
HOST=127.0.0.1
PORT=${PORT}
JWT_SECRET=$(openssl rand -hex 48)
ALLOWED_ORIGINS=https://${DOMAIN}
DATABASE_URL=postgresql://${DB}:${DB_PASS}@127.0.0.1:5432/${DB}
UPLOAD_DIR=${DATA_DIR}/uploads
SEED_ADMIN_EMAIL=${ADMIN_EMAIL}
SEED_ADMIN_PASSWORD=${ADMIN_PASS}
ENV
  printf 'Monipack CRM first login\nAddress:  https://%s\nEmail:    %s\nPassword: %s\n(You must change it at first login.)\n' "$DOMAIN" "$ADMIN_EMAIL" "$ADMIN_PASS" > /root/monipack-crm-first-login.txt
  chmod 600 /root/monipack-crm-first-login.txt
fi
chown root:"$APP_USER" .env; chmod 640 .env

say "4/6 Install and build"
npm ci --no-audit --no-fund
NODE_ENV=production npm run build
set -a; . ./.env; set +a
npm run migrate

say "5/6 Background service"
cat > /etc/systemd/system/monipack-crm.service <<UNIT
[Unit]
Description=Monipack CRM
After=network.target postgresql.service
[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/opt/node22/bin/node server/index.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload; systemctl enable --quiet monipack-crm; systemctl restart monipack-crm
cat > /etc/cron.daily/monipack-crm-backup <<'CRON'
#!/bin/sh
sudo -u postgres pg_dump monipack_crm | gzip > /var/lib/monipack-crm/backups/crm-$(date +%F).sql.gz
find /var/lib/monipack-crm/backups -name 'crm-*.sql.gz' -mtime +14 -delete
CRON
chmod +x /etc/cron.daily/monipack-crm-backup

say "6/6 Check"
sleep 3
if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
  say "DONE - CRM running on 127.0.0.1:${PORT}"
  [ -f /root/monipack-crm-first-login.txt ] && cat /root/monipack-crm-first-login.txt
else
  journalctl -u monipack-crm -n 40 --no-pager; exit 1
fi
