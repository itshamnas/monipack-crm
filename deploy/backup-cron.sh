#!/bin/sh
# Monipack CRM: local daily backup on the server (installed to /etc/cron.daily/monipack-crm-backup by update.sh)
#  - database:   /var/lib/monipack-crm/backups/crm-YYYY-MM-DD.sql.gz        (kept 14 days)
#  - files:      /var/lib/monipack-crm/backups/files-YYYY-MM-DD.tar.gz      (uploads + photos, kept 14 days)
#  - updates:    before-update-*.sql.gz                                      (last 10 kept)
# The encrypted copy that leaves the server is the daily e-mail backup (database only).
set -e
B=/var/lib/monipack-crm/backups
mkdir -p "$B"
sudo -u postgres pg_dump monipack_crm | gzip > "$B/crm-$(date +%F).sql.gz"
if [ -d /var/lib/monipack-crm/uploads ]; then
  tar -czf "$B/files-$(date +%F).tar.gz" -C /var/lib/monipack-crm uploads
fi
chmod 600 "$B"/*.gz 2>/dev/null || true
find "$B" -name 'crm-*.sql.gz' -mtime +14 -delete
find "$B" -name 'files-*.tar.gz' -mtime +14 -delete
ls -1t "$B"/before-update-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
