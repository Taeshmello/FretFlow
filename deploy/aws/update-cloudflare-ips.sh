#!/usr/bin/env bash
# Regenerates the Cloudflare real-IP snippet and reloads Nginx if it changed.
# Run as root on the EC2 host (for example monthly from cron).
set -euo pipefail

TARGET="${1:-/etc/nginx/snippets/fretflow-cloudflare-realip.conf}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  echo "# Cloudflare edge ranges (https://www.cloudflare.com/ips/), fetched $(date -u +%F)."
  for family in v4 v6; do
    curl --fail --silent --show-error "https://www.cloudflare.com/ips-$family/" \
      | grep -E '^[0-9a-f:.]+/[0-9]+$' \
      | sed 's/^/set_real_ip_from /; s/$/;/'
  done
  echo "real_ip_header CF-Connecting-IP;"
} > "$TMP"

if [[ "$(grep -c set_real_ip_from "$TMP")" -lt 10 ]]; then
  echo "Unexpectedly short Cloudflare range list; leaving $TARGET unchanged." >&2
  exit 1
fi

if ! cmp -s <(grep -v '^#' "$TMP") <(grep -v '^#' "$TARGET" 2>/dev/null || true); then
  install -m 644 "$TMP" "$TARGET"
  nginx -t
  systemctl reload nginx
  echo "Updated $TARGET"
fi
