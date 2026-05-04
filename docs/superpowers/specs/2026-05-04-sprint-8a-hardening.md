# Sprint 8A — Pre-Launch Hardening + Observability

**Date:** 2026-05-04
**Owner:** ara@thespringteam.ca
**Status:** Approved (verbal)

## Goal

Tighten the production site at mayoralrecord.com so that a public launch announcement is defensible. Eight items: three engineering bug-fixes carrying real production risk, three credibility/discoverability additions (privacy/terms, analytics, social cards), one operational doc, and an editorial review of the 17 synthesis paragraphs already published.

This sprint adds **no new user-facing features**. It fortifies what shipped in Phases 1–7.

## Context

Phases 1–7 are live at https://www.mayoralrecord.com. The site:
- Indexes 5,905 records across two candidates plus an alias account
- Renders per-candidate dashboards with verified council-vote badges and LLM synthesis
- Accepts reader voting via Turnstile-gated Vercel Functions backed by Upstash Redis
- Hosts a Pol.is deliberation embed

A handful of soft issues were flagged during Phase 7's deploy but punted forward:

- **Synthesis schema permits a degenerate state.** Three Bradford topics returned `summary: null`, `consistency: null`, AND `synthesis_skipped_reason: null` — neither "I synthesized" nor "I gave up." The frontend now skip-renders these via a content check, but the underlying schema should constrain the model so this can't happen.
- **Cache-key collision case.** A test run during Phase 7 wrote mock LLM output to `data/bradfordgrams/synthesis/transit.json` with a real records hash. The next production run saw a cache hit and served mock content as real. Manually rescued via `--force`. The cache key needs a salt or environment marker.
- **`source_account` attribution wrong.** Records merged from `@beybradford` (Bradford's councillor archive) all show `source_account: bradfordgrams` in the dossier because `build_site.py` calls `r.setdefault("source_account", handle)` AFTER merge. Records loaded from beybradford never carry their origin handle into the dossier.
- **No privacy/terms.** Civic-transparency project that collects reader-vote fingerprints (one-way SHA-256 hashes) needs a plain-English disclosure.
- **No analytics.** Can't measure traffic without it.
- **No social-share cards.** When the URL is shared, default previews look broken/random.
- **No operational runbook.** When something breaks at 2am, the operator has nowhere to look.
- **Synthesis paragraphs aren't operator-reviewed.** They're publicly visible LLM-generated content under your name.

## Non-goals

- New record kinds, new candidate onboarding, or any feature that adds editorial scope.
- Real-time alerting (Slack/email pages on error spikes) — defer until we have one real incident to inform what's worth alerting on.
- Generated legal templates (Termly, Iubenda) — plain-English disclosure is more honest for this project.
- Analytics dashboards beyond what Cloudflare's UI provides.
- Source-tier badges (this moves to Sprint 8C alongside `/compare`).

## Architecture

No architectural changes. Eight focused fixes/additions across existing files:

```
scripts/lib/synthesis.py        — tighten SYNTHESIS_TOOL_SCHEMA + add cache namespace
scripts/synthesize.py           — emit cache namespace into output
scripts/extract.py              — write source_account on each record at extract time
scripts/build_site.py           — stop overwriting source_account when merging aliases
site/index.html                 — analytics beacon, OG meta tags, sitemap link
site/candidate-template.html    — analytics beacon, OG meta tags
site/issues/index.html          — analytics beacon, OG meta tags
site/methodology/index.html     — link to privacy + terms
site/privacy/index.html         — NEW
site/terms/index.html           — NEW
site/api/og.js                  — NEW (Vercel OG dynamic image generation)
site/sitemap.xml                — NEW (static; ~10 routes)
site/robots.txt                 — NEW
site/vercel.json                — add /sitemap.xml routing if needed
docs/runbook.md                 — NEW
data/<handle>/synthesis/<topic>.json — backfill with `cache_namespace` on next regen
```

## Section 1 — Engineering bug-fixes

### 1.1 Synthesis schema tightening

The schema currently allows:
```json
{ "summary": null, "consistency": null, "synthesis_skipped_reason": null }
```
which is the degenerate state. The fix is a structural constraint expressed via two tweaks:

1. The `synthesis_skipped_reason` enum becomes `["insufficient_data", "model_declined"]` (both string values; `null` removed). When a result is real, the field's omission from `tool_input` is interpreted as success — not equivalent to `null`.
2. The handler validates after extraction: if `summary is None` and `synthesis_skipped_reason is None`, raise `ValueError("model returned degenerate response")` and the cell is logged as an error (no cache write).

This means a model that wants to "punt" must explicitly say `synthesis_skipped_reason: "model_declined"`. The methodology page documents the new enum.

**Cache invalidation:** The system prompt is updated to introduce the `model_declined` option, which changes `SYSTEM_PROMPT_HASH`, which invalidates all 20 cached cells. Next batch run regenerates everything (~$10).

### 1.2 Cache-key namespace

`is_cache_valid(cached, current_records_hash, current_prompt_hash, current_model)` becomes:

```python
def is_cache_valid(cached, current_records_hash, current_prompt_hash,
                   current_model, current_cache_namespace):
    if not cached:
        return False
    return (
        cached.get("input_records_hash") == current_records_hash
        and cached.get("system_prompt_hash") == current_prompt_hash
        and cached.get("model") == current_model
        and cached.get("cache_namespace") == current_cache_namespace
    )
```

`CACHE_NAMESPACE = "production-v1"` is a constant in `scripts/lib/synthesis.py`. Test fixtures override it to `"test"`. This guarantees test runs cannot produce cache files that match real-data hashes — even if the input records happen to overlap by accident.

The output JSON gains a `cache_namespace` field. Existing cached files (without that field) fail the validity check and regenerate on the next run.

### 1.3 `source_account` attribution at extract time

`scripts/extract.py` already knows which account it's processing. We make it write `"source_account": <handle>` on every record at the moment of write to `records.jsonl`.

`scripts/build_site.py` currently does:
```python
r.setdefault("source_account", handle)  # uses primary handle for ALL records
```
which clobbers nothing if the record already has the field. So once `extract.py` writes the field, the build script's setdefault becomes a no-op for new records — the alias attribution flows through correctly.

For existing records (already on disk) we either:
- (a) **Don't backfill** — accept that historic records show the primary handle. Tradeoff: source filtering on the dossier won't show the alias-vs-primary split.
- (b) **One-time backfill script**: `scripts/backfill_source_account.py` reads `data/<handle>/records.jsonl`, sets `source_account: <handle>` if missing, writes back.

Recommendation: **(b)**. It's a 20-line script and we've got 5,905 records with the bug.

## Section 2 — Privacy + Terms

`site/privacy/index.html` and `site/terms/index.html`. Plain-English. Linked from the footer of the landing page and from `/methodology`.

**Privacy page covers:**
- What we collect: anonymous browser fingerprints (one-way SHA-256 hashed) for one-vote-per-record dedup; aggregate page-view counts via Cloudflare Web Analytics (cookieless).
- What we don't: no accounts, no email, no IP logging, no third-party advertising trackers, no individual user tracking across sessions.
- Third parties: Cloudflare (analytics + Turnstile + Pol.is hosted iframe), Upstash (Redis storage of vote counters), Vercel (hosting). Each linked.
- Data retention: vote counters retained indefinitely (aggregate); fingerprint dedup keys auto-expire after 365 days.
- Contact: a `mailto:` to a project email.

**Terms page covers:**
- The site is an independent civic-transparency project. Not affiliated with any candidate, campaign, or political party.
- Reader judgments are reader-submitted; we don't moderate but we may remove brigaded-looking activity.
- Synthesis content is LLM-generated; primary sources (cited shortcodes) are authoritative.
- No warranty, no political advice, etc. — standard civic-publication disclaimers.
- A "if you find an error" pointer to the GitHub issues link.

**Footer:** A line is added — "Privacy · Terms · Methodology" — to the landing page and per-candidate template.

A note at the bottom of each: "This is a plain-English disclosure. It is not legal advice. If you have a specific concern, contact us."

## Section 3 — Analytics

Cloudflare Web Analytics via JS beacon (no DNS proxying required):

```html
<script defer src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token":"<CF_BEACON_TOKEN>"}'></script>
```

Setup:
1. In the Cloudflare dashboard → Web Analytics → Add a site → choose "Manual setup" → enter `mayoralrecord.com` (and `www.mayoralrecord.com`).
2. Cloudflare gives a beacon token (a hex string).
3. We add the beacon to `site/index.html`, `site/candidate-template.html`, `site/issues/index.html`, and the issues sub-pages. Single line, end of `<body>`.
4. The token can be public (it's a beacon ID, not a secret). We hard-code it in the templates.

Analytics shows up in the same Cloudflare dashboard as Turnstile.

The privacy page mentions analytics is enabled and links to Cloudflare's privacy explainer.

## Section 4 — Social cards (Vercel OG)

Vercel's `@vercel/og` library generates social-share images at `/api/og`. Because the site is static + a few API functions on Fluid Compute, `@vercel/og` is the natural fit (no extra dep beyond what we have).

`site/api/og.js` accepts query params and returns an image:

- `/api/og?type=landing` → "The Mayoral Record" + tagline
- `/api/og?type=candidate&slug=bradford` → "The Bradford Files" + record count + consistency dot color (rendered as a colored dot)
- `/api/og?type=issues` → "Issues & Agenda Gap" + topic count
- `/api/og?type=deliberation&page_id=tomf-transit-funding-2026` → topic title + Pol.is logo

Pages then declare:

```html
<meta property="og:image" content="https://www.mayoralrecord.com/api/og?type=landing">
<meta property="og:title" content="The Mayoral Record">
<meta property="og:description" content="...">
<meta name="twitter:card" content="summary_large_image">
```

Cards are 1200×630, the OG default.

We don't need to ship hand-drawn assets; the renderer composes them from text + the existing brand palette.

Cost: trivial. Vercel OG is built-in, runs on the same Fluid Compute pool as `/api/vote`, free on the current plan.

## Section 5 — Sitemap + robots

`site/sitemap.xml` — static, generated by `scripts/build_site.py` on each build. Lists:
- `/`
- `/bradford`, `/chow` (and any future candidates from `load_all_candidates()`)
- `/compare`, `/issues`, `/methodology`, `/about`, `/privacy`, `/terms`
- `/issues/transit-funding/discuss`

Each entry has a `<lastmod>` derived from the dossier's `generated_at` field (or the `mtime` of the source HTML for static pages).

`site/robots.txt`:
```
User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://www.mayoralrecord.com/sitemap.xml
```

## Section 6 — Operational runbook

`docs/runbook.md`. Plain markdown. Covers:

- **Where to look when something breaks**:
  - Vercel deployment logs: `vercel logs <deployment>`
  - Vercel function logs: `vercel logs --function /api/vote --since 1h`
  - Upstash Redis dashboard URL + how to read the counters
  - Cloudflare Turnstile analytics URL + signs of brigading attempts
  - Cloudflare Web Analytics dashboard URL
  - GitHub Issues for reader-reported errors
- **Common failure modes** and what to do:
  - 5xx from `/api/vote` → check Upstash quota
  - Turnstile failure rate spikes → check widget hostnames
  - Synthesis cells empty → re-run with `--force`
  - Vercel deploy serves stale content → re-deploy with `vercel --prod --force`
- **Pipeline operations**:
  - Re-running extraction for a single candidate
  - Re-running match_votes after new records
  - Adding a new candidate (manifest + initial run)
- **Cost touchpoints**: Anthropic API monthly check, Vercel function execution, Upstash Redis tier.
- **What is NOT on alerts** — explicitly: we don't have paging set up; the site is monitored by visiting it.

This document lives in the repo, under version control. It's not user-facing.

## Section 7 — Editorial review of synthesis paragraphs

The 17 published synthesis paragraphs (10 Bradford × topics − 3 punts + 8 Chow + the rescued transit cell + the rest) are publicly visible. Each one needs an operator pass against four checks:

1. **No character claims**: does the paragraph describe positions, or does it slip into commentary on the candidate's intent, sincerity, motivation?
2. **No speculation**: does it talk about what the candidate "will" do, "wants" to do, or might do in 2026?
3. **Cited claims match cited records**: pick 2-3 cited shortcodes per paragraph, click through, confirm the record actually supports the claim.
4. **Tonal balance**: does Bradford's synthesis read in the same register as Chow's? Or does one sound more sympathetic than the other?

A flagged synthesis goes back through `scripts/synthesize.py --force` after we adjust the prompt or the cited records.

This sprint commits the operator review process to a checklist in the runbook. The actual review pass is a 30-60 minute task for the operator; we don't write code for it.

## Section 8 — Wiring it all together

After all eight items land:

1. Run `scripts/backfill_source_account.py` — applies the source_account fix to existing records.
2. Run `scripts/build_all.sh` — invalidates synthesis cache, regenerates 18 cells with the tightened schema (~$10), refreshes `matches.jsonl`, regenerates dossiers.
3. Operator runs the editorial review pass (manual, 30-60 min).
4. Manual fixes via `--force` regen for any flagged cells.
5. `vercel --prod --yes` from `site/`.
6. Smoke-check the live site: `/`, `/bradford`, `/chow`, `/privacy`, `/terms`, `/sitemap.xml`, `/robots.txt`, `/api/og?type=landing`.

## Acceptance criteria

Sprint 8A is "done" when:

1. The synthesis schema rejects degenerate model responses (test coverage proves it).
2. The cache namespace prevents test residue from poisoning real data (test coverage proves it).
3. New records on disk carry `source_account: <handle>` from extract.py write time; backfill script repaired existing records.
4. `/privacy` and `/terms` pages exist, are linked from the footer, and pass plain-English readability (no legal-ese).
5. Cloudflare beacon is loaded on all 4+ public pages and the dashboard shows traffic.
6. `/api/og?type=...` returns a 1200×630 PNG for landing, candidate, issues, and deliberation types.
7. `/sitemap.xml` lists all public routes and validates against XML sitemap schema.
8. `/robots.txt` is reachable.
9. `docs/runbook.md` documents the standard operational path for each failure mode.
10. The 17 synthesis paragraphs have been operator-reviewed (logged via a `editorial-review.md` checklist).

## Open considerations

1. **Whether to expose a public stats page** at `/stats` showing aggregate traffic. Cloudflare doesn't expose a public API for this, so it would have to be screenshots or hand-curated. Defer to 8C.
2. **Whether `/privacy` discloses Pol.is**. Pol.is is a third-party iframe; their cookies & data practices are NOT under our control. The privacy page must mention it explicitly with a link to Pol.is's own policy. Including this in section 2 above.
3. **Brigading detection**. We have one-vote-per-fingerprint dedup. We don't have IP-rate-limiting beyond Turnstile. Worth noting in the runbook but not adding code for in 8A.
4. **Backups**. Upstash Redis tier may or may not include backups; worth checking. Records.jsonl is in git so already backed up.
