#!/usr/bin/env bash
# Pull the latest main and restart:  bash /opt/monipack-crm/deploy/update.sh
set -euo pipefail
export PATH=/opt/node22/bin:$PATH
cd /opt/monipack-crm
sudo -u postgres pg_dump monipack_crm | gzip > /var/lib/monipack-crm/backups/before-update-$(date +%F-%H%M).sql.gz
git pull --ff-only origin main
npm ci --no-audit --no-fund
npm run build
set -a; . ./.env; set +a
npm run migrate
# Keep the daily local backup script up to date (database + uploaded files)
install -m 755 deploy/backup-cron.sh /etc/cron.daily/monipack-crm-backup
systemctl restart monipack-crm
sleep 3
curl -fsS http://127.0.0.1:3077/api/health && echo && echo "Updated."
