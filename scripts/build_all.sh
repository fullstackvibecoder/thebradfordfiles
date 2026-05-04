#!/usr/bin/env bash
# Full build: ingest votes -> match -> synthesize -> build site. Run from repo root.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
echo "==> ingest_votes"
.venv/bin/python scripts/ingest_votes.py
echo "==> match_votes"
.venv/bin/python scripts/match_votes.py
echo "==> synthesize_all"
.venv/bin/python scripts/synthesize_all.py
echo "==> build_site"
.venv/bin/python scripts/build_site.py
echo "==> done"
