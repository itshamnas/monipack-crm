#!/usr/bin/env bash
# Set up the daily encrypted CRM backup email. Run on the server as root:
#   bash /opt/monipack-crm/deploy/setup-email-backup.sh
# You type the email password and backup passphrase here; they are saved only in /opt/monipack-crm/.env.
set -euo pipefail
ENV=/opt/monipack-crm/.env
[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }
echo
echo "Monipack CRM: daily backup by email"
echo "For Gmail: turn on 2-Step Verification, then create an App password at https://myaccount.google.com/apppasswords"
echo
while true; do read -rp "Send backups TO this email: " TO; [[ "$TO" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$ ]] && break; echo "  Please type one email address."; done
while true; do read -rp "Send FROM email account (e.g. yourname@gmail.com): " USER; [[ "$USER" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$ ]] && break; echo "  Please type one email address."; done
echo "For the next two questions just press Enter unless you use a different email provider."
while true; do
  read -rp "SMTP server [smtp.gmail.com]: " HOST; HOST=${HOST:-smtp.gmail.com}
  [[ "$HOST" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] && break
  echo "  \"$HOST\" is not a server name. Press Enter alone for smtp.gmail.com."
done
while true; do
  read -rp "SMTP port [465]: " PORT; PORT=${PORT:-465}
  [[ "$PORT" =~ ^[0-9]{2,5}$ ]] && break
  echo "  The port is a number. Press Enter alone for 465."
done
read -rsp "Email app password (hidden, paste and press Enter): " PASS; echo
PASS=${PASS// /}   # Google shows app passwords with spaces; they are not part of it
case "$PASS$TO$USER$HOST" in *"'"*) echo "The ' character is not supported here."; exit 1;; esac
while true; do
  read -rsp "Choose a backup passphrase, 12+ characters (hidden, WRITE IT DOWN): " P1; echo
  read -rsp "Type the passphrase again: " P2; echo
  case "$P1" in *"'"*) echo "Please do not use the ' character."; continue;; esac
  [ "$P1" = "$P2" ] && [ ${#P1} -ge 12 ] && break
  echo "Passphrases differ or are shorter than 12 characters. Try again."
done
sed -i '/^BACKUP_EMAIL_TO=/d;/^SMTP_HOST=/d;/^SMTP_PORT=/d;/^SMTP_USER=/d;/^SMTP_PASS=/d;/^SMTP_FROM=/d;/^BACKUP_PASSPHRASE=/d' "$ENV"
{
  printf "BACKUP_EMAIL_TO='%s'\n" "$TO"
  printf "SMTP_HOST='%s'\n" "$HOST"
  printf "SMTP_PORT='%s'\n" "$PORT"
  printf "SMTP_USER='%s'\n" "$USER"
  printf "SMTP_PASS='%s'\n" "$PASS"
  printf "BACKUP_PASSPHRASE='%s'\n" "$P1"
} >> "$ENV"
chmod 640 "$ENV"
echo "Sending a test backup now..."
cd /opt/monipack-crm
set -a; . ./.env; set +a
sudo -E -u monipackcrm /opt/node22/bin/node server/backup/daily.js --now
systemctl restart monipack-crm
echo "Done. A backup will be emailed every day at 02:30 Oman time."
