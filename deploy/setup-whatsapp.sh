#!/usr/bin/env bash
# Turn on AUTOMATIC WhatsApp alerts (Meta WhatsApp Business Cloud API). Run on the server as root
# AFTER Meta has approved your business number and a message template:
#   bash /opt/monipack-crm/deploy/setup-whatsapp.sh
#
# The template must have exactly two body variables, for example:
#   "Monipack CRM: {{1}}  Open: {{2}}"
# Until this is set up, alerts work in one-tap mode (the person who assigns taps "Send").
set -euo pipefail
ENV=/opt/monipack-crm/.env
[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }
echo
echo "Monipack CRM: automatic WhatsApp alerts"
echo "From Meta Business (developers.facebook.com → your app → WhatsApp → API setup)"
echo
read -rp "Phone number ID: " PHONE_ID
read -rp "Approved template name (e.g. monipack_alert): " TEMPLATE
read -rp "Template language code [en]: " LANG_CODE; LANG_CODE=${LANG_CODE:-en}
read -rsp "Permanent access token (hidden): " TOKEN; echo
case "$PHONE_ID$TEMPLATE$LANG_CODE$TOKEN" in *"'"*) echo "The ' character is not supported here."; exit 1;; esac
sed -i '/^WHATSAPP_TOKEN=/d;/^WHATSAPP_PHONE_ID=/d;/^WHATSAPP_TEMPLATE=/d;/^WHATSAPP_LANG=/d' "$ENV"
{
  printf "WHATSAPP_TOKEN='%s'\n" "$TOKEN"
  printf "WHATSAPP_PHONE_ID='%s'\n" "$PHONE_ID"
  printf "WHATSAPP_TEMPLATE='%s'\n" "$TEMPLATE"
  printf "WHATSAPP_LANG='%s'\n" "$LANG_CODE"
} >> "$ENV"
grep -q '^PUBLIC_URL=' "$ENV" || echo "PUBLIC_URL='https://crm.monipack.com'" >> "$ENV"
chmod 640 "$ENV"
systemctl restart monipack-crm
echo "Done. New alerts now go automatically. To switch back to one-tap mode, delete the WHATSAPP_ lines in $ENV and restart."
