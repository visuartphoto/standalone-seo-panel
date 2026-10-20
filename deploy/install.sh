#!/usr/bin/env bash
set -euo pipefail
# One-time installer for the Standalone SEO Panel on your own VPS.
# Assumptions: Debian/Ubuntu, sudo/root, Supabase already runs on this server
# (Docker). Idempotent — safe to run again.

DOMAIN="${SEO_PANEL_DOMAIN:-seo.visuart.studio}"
BACKEND_PORT="${SEO_PANEL_PORT:-8080}"
INSTALL_DIR="/opt/seo-panel"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> 1/6 Deno installieren"
if ! command -v deno >/dev/null 2>&1 && [ ! -x "$HOME/.deno/bin/deno" ]; then
  curl -fsSL https://deno.land/install.sh | sh
fi
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"
if command -v deno >/dev/null 2>&1; then :; elif [ -x "$DENO_INSTALL/bin/deno" ]; then PATH="$DENO_INSTALL/bin:$PATH"; else echo "Deno-Installation fehlgeschlagen." >&2; exit 1; fi
deno --version

echo "==> 2/6 Projekt nach $INSTALL_DIR kopieren"
mkdir -p "$INSTALL_DIR"
cp -r "$REPO_DIR/backend" "$INSTALL_DIR/backend"
mkdir -p "$INSTALL_DIR/host"

echo "==> 3/6 Umgebung (.env)"
if [ ! -f "$INSTALL_DIR/backend/.env" ]; then
  ENC_KEY="$(head -c 24 /dev/urandom | base64)"
  JOB_KEY="$(head -c 24 /dev/urandom | base64 | tr -d '=+/')"
  cat > "$INSTALL_DIR/backend/.env" <<EOF
SUPABASE_URL=${SUPABASE_URL:-https://supabase.visuart.studio}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:-}
SEO_ENCRYPTION_KEY=$ENC_KEY
SEO_JOB_KEY=$JOB_KEY
EOF
  chmod 600 "$INSTALL_DIR/backend/.env"
  echo "   Achtung: SUPABASE_SERVICE_ROLE_KEY ist NICHT gesetzt."
  echo "   Bitte jetzt manuell eintragen, dann 'sudo systemctl restart seo-panel'."
else
  echo "   .env existiert bereits — übersprungen."
fi

echo "==> 4/6 systemd-Units (Backend + Cron)"
install -m 0644 "$REPO_DIR/deploy/seo-panel.service" /etc/systemd/system/seo-panel.service
install -m 0755 "$REPO_DIR/deploy/run-cron.sh" "$INSTALL_DIR/run-cron.sh"
install -m 0644 "$REPO_DIR/deploy/seo-panel-cron.timer" /etc/systemd/system/seo-panel-cron.timer
install -m 0644 "$REPO_DIR/deploy/seo-panel-cron.service" /etc/systemd/system/seo-panel-cron.service
systemctl daemon-reload
systemctl enable --now seo-panel
systemctl enable --now seo-panel-cron.timer

echo "==> 5/6 Caddy (Reverse Proxy + SSL)"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get update -qq || true
  apt-get install -y -qq caddy 2>/dev/null || {
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg 2>/dev/null || true
    curl -1sLf 'https://pkgs.caddyserver.com/debian/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://pkgs.caddyserver.com/debian/deb.add' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    apt-get update -qq
    apt-get install -y -qq caddy
  }
fi
sed "s/__DOMAIN__/$DOMAIN/; s/__PORT__/$BACKEND_PORT/" "$REPO_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl enable --now caddy

echo "==> 6/6 Firewall"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
fi

echo
echo "Fertig. Nächste Schritte:"
echo "  1. SUPABASE_SERVICE_ROLE_KEY in $INSTALL_DIR/backend/.env setzen und 'sudo systemctl restart seo-panel'"
echo "  2. DNS: A-Record $DOMAIN -> IP dieses Servers"
echo "  3. Browser: https://$DOMAIN"
echo "     Panel -> Verbindung -> Supabase-Einrichtung: https://supabase.visuart.studio + Service-Role-Key"
