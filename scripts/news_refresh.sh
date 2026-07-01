#!/usr/bin/env bash
# Daily news refresh: scrape feeds -> extract candidate quotes -> rebuild dossiers.
# Runnable locally (uses .venv if present) and in CI (falls back to python3).
set -euo pipefail
cd "$(dirname "$0")/.."

# Prefer the local venv; CI runners have no venv -> python3.
PY=".venv/bin/python"
[ -x "$PY" ] || PY="python3"

# Local convenience: load .env. CI provides env vars (e.g. ANTHROPIC_API_KEY) directly.
[ -f .env ] && set -a && . ./.env && set +a

echo "==> scrape_news"
"$PY" scripts/scrape_news.py

echo "==> extract_news (per candidate)"
HANDLES=$("$PY" -c "import sys; sys.path.insert(0,'scripts'); from lib import candidates as c; print(' '.join(p['handle'] for p in c.load_all_candidates()))")
for h in $HANDLES; do
  echo "  -- $h"
  "$PY" scripts/extract_news.py --account "$h"
done

echo "==> build_site"
"$PY" scripts/build_site.py
echo "==> done"
