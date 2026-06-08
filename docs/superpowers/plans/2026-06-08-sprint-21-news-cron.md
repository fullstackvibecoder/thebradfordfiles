# Daily News-Refresh Cron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the Sprint-20 news pipeline daily via a new GitHub Actions workflow that polls feeds, extracts candidate quotes, rebuilds dossiers, commits, and deploys.

**Architecture:** A bash orchestrator (`scripts/news_refresh.sh`, mirroring `build_all.sh`, with a CI python fallback) runs `scrape_news → extract_news` per candidate `→ build_site`. A separate daily workflow (`news-refresh.yml`) installs minimal deps, runs the orchestrator, commits the quote records + metadata (article bodies gitignored), deploys via Vercel, and opens an issue on failure.

**Tech Stack:** Bash, GitHub Actions, Python (stdlib + `anthropic`/`python-dotenv`). This sprint is CI/orchestration glue — the pipeline stages it calls are already unit-tested (Sprint 20); validation is a local run + a post-merge `workflow_dispatch`.

---

### Task 1: Gitignore article bodies + minimal CI requirements

**Files:**
- Modify: `.gitignore`
- Create: `requirements-news.txt`

- [ ] **Step 1: Gitignore the transient/copyrighted article bodies**

Append to `.gitignore` (under a clear comment):

```
# News article bodies — third-party copyrighted content, transient intermediate
# (resumability runs off data/*/news/articles.jsonl + records.jsonl, not these)
data/*/news/*.txt
```

- [ ] **Step 2: Create `requirements-news.txt`**

```
# Minimal runtime deps for the news cron (scrape_news + build_site are stdlib;
# only extract_news needs these). Excludes whisper/torch/instagrapi/yt-dlp.
anthropic>=0.97
python-dotenv>=1.0
```

- [ ] **Step 3: Verify the gitignore rule works**

Run (from repo root):
```bash
mkdir -p data/oliviachow/news && echo "body" > data/oliviachow/news/_tmp_check.txt
git check-ignore data/oliviachow/news/_tmp_check.txt && echo "IGNORED OK"
rm -f data/oliviachow/news/_tmp_check.txt
```
Expected: prints the path + "IGNORED OK".

- [ ] **Step 4: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add .gitignore requirements-news.txt
git commit -m "chore(sprint-21): gitignore news article bodies + requirements-news.txt

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `news_refresh.sh` orchestrator

**Files:**
- Create: `scripts/news_refresh.sh`

- [ ] **Step 1: Write the orchestrator**

Create `scripts/news_refresh.sh`:

```bash
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
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/news_refresh.sh
```

- [ ] **Step 3: Verify it runs end-to-end locally (the realistic quiet-day path)**

Run (from repo root; the local env is patched + has `.env` with `ANTHROPIC_API_KEY`):
```bash
bash scripts/news_refresh.sh; echo "EXIT=$?"
```
Expected: prints the `==> scrape_news` / `extract_news` per-candidate / `build_site` / `done` stages and `EXIT=0`. On a quiet day scrape writes 0 articles, each extract no-ops ("no news index"), build_site rebuilds. (If a candidate story happens to be live, it ingests quotes — also fine.)

- [ ] **Step 4: Confirm no stray article-body files got committed-eligible**

Run: `git status --short | grep 'news/.*\.txt' || echo "no .txt staged (gitignored) ✓"`
Expected: "no .txt staged".

- [ ] **Step 5: Commit (script only; do not commit any data churn from the test run)**

```bash
cd /Users/aramammo/thebradfordfiles
git add scripts/news_refresh.sh
git commit -m "feat(sprint-21): news_refresh.sh orchestrator (scrape -> extract -> build)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
NOTE: if the local run produced data changes (e.g. a rebuilt dossier timestamp), do NOT include them in this commit — `git checkout -- data/ web/public/data/` to discard them first, since real data refreshes are the cron's job, not this wiring commit. Stage ONLY `scripts/news_refresh.sh`.

---

### Task 3: `news-refresh.yml` workflow

**Files:**
- Create: `.github/workflows/news-refresh.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/news-refresh.yml`:

```yaml
name: Daily news refresh

on:
  schedule:
    - cron: "0 11 * * *"   # ~06:00 ET daily
  workflow_dispatch: {}

permissions:
  contents: write
  issues: write

jobs:
  news:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install -r requirements-news.txt

      - name: Run news refresh
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: bash scripts/news_refresh.sh

      - name: Commit changes
        run: |
          git config user.name "news-refresh[bot]"
          git config user.email "actions@github.com"
          git add data/                       # respects .gitignore (excludes *.txt); stages news index + records
          git add -f web/public/data/         # -f: web/public/data is gitignored; stage rebuilt dossiers
          if git diff --staged --quiet; then
            echo "No news changes."
            echo "PUSHED=false" >> "$GITHUB_ENV"
          else
            DATE=$(date -u +%Y-%m-%d)
            git commit -m "news: daily refresh ${DATE}"
            git push
            echo "PUSHED=true" >> "$GITHUB_ENV"
          fi

      - name: Deploy to Vercel
        if: env.PUSHED == 'true'
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: |
          if [ -z "$VERCEL_TOKEN" ] || [ -z "$VERCEL_ORG_ID" ] || [ -z "$VERCEL_PROJECT_ID" ]; then
            echo "VERCEL_* secrets not set. Skipping deploy."
            exit 0
          fi
          npm install --global vercel@latest
          vercel pull --yes --environment=production --token=$VERCEL_TOKEN
          vercel build --prod --token=$VERCEL_TOKEN
          vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN

      - name: Open failure issue
        if: failure()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh issue create \
            --title "News refresh failed $(date -u +%Y-%m-%d)" \
            --body "The daily news-refresh workflow failed. Run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}" \
            --label "news-refresh-failure" || true
```

- [ ] **Step 2: Validate the YAML parses**

Run (from repo root):
```bash
.venv/bin/python -c "import sys; sys.path.insert(0,'scripts'); import yaml" 2>/dev/null && \
  .venv/bin/python -c "import yaml; yaml.safe_load(open('.github/workflows/news-refresh.yml')); print('YAML OK')" \
  || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/news-refresh.yml')); print('YAML OK')" \
  || echo "pyyaml not installed; skip parse check (YAML will be validated by GitHub on push)"
```
Expected: "YAML OK" (or the skip note if pyyaml isn't present — acceptable; GitHub validates on push).

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add .github/workflows/news-refresh.yml
git commit -m "feat(sprint-21): daily news-refresh GitHub Actions workflow

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Post-merge (operator + controller, not a code task)

- [ ] Operator adds the `ANTHROPIC_API_KEY` GitHub Actions secret (Settings → Secrets → Actions). Without it, the run FATALs and opens a failure issue.
- [ ] After push, trigger a manual run: `gh workflow run news-refresh.yml`, then `gh run watch` / check the Actions tab. Expected: green run; `PUSHED=false` on a quiet day (no commit), or a real `news: daily refresh` commit + deploy if a candidate story is live.

---

## Self-Review

- **Spec coverage:** `news_refresh.sh` orchestrator with `.venv`→`python3` fallback + candidate loop (Task 2) ✓; `requirements-news.txt` minimal deps (Task 1) ✓; daily `news-refresh.yml` with setup-python/install/run/commit/deploy/failure-issue (Task 3) ✓; commit boundary — `git add data/` (gitignore-respecting, includes index+records, excludes .txt) + `git add -f web/public/data/` (Task 3) ✓; gitignore `data/*/news/*.txt` (Task 1) ✓; failure issue via inline `gh issue create` — resolves the spec's open item (post-refresh-issue.mjs no-ops without a summary, so it's NOT reused) ✓; ANTHROPIC_API_KEY secret + workflow_dispatch validation (Post-merge) ✓.
- **Placeholder scan:** No TBD/TODO. The failure-issue decision is resolved (inline gh, not the receipt script). Every step has concrete commands.
- **Consistency:** `news_refresh.sh` calls the real script names (`scrape_news.py`, `extract_news.py --account <h>`, `build_site.py`) and the real `lib.candidates.load_all_candidates()` (returns dicts with `handle`). The workflow's `git add` paths match the gitignore boundary from Task 1 (`.txt` excluded, `web/public/data` force-added). Cron/runtime/secret names are concrete and match the existing `data-refresh.yml` conventions.
- **Testing note:** No TDD red→green — this is YAML + a bash orchestrator over already-tested stages. Validation is the local `news_refresh.sh` run (Task 2 Step 3) + the post-merge `workflow_dispatch`. No new unit-testable Python logic is introduced (candidate enumeration is a one-line `python -c` over the tested loader).
