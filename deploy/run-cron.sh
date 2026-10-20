#!/usr/bin/env bash
set -euo pipefail
set -a
source /opt/seo-panel/backend/.env
set +a
curl -fsS --max-time 120 -X POST \
  -H "Content-Type: application/json" \
  -H "X-SEO-Job-Key: $SEO_JOB_KEY" \
  -d '{}' \
  http://127.0.0.1:8080/api/cron
