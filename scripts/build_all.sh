#!/usr/bin/env bash
# Full build: ingest votes -> match -> build site. Run from repo root.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
echo "==> ingest_votes"
.venv/bin/python scripts/ingest_votes.py
echo "==> match_votes"
.venv/bin/python scripts/match_votes.py
echo "==> build_site"
.venv/bin/python scripts/build_site.py
echo "==> done"
