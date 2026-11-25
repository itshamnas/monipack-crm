#!/usr/bin/env bash
# Monipack CRM - separate TEST copy, to try new features before they go live.
#
#   Make it:     bash /opt/monipack-crm/deploy/setup-staging.sh
#   Update it:   bash /opt/monipack-crm/deploy/setup-staging.sh update
#   Remove it:   bash /opt/monipack-crm/deploy/setup-staging.sh remove
#
# Completely separate from the live CRM:
#   - own folder /opt/monipack-crm-staging, own database monipack_crm_staging, own files /var/lib/monipack-crm-staging
#   - own service monipack-crm-staging on 127.0.0.1:3078 (live stays on 3077)
#   - no WhatsApp sending, no email backups, starts EMPTY (no customer data) with its own admin login
#   - never touches the shop (PM2 "monipack", port 5000), monipack.com, the site on 8081 or the live CRM
# Reached through the existing Cloudflare tunnel as https://test-crm.monipack.com (one hostname to add, see the end).
set -euo pipefail
ACTION="${1:-install}"
DOMAIN="${STAGING_DOMAIN:-test-crm.monipack.com}"
BRANCH="${STAGING_BRANCH:-main}"
APP=/opt/monipack-crm-staging; DATA=/var/lib/monipack-crm-staging; DB=monipack_crm_staging; PORT=3078; SVC=monipack-crm-staging
APP_USER=monipackcrm; LIVE=/opt/monipack-crm
export PATH=/opt/node22/bin:$PATH
export GIT_SSH_COMMAND="ssh -i /root/.ssh/monipack_deploy -o IdentitiesOnly=yes"
say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }
[ -x /opt/node22/bin/node ] || { echo "The live CRM's Node.js (/opt/node22) is missing - stopping."; exit 1; }

if [ "$ACTION" = "remove" ]; then
  say "Removing the TEST copy (the live CRM is not touched)"
  systemctl disable --now "$SVC" 2>/dev/null || true
  rm -f "/etc/systemd/system/${SVC}.service"; systemctl daemon-reload
  sudo -u postgres dropdb --if-exists "$DB"; sudo -u postgres psql -qc "DROP ROLE IF EXISTS ${DB};"
  rm -rf "$APP" "$DATA" /root/monipack-crm-staging-login.txt
  echo "Removed. Also delete the test-crm hostname in Cloudflare if you added it."; exit 0
fi

if [ "$ACTION" = "update" ]; then
  [ -d "$APP/.git" ] || { echo "No TEST copy yet. Run without 'update' first."; exit 1; }
  say "Updating the TEST copy to the latest ${BRANCH}"
  cd "$APP"; git fetch -q origin "$BRANCH"; git checkout -q "$BRANCH"; git reset -q --hard "origin/${BRANCH}"
  npm ci --no-audit --no-fund; NODE_ENV=production npm run build
  set -a; . ./.env; set +a; npm run migrate
  systemctl restart "$SVC"; sleep 3
  curl -fsS "http://127.0.0.1:${PORT}/api/health" && echo && echo "TEST copy updated: https://${DOMAIN}"; exit 0
fi

say "1/5 Checks (nothing changed yet)"
command -v psql >/dev/null || { echo "PostgreSQL missing - stopping."; exit 1; }
if ss -ltn | grep -qE "[:.]${PORT}\s"; then
  systemctl is-active --quiet "$SVC" && { echo "The TEST copy is already running. Use: bash $0 update"; exit 0; }
  echo "Port ${PORT} is used by another app - stopping."; exit 1
fi
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" | grep -q 1; then
  echo "Database ${DB} already exists. To start again: bash $0 remove   then run this again."; exit 1
fi
REPO_URL="$(git -C "$LIVE" remote get-url origin)"

say "2/5 Own copy of the code (${BRANCH})"
rm -rf "$APP"; git clone -q --branch "$BRANCH" "$REPO_URL" "$APP"

say "3/5 Own empty database and folders"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$DATA/uploads"; chown -R "$APP_USER:$APP_USER" "$DATA"
DB_PASS="$(openssl rand -hex 24)"; ADMIN_PASS="Test-$(openssl rand -hex 5)"
sudo -u postgres psql -v ON_ERROR_STOP=1 -qc "CREATE ROLE ${DB} LOGIN PASSWORD '${DB_PASS}';"
sudo -u postgres createdb -O "$DB" "$DB"
cat > "$APP/.env" <<ENV
NODE_ENV=production
HOST=127.0.0.1
PORT=${PORT}
JWT_SECRET=$(openssl rand -hex 48)
ALLOWED_ORIGINS=https://${DOMAIN}
DATABASE_URL=postgresql://${DB}:${DB_PASS}@127.0.0.1:5432/${DB}
UPLOAD_DIR=${DATA}/uploads
SEED_ADMIN_EMAIL=test-admin@monipack.com
SEED_ADMIN_PASSWORD=${ADMIN_PASS}
ENV
chown root:"$APP_USER" "$APP/.env"; chmod 640 "$APP/.env"

say "4/5 Install and build (a few minutes)"
cd "$APP"; npm ci --no-audit --no-fund; NODE_ENV=production npm run build
set -a; . ./.env; set +a; npm run migrate

say "5/5 Background service on 127.0.0.1:${PORT}"
cat > "/etc/systemd/system/${SVC}.service" <<UNIT
[Unit]
Description=Monipack CRM (TEST copy)
After=network.target postgresql.service
[Service]
User=${APP_USER}
WorkingDirectory=${APP}
EnvironmentFile=${APP}/.env
ExecStart=/opt/node22/bin/node server/index.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload; systemctl enable --quiet "$SVC"; systemctl restart "$SVC"; sleep 4
curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null || { journalctl -u "$SVC" -n 40 --no-pager; exit 1; }
printf 'Monipack CRM TEST copy\nAddress:  https://%s\nEmail:    test-admin@monipack.com\nPassword: %s\n(You must change it at first sign-in.)\n' "$DOMAIN" "$ADMIN_PASS" > /root/monipack-crm-staging-login.txt
chmod 600 /root/monipack-crm-staging-login.txt

say "DONE - TEST copy running on 127.0.0.1:${PORT}"
cat /root/monipack-crm-staging-login.txt
cat <<NEXT

LAST STEP (in your browser, 1 minute):
  Cloudflare dashboard > Zero Trust > Networks > Tunnels > your tunnel (the one for crm.monipack.com)
  > Public Hostname > Add a public hostname:
      Subdomain: test-crm     Domain: monipack.com
      Service:   HTTP         URL:    localhost:${PORT}
  Save, then open https://${DOMAIN}
NEXT
