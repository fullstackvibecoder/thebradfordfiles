# T.O. Mayoral Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing single-candidate Bradford Files dashboard into a multi-candidate Toronto 2026 mayoral race tracker (The T.O. Mayoral Files) with primary-source council-vote verification, reader-feedback voting on per-record claims, issue-priority polling with agenda-gap visualization, and Pol.is deliberation for marquee topics.

**Architecture:** Static HTML on Vercel + per-candidate JSON dossiers + Vercel serverless functions (`/api/*`, Fluid Compute / Node 24) + Upstash Redis (via Vercel Marketplace) for live counters + Cloudflare Turnstile for anti-brigading + Pol.is iframe for deliberation. The existing Python pipeline (instagrapi triage + Opus extraction + Deepgram transcription) is unchanged. New ingestion: City of Toronto council voting record JSON files (~200K rows) cross-referenced against extracted Action records.

**Tech Stack:** Python 3.11 (existing pipeline) · vanilla HTML/CSS/JS (no framework) · Vercel Functions (Node.js 24, Fluid Compute) · `@upstash/redis` · Cloudflare Turnstile · Pol.is hosted iframe.

**Phase milestones:**
- Phase 2 (Tasks 1–9): multi-candidate scaffold ships — landing card grid, per-candidate routes, candidate manifest, refactored build script.
- Phase 3 (Tasks 10–15): council voting record verification ships — green ✓ Verified badges.
- Phase 4 (Tasks 16–22): per-record reader voting ships — kept/broke/too-early widgets.
- Phase 5 (Tasks 23–27): issue-priority polling + agenda-gap viz ships.
- Phase 6 (Tasks 28–29): Pol.is deliberation embeds ship.

Each phase ends with a deploy task; each phase produces a usable site improvement on its own.

---

## Pre-flight: confirm baseline

### Task 0: Verify current repo state and pipeline progress

**Files:** read-only checks across the working tree.

- [ ] **Step 1:** Confirm working tree clean.

```bash
cd /Users/aramammo/thebradfordfiles
git status --short
```

Expected: only `data/` mutations from the in-flight pipeline; no uncommitted edits to `scripts/` or `site/`.

- [ ] **Step 2:** Confirm extraction is healthy.

```bash
ps -p 52060 -o pid,etime,command 2>&1 | head -2
wc -l data/bradfordgrams/extracted.jsonl data/bradfordgrams/records.jsonl
```

- [ ] **Step 3:** Confirm Chow triage is alive or done.

```bash
ps -p 61655 -o pid,etime,command 2>&1 | head -2
wc -l data/oliviachow/triage.jsonl
```

If neither running and triage incomplete, restart: `nohup .venv/bin/python scripts/triage.py --account oliviachow > triage-oliviachow.log 2>&1 &`

- [ ] **Step 4:** Verify Vercel CLI is authenticated and the project is linked.

```bash
vercel whoami
cat site/.vercel/project.json 2>/dev/null | head -5
```

---

# Phase 2: Multi-Candidate Scaffold (Tasks 1–9)

## Task 1: Add per-candidate manifest schema

**Files:**
- Create: `data/bradfordgrams/candidate.json`
- Create: `data/oliviachow/candidate.json`
- Create: `data/beybradford/candidate.json` (alias for Bradford's councillor account)

- [ ] **Step 1:** Write the Bradford manifest.

```bash
cat > data/bradfordgrams/candidate.json <<'EOF'
{
  "handle": "bradfordgrams",
  "slug": "bradford",
  "display_name": "Brad Bradford",
  "surname": "Bradford",
  "files_label": "The Bradford Files",
  "current_role": "City Councillor, Beaches–East York (since 2018)",
  "former_roles": ["Former city planner"],
  "council_terms": ["2018-2022", "2022-2026"],
  "council_name_for_vote_lookup": {"first": "Brad", "last": "Bradford"},
  "candidacy_status": "declared",
  "declared_date": "2026-05-01",
  "result_2023": {"placement": 8, "vote_share_pct": 1.5, "votes": 9000, "approximate": true},
  "platform_pillars": ["crime", "congestion", "cost of living"],
  "ig_handle": "bradfordgrams",
  "alias_handles": ["beybradford"],
  "sources": [
    "CBC News (May 1, 2026)",
    "2023 City of Toronto mayoral byelection results"
  ]
}
EOF
```

- [ ] **Step 2:** Write the Chow manifest.

```bash
cat > data/oliviachow/candidate.json <<'EOF'
{
  "handle": "oliviachow",
  "slug": "chow",
  "display_name": "Olivia Chow",
  "surname": "Chow",
  "files_label": "The Chow Files",
  "current_role": "Mayor of Toronto (since June 2023)",
  "former_roles": [
    "NDP Member of Parliament for Trinity-Spadina (2006-2014)",
    "Toronto City Councillor (1991-2005)"
  ],
  "council_terms": ["2022-2026"],
  "council_name_for_vote_lookup": {"first": "Olivia", "last": "Chow"},
  "candidacy_status": "expected",
  "declared_date": null,
  "result_2023": {"placement": 1, "vote_share_pct": 37.0, "votes": 270000, "approximate": true},
  "platform_pillars": ["housing affordability", "transit investment", "social services"],
  "ig_handle": "oliviachow",
  "alias_handles": [],
  "sources": [
    "2023 City of Toronto mayoral byelection results",
    "CBC News (May 1, 2026)"
  ]
}
EOF
```

- [ ] **Step 3:** Write the Bradford-councillor alias manifest.

```bash
cat > data/beybradford/candidate.json <<'EOF'
{
  "handle": "beybradford",
  "alias_of": "bradfordgrams",
  "display_name": "Brad Bradford (councillor archive)",
  "note": "Councillor-era IG account. Records merge into Bradford's main dossier."
}
EOF
```

- [ ] **Step 4:** Validate JSON syntax.

```bash
python3 -c "import json; [json.load(open(p)) for p in ['data/bradfordgrams/candidate.json','data/oliviachow/candidate.json','data/beybradford/candidate.json']]; print('valid')"
```

Expected: `valid`.

- [ ] **Step 5:** Commit.

```bash
git add data/bradfordgrams/candidate.json data/oliviachow/candidate.json data/beybradford/candidate.json
git commit -m "feat: add per-candidate manifest schema"
```

## Task 2: Add candidate-discovery helper module (TDD)

**Files:**
- Create: `scripts/lib/__init__.py`
- Create: `scripts/lib/candidates.py`
- Create: `tests/__init__.py`
- Create: `tests/test_candidates.py`

- [ ] **Step 1:** Set up directories.

```bash
mkdir -p scripts/lib tests
touch scripts/lib/__init__.py tests/__init__.py
```

- [ ] **Step 2:** Install pytest if missing.

```bash
.venv/bin/pip show pytest >/dev/null 2>&1 || .venv/bin/pip install pytest
```

- [ ] **Step 3:** Write the failing test.

Write `tests/test_candidates.py`:

```python
"""Tests for candidate manifest discovery."""
import json
from pathlib import Path

import pytest

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.lib import candidates


def _seed(dirpath: Path, **fields):
    dirpath.mkdir(parents=True, exist_ok=True)
    (dirpath / "candidate.json").write_text(json.dumps(fields))


def test_load_all_candidates_finds_bradford_and_chow(tmp_path, monkeypatch):
    _seed(tmp_path / "bradfordgrams",
          handle="bradfordgrams", slug="bradford",
          display_name="Brad Bradford", surname="Bradford",
          files_label="The Bradford Files", candidacy_status="declared")
    _seed(tmp_path / "oliviachow",
          handle="oliviachow", slug="chow",
          display_name="Olivia Chow", surname="Chow",
          files_label="The Chow Files", candidacy_status="expected")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    handles = sorted(c["handle"] for c in candidates.load_all_candidates())
    assert handles == ["bradfordgrams", "oliviachow"]


def test_load_all_candidates_excludes_aliases(tmp_path, monkeypatch):
    _seed(tmp_path / "beybradford",
          handle="beybradford", alias_of="bradfordgrams",
          display_name="Brad Bradford (alias)")
    _seed(tmp_path / "bradfordgrams",
          handle="bradfordgrams", slug="bradford",
          display_name="Brad Bradford", surname="Bradford",
          files_label="The Bradford Files", candidacy_status="declared")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    handles = [c["handle"] for c in candidates.load_all_candidates()]
    assert handles == ["bradfordgrams"]


def test_load_all_candidates_sorts_alphabetically_by_surname(tmp_path, monkeypatch):
    for handle, surname in [("oliviachow", "Chow"), ("bradfordgrams", "Bradford"), ("brown", "Brown")]:
        _seed(tmp_path / handle,
              handle=handle, slug=surname.lower(),
              display_name=f"X {surname}", surname=surname,
              files_label=f"The {surname} Files", candidacy_status="declared")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    surnames = [c["surname"] for c in candidates.load_all_candidates()]
    assert surnames == ["Bradford", "Brown", "Chow"]
```

- [ ] **Step 4:** Run test to verify it fails.

```bash
.venv/bin/python -m pytest tests/test_candidates.py -v
```

Expected: ImportError on `scripts.lib.candidates`.

- [ ] **Step 5:** Write the minimal implementation.

`scripts/lib/candidates.py`:

```python
"""Candidate manifest discovery and loading."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"


def load_all_candidates() -> list[dict]:
    """Return all primary candidate manifests, alphabetically by surname.
    Aliases (handles with `alias_of`) are excluded."""
    out: list[dict] = []
    for sub in sorted(DATA_DIR.iterdir()):
        if not sub.is_dir():
            continue
        manifest_path = sub / "candidate.json"
        if not manifest_path.exists():
            continue
        try:
            manifest = json.loads(manifest_path.read_text())
        except json.JSONDecodeError:
            continue
        if manifest.get("alias_of"):
            continue
        out.append(manifest)
    out.sort(key=lambda c: (c.get("surname", ""), c.get("display_name", "")))
    return out


def load_candidate(handle: str) -> dict | None:
    manifest_path = DATA_DIR / handle / "candidate.json"
    if not manifest_path.exists():
        return None
    return json.loads(manifest_path.read_text())


def alias_handles_for(handle: str) -> list[str]:
    manifest = load_candidate(handle)
    if not manifest:
        return []
    return list(manifest.get("alias_handles", []))
```

- [ ] **Step 6:** Run tests to verify they pass.

```bash
.venv/bin/python -m pytest tests/test_candidates.py -v
```

Expected: 3 passed.

- [ ] **Step 7:** Commit.

```bash
git add scripts/lib/__init__.py scripts/lib/candidates.py tests/__init__.py tests/test_candidates.py
git commit -m "feat: add candidate manifest discovery helpers"
```

## Task 3: Refactor `build_site.py` to emit per-candidate dossiers (TDD)

**Files:**
- Modify: `scripts/build_site.py` (full rewrite)
- Create: `tests/conftest.py`
- Create: `tests/test_build_site.py`

- [ ] **Step 1:** Write the conftest fixture.

`tests/conftest.py`:

```python
"""Shared fixtures for build_site tests."""
import json
from pathlib import Path

import pytest


@pytest.fixture
def tmp_repo(tmp_path):
    """Skeleton repo with two candidates and tiny data files, plus a template."""
    data = tmp_path / "data"
    site = tmp_path / "site"
    site.mkdir()
    (site / "candidate-template.html").write_text(
        "<title>__FILES_LABEL__</title>"
        "<div class=\"brand-tagline\" id=\"brand-tagline\">__BRAND_TAGLINE__</div>"
        "<script>fetch(\"__CANDIDATE_DOSSIER__\");</script>"
    )
    b = data / "bradfordgrams"
    b.mkdir(parents=True)
    (b / "candidate.json").write_text(json.dumps({
        "handle": "bradfordgrams", "slug": "bradford",
        "display_name": "Brad Bradford", "surname": "Bradford",
        "files_label": "The Bradford Files", "current_role": "City Councillor",
        "candidacy_status": "declared", "platform_pillars": ["crime", "congestion"],
    }))
    (b / "triage.jsonl").write_text(json.dumps({
        "shortcode": "X", "date": "2026-01-01", "url": "u", "type": "video",
        "is_video": True, "caption_excerpt": "...",
        "triage": {"bucket": "substantive", "reason": "x", "topics": ["transit"]},
    }) + "\n")
    (b / "posts.jsonl").write_text("")
    (b / "records.jsonl").write_text(json.dumps({
        "kind": "position", "shortcode": "X", "post_url": "u", "post_date": "2026-01-01",
        "topic": "transit", "summary": "test", "stance": "supports", "source_quote": "q",
    }) + "\n")
    (b / "extracted.jsonl").write_text("")
    c = data / "oliviachow"
    c.mkdir(parents=True)
    (c / "candidate.json").write_text(json.dumps({
        "handle": "oliviachow", "slug": "chow",
        "display_name": "Olivia Chow", "surname": "Chow",
        "files_label": "The Chow Files", "current_role": "Mayor of Toronto",
        "candidacy_status": "expected", "platform_pillars": ["housing"],
    }))
    for f in ("triage.jsonl", "posts.jsonl", "records.jsonl", "extracted.jsonl"):
        (c / f).write_text("")
    return tmp_path


@pytest.fixture
def run_build(tmp_repo, monkeypatch):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from scripts import build_site
    from scripts.lib import candidates
    monkeypatch.setattr(build_site, "ROOT", tmp_repo)
    monkeypatch.setattr(build_site, "DATA_DIR", tmp_repo / "data")
    monkeypatch.setattr(build_site, "SITE_DIR", tmp_repo / "site")
    monkeypatch.setattr(build_site, "MATCHES_FILE", tmp_repo / "data" / "votes" / "matches.jsonl")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_repo / "data")
    build_site.main([])
    return tmp_repo
```

- [ ] **Step 2:** Write failing tests.

`tests/test_build_site.py`:

```python
"""Tests for build_site.py multi-candidate output."""
import json


def test_build_writes_landing_json(tmp_repo, run_build):
    landing = json.loads((tmp_repo / "site" / "landing.json").read_text())
    surnames = [c["surname"] for c in landing["candidates"]]
    assert surnames == ["Bradford", "Chow"]
    assert "generated_at" in landing


def test_build_writes_per_candidate_dossier(tmp_repo, run_build):
    bradford = json.loads((tmp_repo / "site" / "candidates" / "bradford.json").read_text())
    assert bradford["meta"]["handle"] == "bradfordgrams"
    assert bradford["meta"]["files_label"] == "The Bradford Files"
    assert "records" in bradford
    assert "skip_log" in bradford


def test_landing_card_has_minimum_fields(tmp_repo, run_build):
    landing = json.loads((tmp_repo / "site" / "landing.json").read_text())
    card = next(c for c in landing["candidates"] if c["surname"] == "Bradford")
    for field in ("slug", "display_name", "files_label", "current_role",
                  "candidacy_status", "platform_pillars",
                  "post_count", "record_count"):
        assert field in card, f"missing {field}"


def test_per_candidate_html_emitted_with_correct_dossier_url(tmp_repo, run_build):
    text = (tmp_repo / "site" / "bradford" / "index.html").read_text()
    assert "/candidates/bradford.json" in text
    assert "__CANDIDATE_DOSSIER__" not in text
    assert "The Bradford Files" in text
```

- [ ] **Step 3:** Run tests to verify they fail.

```bash
.venv/bin/python -m pytest tests/test_build_site.py -v
```

Expected: failures (build_site.py outputs old single-file `data.json` only).

- [ ] **Step 4:** Rewrite `scripts/build_site.py`.

```python
#!/usr/bin/env python3
"""build_site.py: assemble per-candidate dossiers + landing JSON.

Reads candidate manifests under data/<handle>/candidate.json plus their
triage/records/posts/extracted data, and writes:

  site/landing.json                  -- one row per candidate for the card grid
  site/candidates/<slug>.json        -- full dossier per candidate
  site/<slug>/index.html             -- per-candidate page from the template
  site/data.json                     -- back-compat aggregate (kept for now)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import candidates as _candidates  # type: ignore  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SITE_DIR = ROOT / "site"
MATCHES_FILE = DATA_DIR / "votes" / "matches.jsonl"


def _load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows: list[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def _load_matches() -> dict[str, dict]:
    if not MATCHES_FILE.exists():
        return {}
    out: dict[str, dict] = {}
    for line in MATCHES_FILE.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            m = json.loads(line)
        except json.JSONDecodeError:
            continue
        sc = m.get("record_shortcode")
        if not sc:
            continue
        existing = out.get(sc)
        if not existing or m.get("confidence", 0) > existing.get("confidence", 0):
            out[sc] = m
    return out


def _candidate_dossier(manifest: dict, matches_by_sc: dict[str, dict]) -> dict:
    handle = manifest["handle"]
    handles_to_load = [handle] + manifest.get("alias_handles", [])

    records: list[dict] = []
    posts_index: dict[str, dict] = {}
    triages: list[dict] = []
    skip_log: list[dict] = []
    extracted: list[dict] = []

    for h in handles_to_load:
        d = DATA_DIR / h
        if not d.exists():
            continue
        records.extend(_load_jsonl(d / "records.jsonl"))
        for p in _load_jsonl(d / "posts.jsonl"):
            sc = p.get("shortcode")
            if sc:
                posts_index[sc] = {**p, "source_account": h}
        for t in _load_jsonl(d / "triage.jsonl"):
            triages.append(t)
            if t.get("triage", {}).get("bucket") == "skip":
                skip_log.append({
                    "shortcode": t.get("shortcode"),
                    "source_account": h,
                    "date": t.get("date", ""),
                    "url": t.get("url", ""),
                    "type": t.get("type", ""),
                    "caption_excerpt": t.get("caption_excerpt", ""),
                    "reason": t.get("triage", {}).get("reason", ""),
                })
        extracted.extend(_load_jsonl(d / "extracted.jsonl"))

    for r in records:
        r.setdefault("candidate_slug", manifest["slug"])
        r.setdefault("source_account", handle)
        if r.get("kind") == "action":
            sc = r.get("shortcode")
            if sc and sc in matches_by_sc:
                r["council_verification"] = matches_by_sc[sc]

    records.sort(key=lambda r: r.get("post_date", ""), reverse=True)
    skip_log.sort(key=lambda r: r.get("date", ""), reverse=True)

    triage_buckets = Counter(t.get("triage", {}).get("bucket", "?") for t in triages)
    record_kinds = Counter(r.get("kind", "?") for r in records)
    record_topics = Counter(r.get("topic") for r in records if r.get("topic"))

    substantive_posts = {t["shortcode"] for t in triages
                         if t.get("triage", {}).get("bucket") == "substantive" and t.get("shortcode")}
    emphasis: dict[str, float] = {}
    if substantive_posts:
        topic_post_count: dict[str, set[str]] = {}
        for r in records:
            sc = r.get("shortcode")
            t = r.get("topic")
            if not (sc and t and sc in substantive_posts):
                continue
            topic_post_count.setdefault(t, set()).add(sc)
        for topic, scs in topic_post_count.items():
            emphasis[topic] = round(100 * len(scs) / len(substantive_posts), 1)

    dates = sorted(t["date"][:10] for t in triages if t.get("date"))
    earliest = dates[0] if dates else None
    latest = dates[-1] if dates else None

    return {
        "meta": {
            **manifest,
            "post_count": len(triages),
            "extracted_count": len(extracted),
            "record_count": len(records),
            "buckets": dict(triage_buckets),
            "record_kinds": dict(record_kinds.most_common()),
            "record_topics": dict(record_topics.most_common()),
            "emphasis": emphasis,
            "date_range": {"earliest": earliest, "latest": latest},
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "records": records,
        "posts": posts_index,
        "skip_log": skip_log,
    }


def _landing_card(dossier: dict) -> dict:
    m = dossier["meta"]
    return {
        "slug": m["slug"],
        "surname": m["surname"],
        "display_name": m["display_name"],
        "files_label": m["files_label"],
        "current_role": m.get("current_role", ""),
        "candidacy_status": m.get("candidacy_status", "unknown"),
        "declared_date": m.get("declared_date"),
        "result_2023": m.get("result_2023"),
        "platform_pillars": m.get("platform_pillars", []),
        "post_count": m["post_count"],
        "record_count": m["record_count"],
        "extracted_count": m["extracted_count"],
        "emphasis": m.get("emphasis", {}),
        "date_range": m["date_range"],
    }


def _build_tagline(manifest: dict) -> str:
    name = manifest["display_name"]
    role = manifest.get("current_role", "")
    return (
        f"{name} — {role}. A sourced record of their public political "
        f"content on Instagram: positions, pledges, council actions, "
        f"endorsements, and appearances."
    )


def _emit_candidate_html(manifest: dict) -> None:
    slug = manifest["slug"]
    template_path = SITE_DIR / "candidate-template.html"
    if not template_path.exists():
        print(f"  WARN: candidate-template.html not found; skipping HTML for {slug}")
        return
    template = template_path.read_text()
    rendered = (
        template
        .replace("__CANDIDATE_DOSSIER__", f"/candidates/{slug}.json")
        .replace("__FILES_LABEL__", manifest["files_label"])
        .replace("__BRAND_TAGLINE__", _build_tagline(manifest))
        .replace("__TURNSTILE_SITE_KEY__",
                 os.environ.get("TURNSTILE_SITE_KEY", "__TURNSTILE_SITE_KEY__"))
    )
    out_dir = SITE_DIR / slug
    out_dir.mkdir(exist_ok=True)
    (out_dir / "index.html").write_text(rendered)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.parse_args(argv)

    SITE_DIR.mkdir(exist_ok=True)
    (SITE_DIR / "candidates").mkdir(exist_ok=True)

    primaries = _candidates.load_all_candidates()
    if not primaries:
        print("[build] no candidates found in data/")
        return 0

    matches_by_sc = _load_matches()

    landing_cards: list[dict] = []
    combined_records: list[dict] = []
    combined_posts: dict[str, dict] = {}
    combined_skip: list[dict] = []

    for manifest in primaries:
        dossier = _candidate_dossier(manifest, matches_by_sc)
        slug = manifest["slug"]
        out_path = SITE_DIR / "candidates" / f"{slug}.json"
        out_path.write_text(json.dumps(dossier, ensure_ascii=False))
        size_kb = out_path.stat().st_size / 1024
        print(f"  wrote site/candidates/{slug}.json ({size_kb:.1f} KB, "
              f"{dossier['meta']['record_count']} records)")
        landing_cards.append(_landing_card(dossier))
        combined_records.extend(dossier["records"])
        combined_posts.update(dossier["posts"])
        combined_skip.extend(dossier["skip_log"])
        _emit_candidate_html(manifest)

    landing = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "candidates": landing_cards,
    }
    (SITE_DIR / "landing.json").write_text(json.dumps(landing, ensure_ascii=False, indent=2))
    print(f"  wrote site/landing.json ({len(landing_cards)} candidates)")

    combined = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "accounts": [c["slug"] for c in landing_cards],
            "record_count": len(combined_records),
        },
        "records": combined_records,
        "posts": combined_posts,
        "skip_log": combined_skip,
    }
    (SITE_DIR / "data.json").write_text(json.dumps(combined, ensure_ascii=False))
    print(f"  wrote site/data.json (back-compat, {len(combined_records)} records)")

    issues_path = SITE_DIR / "issues" / "index.html"
    if issues_path.exists():
        text = issues_path.read_text()
        text = text.replace(
            "__TURNSTILE_SITE_KEY__",
            os.environ.get("TURNSTILE_SITE_KEY", "__TURNSTILE_SITE_KEY__"),
        )
        issues_path.write_text(text)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5:** Run tests.

```bash
.venv/bin/python -m pytest tests/test_build_site.py -v
```

Expected: 4 passed.

- [ ] **Step 6:** Commit.

```bash
git add scripts/build_site.py tests/conftest.py tests/test_build_site.py
git commit -m "feat: build_site emits per-candidate dossiers + HTML pages"
```

## Task 4: Convert existing `site/index.html` into the per-candidate template

**Files:**
- Rename: `site/index.html` → `site/candidate-template.html`
- Modify: the renamed file (substitute placeholders)

- [ ] **Step 1:** Rename via git.

```bash
git mv site/index.html site/candidate-template.html
```

- [ ] **Step 2:** Replace the data fetch URL with the build-time placeholder.

```bash
python3 - <<'PY'
from pathlib import Path
p = Path("site/candidate-template.html")
text = p.read_text()
text = text.replace('fetch("./data.json"', 'fetch("__CANDIDATE_DOSSIER__"')
p.write_text(text)
PY
grep -c "__CANDIDATE_DOSSIER__" site/candidate-template.html
```

Expected: `1`.

- [ ] **Step 3:** Replace the page title.

```bash
python3 - <<'PY'
from pathlib import Path
import re
p = Path("site/candidate-template.html")
text = p.read_text()
text = re.sub(
    r"<title>The Bradford Files[^<]*</title>",
    "<title>__FILES_LABEL__ &middot; The T.O. Mayoral Files</title>",
    text, count=1,
)
text = re.sub(
    r'<div class="brand-title">The Bradford Files</div>',
    '<div class="brand-title">__FILES_LABEL__</div>',
    text, count=1,
)
text = re.sub(
    r'<div class="brand-tagline" id="brand-tagline">[\s\S]*?</div>',
    '<div class="brand-tagline" id="brand-tagline">__BRAND_TAGLINE__</div>',
    text, count=1,
)
p.write_text(text)
PY
grep -c "__FILES_LABEL__\|__BRAND_TAGLINE__" site/candidate-template.html
```

Expected: `3` or more matches across both placeholders.

- [ ] **Step 4:** Run real build, verify output.

```bash
.venv/bin/python scripts/build_site.py
ls site/bradford/index.html site/chow/index.html
grep -c "/candidates/bradford.json" site/bradford/index.html
grep -c "The Bradford Files" site/bradford/index.html
```

Expected: each candidate has a page; substitutions applied.

- [ ] **Step 5:** Commit.

```bash
git add site/candidate-template.html
git commit -m "feat: convert site/index.html into per-candidate template"
```

## Task 5: Build the new landing page (`site/index.html`)

**Files:** Create `site/index.html` (the new multi-candidate landing).

- [ ] **Step 1:** Write the landing page.

`site/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The T.O. Mayoral Files &middot; Independent record of Toronto's 2026 mayoral race</title>
<meta name="description" content="Independent civic-transparency record of every confirmed candidate in Toronto's 2026 mayoral race. Every record sourced. Not affiliated with any candidate or campaign.">
<meta name="theme-color" content="#0d2f5c">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=Source+Serif+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root{--c-bg:#fff;--c-bg-alt:#f7f8fa;--c-primary:#1a4480;--c-primary-dark:#0d2f5c;--c-primary-vivid:#0050d8;--c-base:#1b1b1b;--c-base-light:#5a6573;--c-border-strong:#c9c9c9;--c-accent:#da291c;--ttc-line1:#ffce00;--ttc-line2:#00923f;--ttc-line3:#00a4e4;--ttc-line4:#a21a68}
*{box-sizing:border-box;margin:0;padding:0}
body{font:16px/1.5 "Public Sans",system-ui,sans-serif;color:var(--c-base);background:var(--c-bg-alt);min-height:100vh}
a{color:var(--c-primary-vivid);text-underline-offset:2px}
a:hover{color:var(--c-primary-dark)}
.topstrip{background:#2c2c2c;color:rgba(255,255,255,.85);font-size:12px;padding:8px 0;text-align:center}
.topstrip strong{color:#fff}
.site-header{background:var(--c-primary-dark);color:#fff;position:relative;overflow:hidden}
.cn-tower{position:absolute;right:max(24px,4vw);bottom:0;height:105%;width:auto;opacity:.18;pointer-events:none}
.subway-stripe{height:6px;display:flex}
.subway-stripe span{flex:1}
.subway-stripe .l1{background:var(--ttc-line1)}.subway-stripe .l2{background:var(--ttc-line2)}.subway-stripe .l3{background:var(--ttc-line3)}.subway-stripe .l4{background:var(--ttc-line4)}.subway-stripe .ttc{background:var(--c-accent);flex:1.5}
.site-header-inner{max-width:1280px;margin:0 auto;padding:32px 24px 28px}
.brand-overline{font:600 11px/1 "Public Sans",sans-serif;text-transform:uppercase;letter-spacing:.18em;color:var(--c-accent);margin-bottom:6px}
.brand-title{font:700 38px/1 "Source Serif Pro",Georgia,serif;color:#fff;letter-spacing:-.01em;margin-bottom:8px}
.brand-tagline{font:400 14px/1.45 "Public Sans",sans-serif;color:rgba(255,255,255,.85);max-width:700px}
nav.tabs{background:var(--c-primary)}
.tabs-inner{max-width:1280px;margin:0 auto;padding:0 12px;display:flex}
.tabs-inner a{color:rgba(255,255,255,.78);padding:14px 16px;font:600 13px/1 inherit;text-decoration:none;border-bottom:3px solid transparent}
.tabs-inner a:hover{color:#fff;background:rgba(255,255,255,.07)}
.tabs-inner a.active{color:#fff;border-bottom-color:var(--c-accent);background:rgba(0,0,0,.18)}
.container{max-width:1280px;margin:0 auto;padding:32px 24px 60px}
h2{font:700 24px/1.2 "Source Serif Pro",Georgia,serif;color:var(--c-primary-dark);margin-bottom:6px}
.lede{font-size:14.5px;color:var(--c-base-light);max-width:780px;line-height:1.55;margin-bottom:24px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.card{background:#fff;border:1px solid var(--c-border-strong);border-top:4px solid var(--c-primary);padding:20px;text-decoration:none;color:inherit;display:block;transition:transform .12s,box-shadow .12s}
.card:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.08)}
.card-name{font:700 18px/1.2 "Source Serif Pro",Georgia,serif;color:var(--c-primary-dark)}
.card-status{font-size:12px;color:var(--c-base-light);margin-top:4px}
.card-meta{margin-top:12px;font-size:12.5px;color:var(--c-base);display:grid;gap:4px}
.card-meta .lbl{color:var(--c-base-light);margin-right:4px}
.card-cta{margin-top:14px;color:var(--c-primary-vivid);font-weight:600;font-size:13px}
.card.awaiting{opacity:.85;border-top-color:var(--c-base-light)}
.card.awaiting .card-cta{color:var(--c-base-light)}
footer.site-footer{background:var(--c-primary-dark);color:#fff;padding:32px 0 24px;margin-top:60px}
.footer-inner{max-width:1280px;margin:0 auto;padding:0 24px;font-size:13px}
.footer-inner a{color:var(--c-accent)}
@media(max-width:768px){.brand-title{font-size:28px}}
</style>
</head>
<body>
<div class="topstrip">An <strong>independent civic-transparency project</strong>. Not affiliated with any candidate, campaign, or political party. Every record sourced. <a href="/methodology" style="color:#fff;text-decoration:underline">Methodology</a>.</div>
<header class="site-header">
  <svg class="cn-tower" viewBox="0 0 100 280" aria-hidden="true">
    <rect x="49" y="0" width="2" height="60" fill="#fff"/><rect x="48" y="60" width="4" height="30" fill="#fff"/>
    <ellipse cx="50" cy="92" rx="9" ry="3.5" fill="#fff"/><rect x="46" y="92" width="8" height="50" fill="#fff"/>
    <ellipse cx="50" cy="148" rx="18" ry="6" fill="#fff"/><ellipse cx="50" cy="153" rx="18" ry="6" fill="#fff"/>
    <polygon points="48,158 52,158 56,250 44,250" fill="#fff"/><polygon points="44,250 56,250 64,278 36,278" fill="#fff"/>
  </svg>
  <div class="site-header-inner">
    <div class="brand-overline">Public Record &middot; The 416</div>
    <div class="brand-title">The T.O. Mayoral Files</div>
    <div class="brand-tagline">An independent, sourced record of every confirmed candidate in Toronto's 2026 mayoral race. Each candidate gets their own dossier &mdash; every position, pledge, council action, endorsement, and appearance, linked to its source.</div>
  </div>
</header>
<div class="subway-stripe" aria-hidden="true"><span class="l1"></span><span class="l2"></span><span class="l3"></span><span class="l4"></span><span class="ttc"></span></div>
<nav class="tabs"><div class="tabs-inner"><a href="/" class="active">Candidates</a><a href="/compare">Compare</a><a href="/issues">Issues</a><a href="/methodology">Methodology</a><a href="/about">About</a></div></nav>
<div class="container">
  <h2>Confirmed candidates</h2>
  <p class="lede">Listed alphabetically &mdash; no ranking implied. Click any candidate to open their full dossier.</p>
  <div class="cards" id="cards">Loading&hellip;</div>
</div>
<footer class="site-footer"><div class="footer-inner">
  <strong>The T.O. Mayoral Files</strong> &middot; An independent civic-transparency project. Not affiliated with any candidate or campaign.
  <div style="margin-top:12px;color:rgba(255,255,255,.7);font-size:12px">Built in the 6 by <a href="https://bottlenecklabs.ai">BottleneckLabs</a> &middot; Open source at <a href="https://github.com/fullstackvibecoder/thebradfordfiles">GitHub</a> &middot; MIT licensed</div>
</div></footer>
<script>
function el(tag, attrs, children){
  const n = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)){
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v);
  }
  if (children != null){
    const arr = Array.isArray(children) ? children : [children];
    for (const c of arr){
      if (c == null) continue;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return n;
}
function row(label, value){
  return el("div", null, [el("span", {class:"lbl"}, label + " "), el("span", null, value)]);
}
function fmtPlacement(p){return p === 1 ? "1st" : p === 2 ? "2nd" : p === 3 ? "3rd" : p + "th";}
function fmt2023(r){return r ? `${fmtPlacement(r.placement)} · ~${r.vote_share_pct}%` : null;}

fetch("/landing.json", {cache:"no-store"}).then(r => r.json()).then(d => {
  const cards = document.getElementById("cards");
  cards.replaceChildren();
  for (const c of d.candidates){
    const isAwaiting = c.candidacy_status === "expected" || c.candidacy_status === "awaiting";
    const card = el("a", {href: "/" + c.slug, class: "card" + (isAwaiting ? " awaiting" : "")});
    card.appendChild(el("div", {class:"card-name"}, c.display_name));
    const statusText = c.candidacy_status === "declared"
      ? `Declared ${c.declared_date || ""}`
      : c.candidacy_status === "expected" ? "Expected to declare" : "Awaiting declaration";
    const roleSep = c.current_role ? " · " : "";
    card.appendChild(el("div", {class:"card-status"}, `${c.current_role || ""}${roleSep}${statusText}`));
    const meta = el("div", {class:"card-meta"});
    if (c.result_2023) meta.appendChild(row("2023 result:", fmt2023(c.result_2023)));
    if (c.post_count) meta.appendChild(row("Indexed:", `${c.post_count.toLocaleString()} posts · ${c.record_count.toLocaleString()} records`));
    if (c.platform_pillars && c.platform_pillars.length) meta.appendChild(row("Stated platform:", c.platform_pillars.join(" · ")));
    if (!c.post_count && c.candidacy_status !== "declared")
      meta.appendChild(el("div", {style:"color:#999;font-style:italic;font-size:12px"}, "Awaiting 2026 declaration"));
    card.appendChild(meta);
    card.appendChild(el("div", {class:"card-cta"}, `View ${c.files_label} →`));
    cards.appendChild(card);
  }
}).catch(e => {
  document.getElementById("cards").textContent = "Could not load: " + e.message;
});
</script>
</body>
</html>
```

- [ ] **Step 2:** Smoke-test locally.

```bash
.venv/bin/python scripts/build_site.py
cd site && python3 -m http.server 8765 &
sleep 1
curl -s http://localhost:8765/landing.json | python3 -c "import json,sys; print([c['surname'] for c in json.load(sys.stdin)['candidates']])"
curl -s http://localhost:8765/ | grep -c "Confirmed candidates"
kill %1
cd ..
```

Expected: `['Bradford', 'Chow']` and `1`.

- [ ] **Step 3:** Commit.

```bash
git add site/index.html
git commit -m "feat: T.O. Mayoral Files landing card grid"
```

## Task 6: Configure Vercel routing for clean URLs

**Files:** Modify `site/vercel.json`.

- [ ] **Step 1:** Read current config.

```bash
cat site/vercel.json
```

- [ ] **Step 2:** Replace with rewrites + headers.

`site/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    { "source": "/(.*)", "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "X-Frame-Options", "value": "DENY" }
    ]},
    { "source": "/landing.json", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=300, s-maxage=300" }
    ]},
    { "source": "/candidates/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=300, s-maxage=300" }
    ]}
  ]
}
```

`cleanUrls: true` handles `/bradford` → `site/bradford/index.html`, `/issues` → `site/issues/index.html`, etc.; no rewrites needed.

- [ ] **Step 3:** Commit.

```bash
git add site/vercel.json
git commit -m "feat: Vercel routing for multi-candidate site"
```

## Task 7: Stub `/compare`, `/issues`, `/methodology`, `/about` pages

**Files:** Create stubs under `site/<route>/index.html`. They'll be filled out in later tasks (issues in Phase 5).

- [ ] **Step 1:** Create `/compare` stub.

```bash
mkdir -p site/compare
cat > site/compare/index.html <<'EOF'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Compare candidates &middot; The T.O. Mayoral Files</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:720px;margin:80px auto;padding:0 24px;color:#1b1b1b">
<a href="/" style="color:#0050d8">&larr; Back to Candidates</a>
<h1 style="font-family:Georgia,serif;color:#0d2f5c;margin-top:24px">Compare</h1>
<p style="color:#5a6573;line-height:1.6">Side-by-side candidate comparison is coming in a later phase. For now, browse each candidate's dossier from the <a href="/">candidates page</a>.</p>
</body></html>
EOF
```

- [ ] **Step 2:** Create `/issues` stub (replaced fully in Phase 5).

```bash
mkdir -p site/issues
cat > site/issues/index.html <<'EOF'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Issues &middot; The T.O. Mayoral Files</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:720px;margin:80px auto;padding:0 24px;color:#1b1b1b">
<a href="/" style="color:#0050d8">&larr; Back to Candidates</a>
<h1 style="font-family:Georgia,serif;color:#0d2f5c;margin-top:24px">Issues &amp; Agenda Gap</h1>
<p style="color:#5a6573;line-height:1.6">Reader issue-priority polling and agenda-gap analysis ship in a later phase.</p>
</body></html>
EOF
```

- [ ] **Step 3:** Create `/methodology` and `/about` stubs.

```bash
mkdir -p site/methodology site/about

cat > site/methodology/index.html <<'EOF'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Methodology &middot; The T.O. Mayoral Files</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:760px;margin:60px auto;padding:0 24px;color:#1b1b1b;line-height:1.65">
<a href="/" style="color:#0050d8">&larr; Back to Candidates</a>
<h1 style="font-family:Georgia,serif;color:#0d2f5c;margin-top:24px">Methodology</h1>
<p>This page summarises the extraction methodology. Full version in <a href="https://github.com/fullstackvibecoder/thebradfordfiles/blob/main/METHODOLOGY.md">METHODOLOGY.md</a>.</p>
<h2>Pipeline</h2>
<ol>
<li><strong>Triage</strong>&mdash;Claude Haiku 4.5 reads each post's caption and assigns a bucket (substantive / contextual / skip) with a stated reason.</li>
<li><strong>Extraction</strong>&mdash;Claude Opus 4.7 reads substantive posts (with audio transcripts via Deepgram) and emits structured records (positions, pledges, actions, endorsements, appearances, quotes).</li>
<li><strong>Verification</strong>&mdash;Action records are cross-referenced against the City of Toronto's public council voting record.</li>
</ol>
<h2>Equal-billing rules</h2>
<ul><li>Candidates listed alphabetically by surname.</li><li>Identical fields shown for every candidate.</li><li>No ranking, no editorial weighting.</li><li>"Awaiting declaration" is a tracked state.</li></ul>
<h2>Corrections</h2>
<p><a href="https://github.com/fullstackvibecoder/thebradfordfiles/issues">Open an issue on GitHub</a> if you spot an error.</p>
</body></html>
EOF

cat > site/about/index.html <<'EOF'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>About &middot; The T.O. Mayoral Files</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:720px;margin:60px auto;padding:0 24px;color:#1b1b1b;line-height:1.65">
<a href="/" style="color:#0050d8">&larr; Back to Candidates</a>
<h1 style="font-family:Georgia,serif;color:#0d2f5c;margin-top:24px">About</h1>
<p>The T.O. Mayoral Files is an independent civic-transparency project documenting Toronto's 2026 mayoral race. Not affiliated with any candidate, campaign, or political party. No financial relationship with any candidate.</p>
<p>Every record on this site is sourced to a specific public Instagram post. Click any source link to verify against the original.</p>
<p>Built by <a href="https://bottlenecklabs.ai">BottleneckLabs</a>. Open source at <a href="https://github.com/fullstackvibecoder/thebradfordfiles">GitHub</a> under the MIT license.</p>
</body></html>
EOF
```

- [ ] **Step 4:** Smoke-test all routes.

```bash
cd site && python3 -m http.server 8765 &
sleep 1
for path in / /bradford /chow /compare /issues /methodology /about; do
  echo "$path: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:8765$path)"
done
kill %1
cd ..
```

Expected: every path returns 200.

- [ ] **Step 5:** Commit.

```bash
git add site/compare/index.html site/issues/index.html site/methodology/index.html site/about/index.html
git commit -m "feat: stub /compare /issues /methodology /about pages"
```

## Task 8: Wire matches.jsonl into the dossier output (no-op until Phase 3)

**Files:** No code changes — `_load_matches()` is already in `build_site.py` from Task 3 and silently returns `{}` when `data/votes/matches.jsonl` doesn't exist. Verify behavior.

- [ ] **Step 1:** Confirm matches loader is no-op when file missing.

```bash
test ! -f data/votes/matches.jsonl && echo "no matches file (expected pre-Phase 3)"
.venv/bin/python scripts/build_site.py 2>&1 | tail -10
```

Expected: build runs without error and emits zero `council_verification` keys (because the matches file does not yet exist).

## Task 9: Deploy Phase 2 to production

**Files:** none.

- [ ] **Step 1:** Clean build.

```bash
.venv/bin/python scripts/build_site.py
```

- [ ] **Step 2:** Deploy.

```bash
cd site && vercel --prod --yes
```

Take note of the deployment URL printed.

- [ ] **Step 3:** Smoke-test production.

```bash
URL="https://bradford-files.vercel.app"
for path in / /bradford /chow /compare /issues /methodology /about /landing.json /candidates/bradford.json; do
  echo "$path: $(curl -s -o /dev/null -w "%{http_code}" $URL$path)"
done
```

Expected: every path returns 200.

- [ ] **Step 4:** Visual confirmation in a browser. Open the URL. Confirm:
- Landing card grid shows Bradford and Chow alphabetically
- Clicking a card opens the per-candidate dashboard
- Tab links work

- [ ] **Step 5:** Push.

```bash
git push origin main
```

**Phase 2 milestone reached.** Multi-candidate scaffold is live.

---

# Phase 3: Council Voting Record Verification (Tasks 10–15)

## Task 10: Ingest council voting record into JSONL + per-councillor index (TDD)

**Files:**
- Create: `scripts/ingest_votes.py`
- Create: `tests/test_ingest_votes.py`

- [ ] **Step 1:** Write failing tests.

`tests/test_ingest_votes.py`:

```python
"""Tests for ingest_votes.py."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def test_ingest_writes_jsonl_per_term(tmp_path, monkeypatch):
    src = tmp_path / "src"
    src.mkdir()
    (src / "member-voting-record-2022-2026.json").write_text(json.dumps([
        {"_id": 1, "Term": "2022-2026", "First Name": "Brad", "Last Name": "Bradford",
         "Committee": "City Council", "Date/Time": "2024-09-26 10:00 AM",
         "Agenda Item #": "2024.GG12.7", "Agenda Item Title": "Watercraft ban",
         "Motion Type": "Motion", "Vote": "Yes",
         "Result": "Carried, 24-0", "Vote Description": "Ban personal watercraft"},
    ]))
    out = tmp_path / "out"
    from scripts import ingest_votes
    monkeypatch.setattr(ingest_votes, "SOURCE_DIR", src)
    monkeypatch.setattr(ingest_votes, "OUT_DIR", out)
    ingest_votes.main([])
    raw = out / "raw" / "2022-2026.jsonl"
    rows = [json.loads(l) for l in raw.read_text().splitlines() if l.strip()]
    assert len(rows) == 1
    assert rows[0]["First Name"] == "Brad"


def test_ingest_writes_by_councillor_index(tmp_path, monkeypatch):
    src = tmp_path / "src"
    src.mkdir()
    (src / "member-voting-record-2022-2026.json").write_text(json.dumps([
        {"_id": 1, "Term": "2022-2026", "First Name": "Brad", "Last Name": "Bradford",
         "Date/Time": "2024-09-26", "Agenda Item #": "2024.GG12.7",
         "Agenda Item Title": "x", "Vote": "Yes", "Result": "Carried", "Vote Description": "y"},
        {"_id": 2, "Term": "2022-2026", "First Name": "Olivia", "Last Name": "Chow",
         "Date/Time": "2024-09-26", "Agenda Item #": "2024.GG12.7",
         "Agenda Item Title": "x", "Vote": "Yes", "Result": "Carried", "Vote Description": "y"},
    ]))
    out = tmp_path / "out"
    from scripts import ingest_votes
    monkeypatch.setattr(ingest_votes, "SOURCE_DIR", src)
    monkeypatch.setattr(ingest_votes, "OUT_DIR", out)
    ingest_votes.main([])
    bradford_index = out / "by-councillor" / "bradford-brad.jsonl"
    chow_index = out / "by-councillor" / "chow-olivia.jsonl"
    assert bradford_index.exists() and chow_index.exists()
    bradford_rows = [json.loads(l) for l in bradford_index.read_text().splitlines() if l.strip()]
    assert len(bradford_rows) == 1
```

- [ ] **Step 2:** Run, verify failure.

```bash
.venv/bin/python -m pytest tests/test_ingest_votes.py -v
```

Expected: ImportError.

- [ ] **Step 3:** Write `scripts/ingest_votes.py`.

```python
#!/usr/bin/env python3
"""Convert City of Toronto council voting record JSON files into JSONL +
per-councillor index. Source files: data/votes/raw-source. Output: data/votes/."""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "City Council Member Voting Record 2006-2026"
OUT_DIR = ROOT / "data" / "votes"


def _slug(text: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in (text or "")).strip("-")


def _ingest_file(path: Path, raw_out: Path) -> list[dict]:
    rows = json.loads(path.read_text())
    raw_out.parent.mkdir(parents=True, exist_ok=True)
    with raw_out.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.parse_args(argv)
    if not SOURCE_DIR.exists():
        print(f"FATAL: source dir not found: {SOURCE_DIR}")
        return 1
    raw_dir = OUT_DIR / "raw"
    by_councillor_dir = OUT_DIR / "by-councillor"
    by_councillor_dir.mkdir(parents=True, exist_ok=True)
    by_councillor: dict[str, list[dict]] = defaultdict(list)
    total = 0
    for src in sorted(SOURCE_DIR.glob("member-voting-record-*.json")):
        term = src.stem.replace("member-voting-record-", "")
        out = raw_dir / f"{term}.jsonl"
        rows = _ingest_file(src, out)
        print(f"  {term}: {len(rows):,} votes")
        total += len(rows)
        for r in rows:
            first, last = r.get("First Name", ""), r.get("Last Name", "")
            if not last:
                continue
            by_councillor[f"{_slug(last)}-{_slug(first)}"].append(r)
    for key, votes in by_councillor.items():
        with (by_councillor_dir / f"{key}.jsonl").open("w", encoding="utf-8") as f:
            for v in votes:
                f.write(json.dumps(v, ensure_ascii=False) + "\n")
    print(f"\n  total: {total:,} votes, {len(by_councillor)} unique councillors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4:** Run tests, verify pass.

```bash
.venv/bin/python -m pytest tests/test_ingest_votes.py -v
```

Expected: 2 passed.

- [ ] **Step 5:** Run on real data.

```bash
.venv/bin/python scripts/ingest_votes.py
ls data/votes/raw/
wc -l data/votes/by-councillor/bradford-brad.jsonl
```

Expected: 5 raw JSONL files (one per term); Bradford's index has thousands of rows.

- [ ] **Step 6:** Commit.

```bash
git add scripts/ingest_votes.py tests/test_ingest_votes.py
git commit -m "feat: ingest_votes converts council JSON to JSONL + per-councillor index"
```

## Task 11: Match records against votes (TDD)

**Files:**
- Create: `scripts/match_votes.py`
- Create: `tests/test_match_votes.py`

- [ ] **Step 1:** Write failing tests.

`tests/test_match_votes.py`:

```python
"""Tests for match_votes.py: agenda-item and date+keyword matching."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _seed(tmp_path, vote_overrides=None, record_overrides=None, post_date="2024-09-26"):
    votes = tmp_path / "votes"
    votes.mkdir()
    base_vote = {"_id": 1, "First Name": "Brad", "Last Name": "Bradford",
                 "Date/Time": "2024-09-26 10:00 AM",
                 "Agenda Item #": "2024.GG12.7",
                 "Agenda Item Title": "Watercraft ban Cherry Beach",
                 "Vote": "Yes", "Result": "Carried, 24-0",
                 "Vote Description": "Ban personal watercraft Cherry Beach"}
    if vote_overrides: base_vote.update(vote_overrides)
    (votes / "bradford-brad.jsonl").write_text(json.dumps(base_vote) + "\n")
    cand = tmp_path / "bradfordgrams"
    cand.mkdir()
    (cand / "candidate.json").write_text(json.dumps({
        "handle":"bradfordgrams","slug":"bradford",
        "council_name_for_vote_lookup":{"first":"Brad","last":"Bradford"}}))
    base_record = {"kind":"action","shortcode":"ABC","post_url":"u",
                   "post_date": post_date, "topic":"safety_crime",
                   "summary":"Brought motion creating jet-ski no-go zone Cherry Beach.",
                   "source_quote":"I brought forward 2024.GG12.7 and it passed unanimously."}
    if record_overrides: base_record.update(record_overrides)
    (cand / "records.jsonl").write_text(json.dumps(base_record) + "\n")
    return votes


def test_tier1_match_by_agenda_item(tmp_path, monkeypatch):
    votes = _seed(tmp_path)
    from scripts import match_votes
    monkeypatch.setattr(match_votes, "VOTES_BY_COUNCILLOR", votes)
    monkeypatch.setattr(match_votes, "DATA_DIR", tmp_path)
    matches = match_votes.match_for("bradfordgrams")
    assert len(matches) == 1
    m = matches[0]
    assert m["match_type"] == "agenda_item"
    assert m["confidence"] >= 0.95
    assert m["agenda_item"] == "2024.GG12.7"
    assert m["vote_disposition"] == "Yes"


def test_tier2_match_by_date_and_keyword(tmp_path, monkeypatch):
    votes = _seed(tmp_path,
                  record_overrides={"source_quote": "passed unanimously"},  # no agenda item
                  post_date="2024-09-30")
    from scripts import match_votes
    monkeypatch.setattr(match_votes, "VOTES_BY_COUNCILLOR", votes)
    monkeypatch.setattr(match_votes, "DATA_DIR", tmp_path)
    matches = match_votes.match_for("bradfordgrams")
    assert len(matches) == 1
    assert matches[0]["match_type"] == "date_keyword"
    assert 0.7 <= matches[0]["confidence"] < 0.95


def test_no_match_when_unrelated(tmp_path, monkeypatch):
    votes = _seed(tmp_path,
                  vote_overrides={"Date/Time":"2024-01-01 10:00 AM",
                                  "Agenda Item Title":"unrelated topic",
                                  "Vote Description":"completely different subject"},
                  record_overrides={"summary":"Subway expansion announcement.",
                                    "source_quote":"subway",
                                    "topic":"transit"},
                  post_date="2024-09-30")
    from scripts import match_votes
    monkeypatch.setattr(match_votes, "VOTES_BY_COUNCILLOR", votes)
    monkeypatch.setattr(match_votes, "DATA_DIR", tmp_path)
    assert match_votes.match_for("bradfordgrams") == []
```

- [ ] **Step 2:** Run tests, verify failure.

```bash
.venv/bin/python -m pytest tests/test_match_votes.py -v
```

Expected: ImportError.

- [ ] **Step 3:** Write `scripts/match_votes.py`.

```python
#!/usr/bin/env python3
"""Match Action records against the City of Toronto council voting record.

Tier 1 (agenda_item): record's source_quote contains an agenda item number
that maps directly to a council vote. Confidence >= 0.95.

Tier 2 (date_keyword): action's post_date is within +/-60 days of a council
vote AND keywords from summary/topic overlap with the vote's title/description.
Confidence 0.7-0.94 based on date closeness x keyword overlap.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
VOTES_BY_COUNCILLOR = DATA_DIR / "votes" / "by-councillor"
MATCHES_OUT = DATA_DIR / "votes" / "matches.jsonl"

AGENDA_ITEM_RE = re.compile(r"\b\d{4}\.[A-Z]{2,3}\d+\.\d+\b")
DATE_WINDOW_DAYS = 60
CONFIDENCE_THRESHOLD = 0.7


def _slug(text: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in (text or "")).strip("-")


def _load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows: list[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return rows


def _parse_council_date(s: str) -> datetime | None:
    for fmt in ("%Y-%m-%d %I:%M %p", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _parse_post_date(s: str) -> datetime | None:
    if not s:
        return None
    s = s.split("T")[0]
    try:
        return datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        return None


def _keywords(text: str) -> set[str]:
    if not text:
        return set()
    return {w for w in re.findall(r"[a-z]{4,}", text.lower())}


def _tier1_match(record: dict, votes: list[dict]) -> dict | None:
    haystack = (record.get("source_quote", "") + " " + record.get("summary", ""))
    items = AGENDA_ITEM_RE.findall(haystack)
    if not items:
        return None
    target = items[0]
    for v in votes:
        if v.get("Agenda Item #") == target:
            return _match_dict(record, v, 0.97, "agenda_item")
    return None


def _tier2_match(record: dict, votes: list[dict]) -> dict | None:
    post_dt = _parse_post_date(record.get("post_date", ""))
    if not post_dt:
        return None
    record_kw = _keywords(record.get("summary", "") + " " + (record.get("topic", "") or "").replace("_", " "))
    if not record_kw:
        return None
    best, best_conf = None, 0.0
    for v in votes:
        v_dt = _parse_council_date(v.get("Date/Time", ""))
        if not v_dt:
            continue
        delta = abs((post_dt - v_dt).days)
        if delta > DATE_WINDOW_DAYS:
            continue
        v_kw = _keywords(v.get("Agenda Item Title", "") + " " + v.get("Vote Description", ""))
        if not v_kw:
            continue
        overlap = len(record_kw & v_kw)
        if overlap == 0:
            continue
        date_score = 1.0 - (delta / DATE_WINDOW_DAYS)
        keyword_score = overlap / max(len(record_kw), 1)
        conf = 0.7 + ((0.6 * keyword_score + 0.4 * date_score) * 0.24)
        if conf > best_conf and conf >= CONFIDENCE_THRESHOLD:
            best, best_conf = _match_dict(record, v, round(conf, 3), "date_keyword"), conf
    return best


def _match_dict(record: dict, vote: dict, conf: float, mtype: str) -> dict:
    return {
        "record_shortcode": record.get("shortcode"),
        "council_vote_id": vote.get("_id"),
        "confidence": conf,
        "match_type": mtype,
        "agenda_item": vote.get("Agenda Item #"),
        "vote_disposition": vote.get("Vote"),
        "result": vote.get("Result"),
        "vote_date": vote.get("Date/Time"),
        "vote_description": vote.get("Vote Description"),
    }


def match_for(handle: str) -> list[dict]:
    cand_dir = DATA_DIR / handle
    manifest_path = cand_dir / "candidate.json"
    if not manifest_path.exists():
        return []
    manifest = json.loads(manifest_path.read_text())
    name = manifest.get("council_name_for_vote_lookup") or {}
    if not name.get("last"):
        return []
    votes_path = VOTES_BY_COUNCILLOR / f"{_slug(name['last'])}-{_slug(name.get('first', ''))}.jsonl"
    votes = _load_jsonl(votes_path)
    if not votes:
        return []
    matches: list[dict] = []
    for r in _load_jsonl(cand_dir / "records.jsonl"):
        if r.get("kind") != "action":
            continue
        m = _tier1_match(r, votes) or _tier2_match(r, votes)
        if m:
            matches.append(m)
    return matches


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--handles", nargs="*", default=None)
    args = parser.parse_args(argv)
    sys.path.insert(0, str(ROOT / "scripts"))
    from lib import candidates  # type: ignore
    primaries = candidates.load_all_candidates()
    if args.handles:
        primaries = [p for p in primaries if p["handle"] in args.handles]
    all_matches: list[dict] = []
    for p in primaries:
        m = match_for(p["handle"])
        all_matches.extend({**x, "candidate_handle": p["handle"], "candidate_slug": p["slug"]} for x in m)
        print(f"  @{p['handle']}: {len(m)} matches")
    MATCHES_OUT.parent.mkdir(parents=True, exist_ok=True)
    with MATCHES_OUT.open("w", encoding="utf-8") as f:
        for m in all_matches:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")
    print(f"\n  wrote {MATCHES_OUT.relative_to(ROOT)} ({len(all_matches)} matches)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4:** Run tests, verify pass.

```bash
.venv/bin/python -m pytest tests/test_match_votes.py -v
```

Expected: 3 passed.

- [ ] **Step 5:** Run on real data.

```bash
.venv/bin/python scripts/match_votes.py
wc -l data/votes/matches.jsonl
head -3 data/votes/matches.jsonl | python3 -m json.tool
```

Expected: matches written; first few look sensible.

- [ ] **Step 6:** Commit.

```bash
git add scripts/match_votes.py tests/test_match_votes.py
git commit -m "feat: match_votes cross-references action records vs council votes"
```

## Task 12: Render the verified badge in the candidate template

**Files:** Modify `site/candidate-template.html`.

- [ ] **Step 1:** Locate the action-rendering branch.

```bash
grep -n 'kind === "action"' site/candidate-template.html
```

- [ ] **Step 2:** Add badge rendering. Edit `site/candidate-template.html`. Find the action-tag block (the one that does `record.action_type.replace(/_/g, " ")`). After it, insert:

```javascript
  if (record.kind === "action" && record.council_verification) {
    const verifiedTag = el("span", {
      class: "stance-tag",
      style: "color:#fff;background:#00923f;border-color:#00923f"
    }, "✓ Verified");
    meta.appendChild(verifiedTag);
  }
```

- [ ] **Step 3:** Add the verification detail box. Find the `if (record.source_quote && record.kind !== "quote")` block. Just before it, insert:

```javascript
  if (record.kind === "action" && record.council_verification) {
    const v = record.council_verification;
    const box = el("div", {style:"background:#f0f7ed;border:1px solid #00923f;border-left-width:3px;padding:8px 10px;margin:8px 0;font-size:12px"});
    box.appendChild(el("div", {style:"color:#00923f;font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-size:10px"},
      "✓ Verified · Toronto Council voting record"));
    const detail = el("div", {style:"margin-top:4px;color:#333"});
    detail.appendChild(el("strong", null, v.agenda_item || ""));
    if (v.vote_description) detail.appendChild(document.createTextNode(" — " + v.vote_description));
    box.appendChild(detail);
    box.appendChild(el("div", {style:"color:#666;font-size:11px;margin-top:2px"},
      `Voted ${v.vote_disposition} · ${v.result || ""} · ${(v.vote_date || "").split(" ")[0]}`));
    box.appendChild(el("div", {style:"margin-top:4px;font-size:10px;color:#666"},
      `Match confidence: ${(v.confidence * 100).toFixed(0)}% (${v.match_type})`));
    card.appendChild(box);
  }
```

- [ ] **Step 4:** Rebuild and check output.

```bash
.venv/bin/python scripts/build_site.py
grep -c "council_verification" site/candidates/bradford.json
```

Expected: greater than 0.

- [ ] **Step 5:** Commit.

```bash
git add site/candidate-template.html
git commit -m "feat: render council verification badge on action records"
```

## Task 13: Add a build-runner that ingests + matches + builds in order

**Files:** Create `scripts/build_all.sh`.

- [ ] **Step 1:** Write the script.

```bash
cat > scripts/build_all.sh <<'EOF'
#!/usr/bin/env bash
# Full build: ingest votes -> match -> build site. Run from repo root.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . .env && set +a
echo "==> ingest_votes"
.venv/bin/python scripts/ingest_votes.py
echo "==> match_votes"
.venv/bin/python scripts/match_votes.py
echo "==> build_site"
.venv/bin/python scripts/build_site.py
echo "==> done"
EOF
chmod +x scripts/build_all.sh
```

- [ ] **Step 2:** Run the full pipeline.

```bash
./scripts/build_all.sh
```

- [ ] **Step 3:** Commit.

```bash
git add scripts/build_all.sh
git commit -m "feat: build_all.sh runs ingest + match + build in order"
```

## Task 14: Gitignore raw vote data; commit derived matches

**Files:** Modify `.gitignore`; commit `data/votes/matches.jsonl`.

- [ ] **Step 1:** Update `.gitignore`.

```bash
cat >> .gitignore <<'EOF'

# Council voting record source files (large; re-derive with ingest_votes.py)
City Council Member Voting Record 2006-2026/
data/votes/raw/
data/votes/by-councillor/
EOF
```

- [ ] **Step 2:** Commit ignore + derived matches.

```bash
git add .gitignore data/votes/matches.jsonl
git commit -m "chore: gitignore raw vote data; commit derived matches.jsonl"
```

## Task 15: Deploy Phase 3 to production

- [ ] **Step 1:** Build, deploy.

```bash
./scripts/build_all.sh
cd site && vercel --prod --yes && cd ..
```

- [ ] **Step 2:** Smoke-test verified badges.

```bash
curl -s "https://bradford-files.vercel.app/candidates/bradford.json" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); v=[r for r in d['records'] if r.get('council_verification')]; print('verified:', len(v));
import json
if v: print(json.dumps(v[0]['council_verification'], indent=2))"
```

Expected: verified count greater than 0; example shows a real agenda item.

- [ ] **Step 3:** Push.

```bash
git push origin main
```

**Phase 3 milestone reached.** Council verification is live.

---

# Phase 4: Per-Record Reader Voting (Tasks 16–22)

## Task 16: Provision Upstash Redis from the Vercel Marketplace

Vercel KV is no longer offered. Use Upstash Redis (Marketplace) — the SDK is `@upstash/redis` and provides the same Redis primitives we need (`hincrby`, `set NX EX`, `hgetall`, `incr`).

**Files:** none (configuration only).

- [ ] **Step 1:** Open the Vercel dashboard → project → Storage → "Create Database" → choose **Upstash Redis** (Marketplace) → name `tomayoralfiles-redis` → region closest to Toronto (`us-east-1` or `eu-west-1`). Create.

- [ ] **Step 2:** Connect to the project. The dashboard prompts you to attach to environments — select **Production**, **Preview**, **Development**. This automatically populates these env vars in the project:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

- [ ] **Step 3:** Verify env vars present.

```bash
vercel env ls production | grep -i upstash
```

Expected: both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` listed.

- [ ] **Step 4:** Pull env vars locally for development.

```bash
cd site && vercel env pull .env.local && cd ..
grep -c UPSTASH site/.env.local
```

Expected: `2`.

## Task 17: Provision Cloudflare Turnstile

**Files:** modify `.env.example`.

- [ ] **Step 1:** Create a Turnstile widget at https://dash.cloudflare.com/?to=/:account/turnstile → "Add site" → domains: `bradford-files.vercel.app, *.vercel.app` → mode: **Managed**. Save.

- [ ] **Step 2:** Add Turnstile keys to Vercel env.

```bash
vercel env add TURNSTILE_SECRET_KEY production
# paste secret
vercel env add TURNSTILE_SITE_KEY production
# paste site key
vercel env add TURNSTILE_SITE_KEY preview
# paste site key
vercel env add TURNSTILE_SITE_KEY development
# paste site key
```

- [ ] **Step 3:** Document in `.env.example`.

```bash
cat >> .env.example <<'EOF'

# Cloudflare Turnstile (anti-brigading on reader-vote endpoints)
# https://dash.cloudflare.com/?to=/:account/turnstile
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Upstash Redis (auto-populated by Vercel Marketplace integration)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
EOF

git add .env.example
git commit -m "chore: document Turnstile and Upstash env vars"
```

## Task 18: Implement `/api/vote` Vercel function

**Files:**
- Create: `site/api/vote.js`
- Create: `site/api/_lib/turnstile.js`
- Create: `site/api/_lib/fingerprint.js`
- Create: `site/api/_lib/redis.js`
- Create: `site/package.json` (already exists if Vercel created it; we set deps)

- [ ] **Step 1:** Initialize package and install dependencies.

```bash
cd site
[ -f package.json ] || npm init -y
npm install @upstash/redis
cd ..
```

- [ ] **Step 2:** Write the Redis client helper.

`site/api/_lib/redis.js`:

```javascript
import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();
```

- [ ] **Step 3:** Write the Turnstile verifier.

`site/api/_lib/turnstile.js`:

```javascript
// Server-side verification of a Cloudflare Turnstile token.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

export async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!token) return false;
  const body = new URLSearchParams();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) body.append("remoteip", remoteIp);
  try {
    const r = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body }
    );
    const json = await r.json();
    return Boolean(json.success);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4:** Write the fingerprint helper.

`site/api/_lib/fingerprint.js`:

```javascript
// Hash a client-supplied browser fingerprint for one-vote-per-fingerprint dedup.
// One-way hash; never logged in plaintext.
import crypto from "node:crypto";

export function hashFingerprint(raw) {
  if (!raw || typeof raw !== "string" || raw.length < 8) return null;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}
```

- [ ] **Step 5:** Write `site/api/vote.js`.

```javascript
import { redis } from "./_lib/redis.js";
import { verifyTurnstile } from "./_lib/turnstile.js";
import { hashFingerprint } from "./_lib/fingerprint.js";

const VALID_JUDGMENTS = new Set(["kept", "broke", "too_early"]);
const RECORD_ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

function normalizeCounts(raw) {
  const c = raw || {};
  return {
    kept: parseInt(c.kept || 0, 10),
    broke: parseInt(c.broke || 0, 10),
    too_early: parseInt(c.too_early || 0, 10),
    total: parseInt(c.total || 0, 10),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: "invalid_json" }); }
  const { record_id, judgment, turnstile_token, fingerprint } = body || {};

  if (!record_id || !RECORD_ID_RE.test(record_id))
    return res.status(400).json({ error: "invalid_record_id" });
  if (!VALID_JUDGMENTS.has(judgment))
    return res.status(400).json({ error: "invalid_judgment" });

  const ok = await verifyTurnstile(
    turnstile_token,
    req.headers["x-forwarded-for"] || req.headers["x-real-ip"]
  );
  if (!ok) return res.status(403).json({ error: "turnstile_failed" });

  const fp = hashFingerprint(fingerprint);
  if (!fp) return res.status(400).json({ error: "missing_fingerprint" });

  const dedupKey = `vote:${record_id}:fp:${fp}`;
  const setResult = await redis.set(dedupKey, judgment, { ex: 60 * 60 * 24 * 365, nx: true });
  if (setResult !== "OK") {
    const counts = await redis.hgetall(`vote:${record_id}:counts`);
    return res.status(200).json({ ok: true, deduped: true, counts: normalizeCounts(counts) });
  }

  await redis.hincrby(`vote:${record_id}:counts`, judgment, 1);
  await redis.hincrby(`vote:${record_id}:counts`, "total", 1);

  const counts = await redis.hgetall(`vote:${record_id}:counts`);
  return res.status(200).json({ ok: true, counts: normalizeCounts(counts) });
}
```

> Note: `@upstash/redis` returns `"OK"` on successful `SET NX`, and `null` when the key already exists.

- [ ] **Step 6:** Commit.

```bash
git add site/api/vote.js site/api/_lib/turnstile.js site/api/_lib/fingerprint.js site/api/_lib/redis.js site/package.json site/package-lock.json
git commit -m "feat: /api/vote endpoint with Turnstile + Upstash dedup"
```

## Task 19: Implement `/api/aggregate` read endpoint

**Files:** Create `site/api/aggregate.js`.

- [ ] **Step 1:** Write the file.

```javascript
import { redis } from "./_lib/redis.js";

const RECORD_ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

export default async function handler(req, res) {
  const { record_id } = req.query;
  if (!record_id || !RECORD_ID_RE.test(record_id))
    return res.status(400).json({ error: "invalid_record_id" });
  const raw = (await redis.hgetall(`vote:${record_id}:counts`)) || {};
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
  return res.status(200).json({
    record_id,
    counts: {
      kept: parseInt(raw.kept || 0, 10),
      broke: parseInt(raw.broke || 0, 10),
      too_early: parseInt(raw.too_early || 0, 10),
      total: parseInt(raw.total || 0, 10),
    },
  });
}
```

- [ ] **Step 2:** Commit.

```bash
git add site/api/aggregate.js
git commit -m "feat: /api/aggregate read endpoint with edge cache"
```

## Task 20: Add the voting widget to the candidate template

**Files:** Modify `site/candidate-template.html`.

- [ ] **Step 1:** Locate `renderSaidDone()`.

```bash
grep -n "renderSaidDone\|byTopic\[t\]" site/candidate-template.html
```

- [ ] **Step 2:** Inside `renderSaidDone()`, after the existing `block.appendChild(cols);` line, insert a call to a new helper:

Edit `site/candidate-template.html` so the topics loop body becomes:

```javascript
    block.appendChild(cols);
    block.appendChild(renderTopicVoteWidget(t));
    wrap.appendChild(block);
```

- [ ] **Step 3:** Add the widget helpers near the bottom of the template's `<script>` block (before `loadData()`):

```javascript
const TURNSTILE_SITE_KEY = "__TURNSTILE_SITE_KEY__";
let _turnstileLoaded = false;

function ensureTurnstile() {
  if (_turnstileLoaded) return;
  _turnstileLoaded = true;
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  s.async = true;
  document.head.appendChild(s);
}

function getFingerprint() {
  let fp = localStorage.getItem("tomf-fp");
  if (!fp) {
    fp = [...crypto.getRandomValues(new Uint8Array(16))]
      .map(b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("tomf-fp", fp);
  }
  return fp;
}

function buildTopicRecordId(topic) {
  const slug = (DATA.meta && DATA.meta.slug) ? DATA.meta.slug.toLowerCase() : "x";
  const safeTopic = topic.replace(/[^a-z0-9]/gi, "-");
  return `vt-${slug}-${safeTopic}`.slice(0, 32);
}

function renderTopicVoteWidget(topic) {
  ensureTurnstile();
  const recordId = buildTopicRecordId(topic);
  const widget = el("div", {style:"border-top:2px solid #f0f0f0;background:#f7f8fa;padding:18px 24px;margin-top:14px"});

  const header = el("div", {style:"display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap"});
  const left = el("div");
  left.appendChild(el("div", {style:"font:700 11px ui-monospace,monospace;letter-spacing:0.1em;color:#666"}, "READER JUDGMENT"));
  left.appendChild(el("div", {style:"font-weight:600;font-size:14px;margin-top:2px"},
    `Has the candidate kept their ${topic.replace(/_/g, " ")} pledge(s)?`));
  header.appendChild(left);

  const buttonsWrap = el("div", {style:"display:flex;gap:6px"});
  const labels = {kept:"✓ Kept", broke:"✗ Broke", too_early:"⊘ Too early"};
  const colors = {kept:"#00923f", broke:"#b50909", too_early:"#999"};
  for (const j of ["kept", "broke", "too_early"]) {
    const btn = el("button", {
      style: `padding:8px 14px;background:#fff;border:1px solid ${colors[j]};color:${colors[j]};font-weight:700;font-size:12px;cursor:pointer`,
      onclick: () => submitVote(recordId, j, widget),
    }, labels[j]);
    buttonsWrap.appendChild(btn);
  }
  header.appendChild(buttonsWrap);
  widget.appendChild(header);

  const aggregate = el("div", {style:"margin-top:10px;display:none"});
  aggregate.id = `agg-${recordId}`;
  widget.appendChild(aggregate);

  widget.appendChild(el("div", {style:"margin-top:6px;font-size:10.5px;color:#999;font-style:italic"},
    "Reader response · Not a representative poll · See methodology"));

  fetch(`/api/aggregate?record_id=${encodeURIComponent(recordId)}`)
    .then(r => r.json())
    .then(d => renderAggregate(aggregate, d.counts))
    .catch(() => {});
  return widget;
}

function renderAggregate(target, counts) {
  if (!counts || !counts.total) return;
  const total = counts.total;
  const pct = k => Math.round((counts[k] / total) * 100);
  target.style.display = "";
  target.replaceChildren();
  const bar = el("div", {style:"flex:1;height:8px;display:flex;border-radius:2px;overflow:hidden;min-width:120px"});
  bar.appendChild(el("div", {style:`flex:${counts.kept};background:#00923f`}));
  bar.appendChild(el("div", {style:`flex:${counts.broke};background:#b50909`}));
  bar.appendChild(el("div", {style:`flex:${counts.too_early};background:#aaa`}));
  const wrap = el("div", {style:"display:flex;align-items:center;gap:12px;font-size:12px;color:#666"});
  wrap.appendChild(bar);
  wrap.appendChild(el("span", {style:"white-space:nowrap"},
    `${pct("kept")}% kept · ${pct("broke")}% broke · ${pct("too_early")}% too early · ${total} responses`));
  target.appendChild(wrap);
}

async function getTurnstileToken(widget) {
  if (!TURNSTILE_SITE_KEY || TURNSTILE_SITE_KEY === "__TURNSTILE_SITE_KEY__") return "dev";
  return new Promise(resolve => {
    function attempt() {
      if (window.turnstile) {
        const ctr = document.createElement("div"); ctr.style.display = "none"; widget.appendChild(ctr);
        window.turnstile.render(ctr, {
          sitekey: TURNSTILE_SITE_KEY, size: "invisible",
          callback: t => resolve(t),
          "error-callback": () => resolve(null),
        });
      } else {
        setTimeout(attempt, 200);
      }
    }
    attempt();
  });
}

async function submitVote(recordId, judgment, widget) {
  const token = await getTurnstileToken(widget);
  const r = await fetch("/api/vote", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({record_id: recordId, judgment, turnstile_token: token, fingerprint: getFingerprint()}),
  });
  if (r.ok) {
    const data = await r.json();
    const target = document.getElementById(`agg-${recordId}`);
    if (target) renderAggregate(target, data.counts);
  }
}
```

- [ ] **Step 4:** Smoke-test build with a dev key.

```bash
TURNSTILE_SITE_KEY=test_dev_key .venv/bin/python scripts/build_site.py
grep -c "test_dev_key" site/bradford/index.html
```

Expected: at least 1.

- [ ] **Step 5:** Commit.

```bash
git add site/candidate-template.html
git commit -m "feat: voting widget on Said-vs-Done topic blocks"
```

## Task 21: End-to-end test the voting flow locally

- [ ] **Step 1:** Pull env, start `vercel dev`.

```bash
cd site && vercel env pull .env.local
vercel dev --listen 3000 &
sleep 3
```

- [ ] **Step 2:** Test `/api/vote` rejects missing turnstile (with `NODE_ENV=production` set, the code requires a token; in `vercel dev`, `NODE_ENV` defaults to `development`, so the verifier passes through with no secret — this is intentional for local dev).

```bash
# In dev, verifier returns true with no secret → vote should succeed
curl -s -X POST http://localhost:3000/api/vote \
  -H "Content-Type: application/json" \
  -d '{"record_id":"vt-bradford-transit","judgment":"kept","fingerprint":"abcdefgh12345678"}'
```

Expected: `{"ok":true,"counts":{"kept":1,"broke":0,"too_early":0,"total":1}}` or higher (other test runs).

- [ ] **Step 3:** Verify dedup works (second call same fingerprint).

```bash
curl -s -X POST http://localhost:3000/api/vote \
  -H "Content-Type: application/json" \
  -d '{"record_id":"vt-bradford-transit","judgment":"kept","fingerprint":"abcdefgh12345678"}'
```

Expected: `{"ok":true,"deduped":true,"counts":{...}}`.

- [ ] **Step 4:** Stop dev server.

```bash
kill %1
cd ..
```

## Task 22: Deploy Phase 4

- [ ] **Step 1:** Build with site key from `.env`.

```bash
./scripts/build_all.sh
```

- [ ] **Step 2:** Deploy.

```bash
cd site && vercel --prod --yes && cd ..
```

- [ ] **Step 3:** Smoke-test endpoints.

```bash
URL="https://bradford-files.vercel.app"
# Vote endpoint should reject without a Turnstile token in production
curl -s -X POST $URL/api/vote -H "Content-Type: application/json" \
  -d '{"record_id":"test123","judgment":"kept","fingerprint":"abcdefgh12345678"}'
# Expected: {"error":"turnstile_failed"}

# Aggregate returns zero-counts for an unknown record
curl -s "$URL/api/aggregate?record_id=test123"
# Expected: {"record_id":"test123","counts":{"kept":0,"broke":0,"too_early":0,"total":0}}
```

- [ ] **Step 4:** Browser test. Visit `/bradford`, click `Kept` on a Said-vs-Done topic block. Confirm:
- Aggregate bar appears
- Counts increment
- Second click is deduped (counts don't double)

- [ ] **Step 5:** Push.

```bash
git push origin main
```

**Phase 4 milestone reached.**

---

# Phase 5: Issue Priority + Agenda Gap (Tasks 23–27)

## Task 23: Implement `/api/issue-vote` and `/api/issues-aggregate`

**Files:**
- Create: `site/api/issue-vote.js`
- Create: `site/api/issues-aggregate.js`

- [ ] **Step 1:** Write `site/api/issue-vote.js`.

```javascript
import { redis } from "./_lib/redis.js";
import { verifyTurnstile } from "./_lib/turnstile.js";
import { hashFingerprint } from "./_lib/fingerprint.js";

const VALID_TOPICS = new Set([
  "housing", "transit", "safety_crime", "taxes_fiscal",
  "parks_environment", "infrastructure", "civic_engagement",
  "governance_ethics", "small_business_economy", "social_services",
]);

async function readIssueCounts() {
  const raw = (await redis.hgetall("issue:counts")) || {};
  const total = parseInt((await redis.get("issue:total_voters")) || 0, 10);
  const counts = {};
  for (const [k, v] of Object.entries(raw)) counts[k] = parseInt(v, 10);
  return { counts, total_voters: total };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: "invalid_json" }); }
  const { topics, turnstile_token, fingerprint } = body || {};
  if (!Array.isArray(topics) || topics.length === 0 || topics.length > 10)
    return res.status(400).json({ error: "invalid_topics" });
  for (const t of topics)
    if (!VALID_TOPICS.has(t)) return res.status(400).json({ error: "unknown_topic", topic: t });

  const ok = await verifyTurnstile(
    turnstile_token,
    req.headers["x-forwarded-for"] || req.headers["x-real-ip"]
  );
  if (!ok) return res.status(403).json({ error: "turnstile_failed" });

  const fp = hashFingerprint(fingerprint);
  if (!fp) return res.status(400).json({ error: "missing_fingerprint" });

  const setResult = await redis.set(`issue:fp:${fp}`, JSON.stringify(topics),
    { ex: 60 * 60 * 24 * 365, nx: true });
  if (setResult !== "OK") {
    return res.status(200).json({ ok: true, deduped: true, ...await readIssueCounts() });
  }
  for (const t of topics) await redis.hincrby("issue:counts", t, 1);
  await redis.incr("issue:total_voters");
  return res.status(200).json({ ok: true, ...await readIssueCounts() });
}
```

- [ ] **Step 2:** Write `site/api/issues-aggregate.js`.

```javascript
import { redis } from "./_lib/redis.js";

export default async function handler(req, res) {
  const raw = (await redis.hgetall("issue:counts")) || {};
  const total = parseInt((await redis.get("issue:total_voters")) || 0, 10);
  const counts = {};
  for (const [k, v] of Object.entries(raw)) counts[k] = parseInt(v, 10);
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
  return res.status(200).json({ counts, total_voters: total });
}
```

- [ ] **Step 3:** Commit.

```bash
git add site/api/issue-vote.js site/api/issues-aggregate.js
git commit -m "feat: /api/issue-vote and /api/issues-aggregate endpoints"
```

## Task 24: Confirm `emphasis` is exported in `landing.json`

The `_landing_card` and `_candidate_dossier` functions in `scripts/build_site.py` already include `emphasis` (added in Task 3). Verify.

- [ ] **Step 1:** Inspect output.

```bash
.venv/bin/python scripts/build_site.py
.venv/bin/python -c "import json; [print(c['surname'], c.get('emphasis', {})) for c in json.load(open('site/landing.json'))['candidates']]"
```

Expected: each candidate shows a topic-emphasis dict.

## Task 25: Build the interactive `/issues` page

**Files:** Replace `site/issues/index.html` with the interactive version.

- [ ] **Step 1:** Write the page (uses safe DOM construction throughout — no `innerHTML`).

`site/issues/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Issues &amp; Agenda Gap &middot; The T.O. Mayoral Files</title>
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=Source+Serif+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font:16px/1.5 "Public Sans",system-ui,sans-serif;color:#1b1b1b;background:#f7f8fa;min-height:100vh}
.container{max-width:1100px;margin:0 auto;padding:32px 24px 60px}
header.topnav{background:#0d2f5c;color:#fff;padding:16px 24px}
header.topnav .inner{max-width:1100px;margin:0 auto;display:flex;gap:16px;align-items:center;font:600 13px/1 inherit}
header.topnav a{color:#fff;text-decoration:none;opacity:.85}
header.topnav a:hover,header.topnav a.active{opacity:1;border-bottom:2px solid #da291c}
h1{font:700 28px/1.2 "Source Serif Pro",Georgia,serif;color:#0d2f5c;margin-bottom:6px}
.lede{font-size:14.5px;color:#5a6573;max-width:780px;line-height:1.55;margin-bottom:24px}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}
.tag{background:#fff;border:1px solid #c9c9c9;padding:8px 14px;font-size:13px;cursor:pointer;user-select:none}
.tag.selected{background:#0d2f5c;color:#fff;border-color:#0d2f5c;font-weight:600}
.tag:hover{border-color:#0d2f5c}
.submit{background:#da291c;color:#fff;border:none;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer;margin-top:8px}
.submit:disabled{opacity:.5;cursor:not-allowed}
.gap-table{margin-top:32px;background:#fff;border:1px solid #dfe1e2}
.gap-table h2{font:700 16px Source Serif Pro,Georgia,serif;color:#0d2f5c;padding:14px 18px;border-bottom:1px solid #eee}
.gap-row{display:grid;grid-template-columns:160px 1fr;gap:12px;padding:10px 18px;border-bottom:1px solid #f3f3f3;align-items:center;font-size:13px}
.gap-row:last-child{border:none}
.gap-row .topic-name{font-weight:600}
.gap-row .reader-pct{font-size:11px;color:#5a6573}
.gap-cands{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.gap-cell{background:#f7f8fa;padding:6px 8px;border-left:3px solid #1a4480}
.gap-cell .name{font-size:11px;color:#666;font-weight:600}
.gap-cell .bar{height:10px;background:#e9eef4;margin:4px 0;display:flex}
.gap-cell .bar div{background:#1a4480;height:100%}
.gap-cell .gap{font-size:10px;color:#666}
.gap-cell .gap.over{color:#b58a32}
.gap-cell .gap.under{color:#b50909}
.dis{font-style:italic;color:#999;font-size:11.5px;margin-top:14px}
</style>
</head>
<body>
<header class="topnav"><div class="inner"><a href="/">The T.O. Mayoral Files</a><a href="/">Candidates</a><a href="/compare">Compare</a><a href="/issues" class="active">Issues</a><a href="/methodology">Methodology</a><a href="/about">About</a></div></header>
<div class="container">
<h1>Issues &amp; Agenda Gap</h1>
<p class="lede">Click any Toronto issues that matter to you. We compare reader priority against each candidate's posting frequency on each topic. Anonymous, no login. <a href="/methodology">How this is computed.</a></p>
<div class="tags" id="tags"></div>
<button class="submit" id="submit" disabled>Submit my priorities</button>
<div id="thanks" style="display:none;margin-top:8px;color:#00923f;font-weight:600">Thanks. Your priorities are factored into the chart below.</div>
<div class="gap-table"><h2>Reader priority vs. candidate emphasis</h2><div id="gap-rows">Loading&hellip;</div></div>
<div class="dis">Reader priority based on anonymous self-selected sample &mdash; not a representative poll. Candidate emphasis derived from extracted records weighted by topic frequency.</div>
</div>
<script>
const TOPICS = {
  housing: "Housing", transit: "Transit", safety_crime: "Public safety",
  taxes_fiscal: "Taxes / fiscal", parks_environment: "Parks & environment",
  infrastructure: "Infrastructure", civic_engagement: "Civic engagement",
  governance_ethics: "Governance / ethics",
  small_business_economy: "Small business / economy",
  social_services: "Social services",
};
const SITEKEY = "__TURNSTILE_SITE_KEY__";
const selected = new Set();

function el(tag, attrs, children){
  const n = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)){
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v);
  }
  if (children != null){
    const arr = Array.isArray(children) ? children : [children];
    for (const c of arr){
      if (c == null) continue;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return n;
}

const tagsEl = document.getElementById("tags");
const submitBtn = document.getElementById("submit");
for (const [key, label] of Object.entries(TOPICS)){
  const t = el("button", {class:"tag"}, label);
  t.addEventListener("click", () => {
    if (selected.has(key)){ selected.delete(key); t.classList.remove("selected"); }
    else { selected.add(key); t.classList.add("selected"); }
    submitBtn.disabled = selected.size === 0;
  });
  tagsEl.appendChild(t);
}

function getFingerprint() {
  let fp = localStorage.getItem("tomf-fp");
  if (!fp) {
    fp = [...crypto.getRandomValues(new Uint8Array(16))]
      .map(b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("tomf-fp", fp);
  }
  return fp;
}

let _ts = false;
function ensureTurnstile() {
  if (_ts) return;
  _ts = true;
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  s.async = true;
  document.head.appendChild(s);
}
ensureTurnstile();

async function getToken() {
  if (!SITEKEY || SITEKEY === "__TURNSTILE_SITE_KEY__") return "dev";
  return new Promise(resolve => {
    function attempt() {
      if (window.turnstile) {
        const ctr = document.createElement("div"); ctr.style.display = "none"; document.body.appendChild(ctr);
        window.turnstile.render(ctr, {
          sitekey: SITEKEY, size: "invisible",
          callback: t => resolve(t),
          "error-callback": () => resolve(null),
        });
      } else {
        setTimeout(attempt, 200);
      }
    }
    attempt();
  });
}

submitBtn.addEventListener("click", async () => {
  const token = await getToken();
  const r = await fetch("/api/issue-vote", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({topics: [...selected], turnstile_token: token, fingerprint: getFingerprint()}),
  });
  if (r.ok) {
    document.getElementById("thanks").style.display = "";
    refreshGap();
  }
});

function gapClass(gap){ return gap > 5 ? "over" : gap < -5 ? "under" : ""; }

async function refreshGap() {
  const [reader, landing] = await Promise.all([
    fetch("/api/issues-aggregate").then(r => r.json()).catch(() => ({counts:{}, total_voters:0})),
    fetch("/landing.json").then(r => r.json()),
  ]);
  const total = reader.total_voters || 1;
  const candidates = landing.candidates;
  const rowsEl = document.getElementById("gap-rows");
  rowsEl.replaceChildren();
  for (const [key, label] of Object.entries(TOPICS)) {
    const reader_pct = Math.round(100 * (reader.counts[key] || 0) / total);
    const row = el("div", {class:"gap-row"});
    const topicCol = el("div", {class:"topic-name"}, [
      label,
      el("div", {class:"reader-pct"}, "Reader: " + reader_pct + "%"),
    ]);
    row.appendChild(topicCol);
    const cands = el("div", {class:"gap-cands"});
    for (const c of candidates) {
      const emph = (c.emphasis && c.emphasis[key]) || 0;
      const gap = Math.round(emph - reader_pct);
      const cell = el("div", {class:"gap-cell"});
      cell.appendChild(el("div", {class:"name"}, c.surname));
      const bar = el("div", {class:"bar"});
      bar.appendChild(el("div", {style: "width:" + Math.min(100, emph) + "%"}));
      cell.appendChild(bar);
      cell.appendChild(el("div", {class: "gap " + gapClass(gap)},
        emph + "% emphasis · gap " + (gap >= 0 ? "+" : "") + gap));
      cands.appendChild(cell);
    }
    row.appendChild(cands);
    rowsEl.appendChild(row);
  }
}
refreshGap();
</script>
</body>
</html>
```

> All DOM is built via `el()` + `appendChild()` + `textContent` — no `innerHTML` use anywhere.

- [ ] **Step 2:** Build (the build_site script substitutes the Turnstile site key into this file too — that step is already in `main()` from Task 3).

```bash
TURNSTILE_SITE_KEY=test_dev_key .venv/bin/python scripts/build_site.py
grep -c "test_dev_key" site/issues/index.html
```

Expected: `1` or more.

- [ ] **Step 3:** Commit.

```bash
git add site/issues/index.html
git commit -m "feat: interactive /issues page with reader voting + agenda gap"
```

## Task 26: End-to-end test the issues flow locally

- [ ] **Step 1:** Run `vercel dev`.

```bash
cd site && vercel dev --listen 3000 &
sleep 3
```

- [ ] **Step 2:** Test the issue-vote endpoint.

```bash
curl -s -X POST http://localhost:3000/api/issue-vote \
  -H "Content-Type: application/json" \
  -d '{"topics":["housing","transit","safety_crime"],"fingerprint":"testfingerprint12345"}'
```

Expected: `{"ok":true,"counts":{...},"total_voters":N}`.

- [ ] **Step 3:** Test the aggregate endpoint.

```bash
curl -s http://localhost:3000/api/issues-aggregate
```

Expected: matching counts.

- [ ] **Step 4:** Open the page in a browser, click 3 issues, click Submit. Confirm:
- "Thanks" appears
- Gap table populates with non-zero reader percentages and per-candidate emphasis bars

- [ ] **Step 5:** Stop dev server and commit any incidental fixes.

```bash
kill %1
cd ..
git add -A
git diff --cached --quiet || git commit -m "fix: issues page polish from local e2e test"
```

## Task 27: Deploy Phase 5

- [ ] **Step 1:** Build and deploy.

```bash
./scripts/build_all.sh
cd site && vercel --prod --yes && cd ..
```

- [ ] **Step 2:** Smoke-test.

```bash
URL="https://bradford-files.vercel.app"
curl -s "$URL/api/issues-aggregate"
echo
curl -s -o /dev/null -w "%{http_code}\n" $URL/issues
```

Expected: aggregate JSON returned; `/issues` returns 200.

- [ ] **Step 3:** Browser smoke-test in production. Visit `/issues`, click some topics, submit. Confirm the gap table updates.

- [ ] **Step 4:** Push.

```bash
git push origin main
```

**Phase 5 milestone reached.**

---

# Phase 6: Pol.is Deliberation (Tasks 28–29)

## Task 28: Embed first Pol.is conversation

**Files:**
- Create: `site/issues/transit-funding/discuss/index.html`
- Modify: `site/issues/index.html` (add a deliberation section)

- [ ] **Step 1:** Create a Pol.is conversation. At https://pol.is, sign in (Google or email). Create a conversation:
- **Title:** "Should Toronto raise property tax to fund TTC expansion?"
- **Description:** "Vote agree/disagree on community-submitted statements about transit funding. The algorithm clusters opinion groups and surfaces statements that bridge across groups."
- **Seed statements** (write 5–7 as the operator):
  1. "Toronto needs significant TTC capital investment in the next 4 years."
  2. "Property tax should not increase faster than inflation under any circumstances."
  3. "The Eglinton East LRT extension to Scarborough should be funded ahead of any subway expansion."
  4. "Provincial and federal governments must pay a larger share of TTC capital costs."
  5. "TTC fares should be frozen for the next 4 years even if it requires more property tax."
  6. "Adding road tolls or a vehicle levy is preferable to property-tax increases for transit funding."
  7. "Service expansion should be funded before any new transit construction."

Save and copy the conversation ID (e.g. `5dxykfzrvc`).

- [ ] **Step 2:** Build the embed page.

```bash
mkdir -p site/issues/transit-funding/discuss
```

`site/issues/transit-funding/discuss/index.html` (replace `REPLACE-ME-WITH-CONVERSATION-ID` with the saved ID):

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Transit funding deliberation &middot; The T.O. Mayoral Files</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=Source+Serif+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font:16px/1.5 "Public Sans",system-ui,sans-serif;color:#1b1b1b;background:#f7f8fa}
.container{max-width:980px;margin:0 auto;padding:24px}
h1{font:700 24px/1.2 "Source Serif Pro",Georgia,serif;color:#0d2f5c}
.lede{color:#5a6573;line-height:1.55;margin:8px 0 18px;font-size:14px}
.embed-wrap{background:#fff;border:1px solid #dfe1e2;min-height:600px}
.dis{font-style:italic;color:#999;font-size:11.5px;margin-top:14px}
header.topnav{background:#0d2f5c;color:#fff;padding:14px 24px}
header.topnav a{color:#fff;text-decoration:none;margin-right:14px;font-size:13px;font-weight:600}
</style></head>
<body>
<header class="topnav"><a href="/">The T.O. Mayoral Files</a><a href="/issues">Issues</a></header>
<div class="container">
  <h1>Should Toronto raise property tax to fund TTC expansion?</h1>
  <p class="lede">A deliberative conversation on transit funding. Vote agree/disagree on community-submitted statements; the algorithm clusters opinion groups and surfaces statements that bridge across groups. Powered by <a href="https://pol.is" target="_blank" rel="noopener">Pol.is</a>.</p>
  <div class="embed-wrap">
    <div class="polis" data-conversation_id="REPLACE-ME-WITH-CONVERSATION-ID"></div>
    <script async src="https://pol.is/embed.js"></script>
  </div>
  <p class="dis">Statements are submitted and voted on by Pol.is users; The T.O. Mayoral Files seeds initial statements but does not moderate. Conversation results are not a representative poll.</p>
</div>
</body></html>
```

- [ ] **Step 3:** Add a deliberation section to `/issues`. In `site/issues/index.html`, just before the `<div class="gap-table">`, insert:

```html
<div style="background:#fff;border:1px solid #dfe1e2;padding:18px;margin-top:24px">
  <h2 style="font:700 16px Source Serif Pro,Georgia,serif;color:#0d2f5c">Deliberative discussions</h2>
  <p style="color:#5a6573;font-size:13.5px;margin-top:4px">Open conversations on marquee topics. Vote agree/disagree on community statements; see where Torontonians actually agree.</p>
  <ul style="margin-top:10px;padding-left:18px;font-size:14px">
    <li><a href="/issues/transit-funding/discuss">Transit funding &mdash; should Toronto raise property tax to fund TTC expansion?</a></li>
  </ul>
</div>
```

- [ ] **Step 4:** Smoke-test.

```bash
.venv/bin/python scripts/build_site.py
cd site && python3 -m http.server 8765 &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8765/issues/transit-funding/discuss
kill %1
cd ..
```

Expected: `200`.

- [ ] **Step 5:** Commit.

```bash
git add site/issues/transit-funding/discuss/index.html site/issues/index.html
git commit -m "feat: Pol.is deliberation embed for transit funding"
```

## Task 29: Deploy Phase 6

- [ ] **Step 1:** Deploy.

```bash
./scripts/build_all.sh
cd site && vercel --prod --yes && cd ..
```

- [ ] **Step 2:** Smoke-test in production.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://bradford-files.vercel.app/issues/transit-funding/discuss
```

Expected: 200.

- [ ] **Step 3:** Visit the page in a browser. Confirm the Pol.is iframe loads and displays the seed statements.

- [ ] **Step 4:** Push.

```bash
git push origin main
```

**Phase 6 milestone reached.**

---

# Optional follow-on (Phase 7): polish

Not in scope for this plan. Open a follow-on plan after Phase 6 ships and runs in production for ~1 week. Likely Phase 7 scope:
- Per-candidate RSS feeds at build time
- Source-tier badges (primary doc / video / secondary / social)
- Money-map per candidate (donor data when available)
- Vote Compass quiz layer
- Full `/compare` view

---

## Self-review

**Spec coverage:**
- ✅ Site identity (T.O. Mayoral Files / The X Files) — Tasks 1, 4, 5
- ✅ Card-grid landing — Task 5
- ✅ Per-candidate dashboard preserves Phase 1 chrome — Task 4
- ✅ Equal-billing rules (alphabetical, identical fields, awaiting state) — Tasks 1, 2, 5
- ✅ Council vote ingestion + matching + verification badge — Tasks 10, 11, 12
- ✅ Per-record voting widget — Tasks 18, 19, 20
- ✅ Anti-brigading (Turnstile + fingerprint + Redis SETNX dedup) — Tasks 17, 18, 20
- ✅ `/compare` stub (full implementation deferred to Phase 7)
- ✅ `/issues` page + agenda-gap viz — Tasks 24, 25
- ✅ `/methodology` and `/about` stubs — Task 7
- ✅ Pol.is deliberation embed — Task 28
- ✅ Build pipeline (`build_all.sh`) — Task 13

**Placeholder scan:** No "TBD"/"TODO"/"implement later" lines. The single `REPLACE-ME-WITH-CONVERSATION-ID` placeholder in Task 28 is intentional — it cannot be filled in advance because the operator has to create the Pol.is conversation. The step explicitly tells the engineer where to find the value to substitute.

**Type consistency:**
- `record_id` shape consistent: 6–32 chars, alphanumeric/dash/underscore, used in `/api/vote`, `/api/aggregate`, and `buildTopicRecordId()`.
- `judgment` enum: `kept`, `broke`, `too_early` consistent across server (`VALID_JUDGMENTS`) and client.
- `council_verification` shape: `{record_shortcode, council_vote_id, confidence, match_type, agenda_item, vote_disposition, result, vote_date, vote_description}` — produced in `match_votes.py` (`_match_dict`), consumed in `build_site.py` (`_load_matches` → record annotation), rendered in `candidate-template.html` (Task 12).
- `candidate.json` schema: `handle`, `slug`, `display_name`, `surname`, `files_label`, `current_role`, `candidacy_status`, `platform_pillars`, `result_2023`, `council_name_for_vote_lookup`, `alias_handles` — used consistently.
- Redis keys: `vote:{record_id}:counts` (hash), `vote:{record_id}:fp:{fp}` (string-with-NX), `issue:counts` (hash), `issue:fp:{fp}` (string-with-NX), `issue:total_voters` (counter) — consistent across `vote.js`, `aggregate.js`, `issue-vote.js`, `issues-aggregate.js`.

**Security:**
- All user-rendered DOM uses `el()` + `appendChild()` / `textContent`. No `innerHTML` writes anywhere in the plan. Confirmed by inspection of every script block.
- Fingerprints are SHA-256 hashed server-side before use; never logged in plaintext.
- Turnstile is required server-side in production (`NODE_ENV === "production"` requires the secret; passes through only in development for local testing).
- Static-asset HTTP headers in `vercel.json` set `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.
