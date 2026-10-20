# Deploy auf deinem eigenen VPS

Alles läuft auf **einer** Maschine: das SEO-Panel-Backend (Deno), die Host-App,
Supabase (Docker) — und der Cron-Timer für die Automatik. Dadurch musst du bei
DataForSEO nur **eine** Server-IP freigeben und hast keine Latenz zwischen den
Diensten.

## Architektur

```
seo.visuart.studio ──► Caddy (SSL/TLS, Reverse Proxy)
   ├─ /api/*  ──► 127.0.0.1:8080  (Deno-Backend, systemd)
   ├─ /       ──► Host-App (Login + Widget, statische Dateien)
   └─ Cron 06:00 ──► systemd-Timer ──► POST /api/cron (KI-Analysen, Rankings, Health)
supabase.visuart.studio  (Supabase, bereits bei dir im Docker-Betrieb)
```

## Voraussetzungen (Annahmen)

- Debian/Ubuntu-VPS, du hast `sudo`/root-Zugriff
- Supabase läuft auf diesem Server bereits per Docker (URL + Service-Role-Key
  kennst du aus deiner Supabase-Konfiguration)
- Caddy wird vom Install-Skript automatisch installiert (für kostenloses SSL)

## Schritte

1. **Projekt auf den Server bringen** (z. B. `git clone` des Repos oder den
   `Source`-Ordner per `scp` hochladen).

2. **Installation ausführen** (als root oder mit `sudo`):

   ```bash
   cd Source/deploy
   sudo ./install.sh
   ```

   Das Skript installiert Deno, legt `/opt/seo-panel` an, erstellt die
   systemd-Unit, den Cron-Timer, Caddy mit deiner Subdomain und öffnet die
   Firewall. Es ist idempotent — erneutes Ausführen ist gefahrlos. Die
   Host-App (Login + Panel) wird aus `host/dist/` nach `/opt/seo-panel/host`
   kopiert; ist kein Build vorhanden und kein Node installiert, weist dich
   das Skript darauf hin (lokal bauen: `npm ci && npm run build:host`).

3. **Service-Role-Key eintragen** (wurde nicht automatisch gesetzt):

   ```bash
   sudo nano /opt/seo-panel/backend/.env
   # SUPABASE_SERVICE_ROLE_KEY=<dein Schlüssel aus der Supabase-Docker-.env>
   sudo systemctl restart seo-panel
   ```

4. **DNS**: A-Record `seo.visuart.studio` auf die IP deines VPS setzen (so wie
   du es für `supabase.visuart.studio` schon gemacht hast). Caddy holt dann
   automatisch das SSL-Zertifikat.

5. **Browser öffnen**: `https://seo.visuart.studio` → **Registrieren** (erstellt
   Workspace + erste Website) → nach Login: einbetten. Danach im Panel unter
   **Verbindung** → **Supabase-Einrichtung** mit `https://supabase.visuart.studio`
   und dem Service-Role-Key. Das Panel legt dann alle Tabellen selbst an
   (funktioniert auch mit selbst gehostetem Supabase über die pg-meta-API).
   Anschließend Abacus.ai-Key unter **Abacus.ai-Verbindung** speichern und
   testen.

## Host-App (Quellcode)

Die Host-App ist eine kleine Vite/React-App in `host/`: Login/Registrierung
gegen `/api/auth/*`, dann das Widget eingebettet. Im Projekt-Root bauen:

```bash
npm ci
npm run build:host   # → host/dist/ (statische Dateien)
```

Der gebaute Stand in `host/dist/` ist eingecheckt, damit der VPS ohne
Node-Instanz deployen kann.

## Konfiguration

| Datei | Zweck |
| --- | --- |
| `install.sh` | Einmaliges Setup (Deno, systemd, Caddy, Timer, Firewall) |
| `seo-panel.service` | systemd-Unit für das Backend (Port 8080) |
| `Caddyfile` | Reverse Proxy + automatisches SSL für die Subdomain |
| `seo-panel-cron.timer` | Tägliche Ausführung der Automatik um 06:00 |
| `seo-panel-cron.service` | Ruft den `/api/cron`-Endpoint des Backends auf |
| `run-cron.sh` | Lädt die Env-Variablen und ruft den Cron-Endpoint |

## Hinweise

- Der Service läuft als `root` (`User=root`) und mit `--allow-all`. Für den
  Produktivbetrieb solltest du das härten (eigenen User `seopanel` anlegen,
  Deno-Rechte minimal setzen). Der Wettbewerbsbetrieb ist damit aber sofort
  möglich.
- Der Health-Scan (Chromium) ist ein eigener Worker und noch nicht Teil dieses
  Pakets — er wird als nächster Schritt ergänzt. KI-Analysen, Rankings und
  Datenbank-Automatik laufen bereits vollständig über den Cron-Timer.
- Wenn du nur `seo-panel.service` (Backend) neu starten willst:
  `sudo systemctl restart seo-panel` · Logs: `journalctl -u seo-panel -f`
