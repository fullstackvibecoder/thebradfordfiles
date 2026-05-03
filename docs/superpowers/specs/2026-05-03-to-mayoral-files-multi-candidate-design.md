# Design: The T.O. Mayoral Files — Multi-Candidate Tracker

**Date:** 2026-05-03
**Status:** Brainstorm approved · ready for implementation planning
**Project context:** Existing single-candidate dashboard (`bradford-files.vercel.app`) evolves into a multi-candidate Toronto 2026 mayoral race tracker with reader feedback, council-vote verification, and an agenda-gap analytic view.

---

## 1. Decisions locked in this brainstorm

| Decision | Choice |
|---|---|
| Site identity | **The T.O. Mayoral Files** (parent) · *The Chow Files / The Bradford Files / The Brown Files / etc.* (per candidate) |
| Navigation pattern | Card-grid landing page → per-candidate dashboard. Ballotpedia pattern. Equal-billing rules baked in. |
| Reader feedback shape | Layered hybrid. Phase order: per-record kept/broke voting → issue-priority polling → Pol.is deliberation → Vote Compass (deferred). |
| Architecture | Static site + Vercel Functions + Vercel KV + Pol.is iframe + Cloudflare Turnstile + Plausible/GoatCounter. No backend platform migration; no AGPL self-hosted dependencies. |
| Verification source | Toronto Council voting record JSON files (2006–2026, ~200K rows). Cross-referenced against extracted Action records to produce a "Verified vs. Council Vote" badge with confidence score. |

## 2. Site information architecture

```
/                              The T.O. Mayoral Files (landing — card grid)
/<slug>                        The <Name> Files (per-candidate dashboard)
/compare                       Side-by-side candidate comparison (2–3 candidates)
/issues                        Issue-priority polling + agenda-gap visualisation
/issues/<topic>/discuss        Pol.is deliberation embed (Phase 3, marquee topics only)
/methodology                   Extraction methodology, sourcing rules, classifier rubric
/about                         Independence statement, sourcing, corrections process
```

**Slug vs. handle.** The URL slug (e.g., `bradford`, `chow`) is the human-readable per-candidate path. The IG handle (e.g., `bradfordgrams`, `oliviachow`) identifies the data namespace under `data/<handle>/`. A candidate's `candidate.json` manifest declares both, so the mapping is explicit and collisions (e.g., two candidates named Chen) are resolved manually rather than auto-derived.

**Static generation.** Each per-candidate page is generated at build time: `build_site.py` emits `site/<slug>/index.html` per candidate from a shared template, embedding that candidate's data inline. Vercel serves the static files directly; no rewrites or query-param routing required. The landing page (`site/index.html`) reads a small `landing.json` listing candidates plus their card-display fields.

Equal-billing rules:
- Candidates listed alphabetically by surname on the landing card grid.
- Every card displays the same fields in the same order: role, declared date, 2023 result (or "first-time candidate"), posts indexed, records extracted, stated platform pillars.
- "Awaiting declaration" is a tracked state for candidates the Bureau is prepared to onboard but who have not yet filed (e.g., Brown, Chow as of writing).
- No "front-runner / underdog / contender" badges. The reader sees the data and concludes.

## 3. Landing page (`/`)

The T.O. Mayoral Files homepage. Federal-civic chrome (TTC palette, CN Tower silhouette, subway-line accent stripe) carried forward from Phase 1 single-candidate site.

Header overline: `PUBLIC RECORD · THE 416`. Title: `The T.O. Mayoral Files`. Subtitle: *"An independent, sourced record of every confirmed candidate in Toronto's 2026 mayoral race."*

Top-nav: `Candidates · Compare · Issues · Methodology · About`.

Body: card grid (3 columns desktop, 1 column mobile), one card per candidate. Each card is a hyperlink to `/<surname>`. Card visual: navy left-border accent (TTC palette), serif candidate name, role and declaration date, 2023 result line, indexed/records counts, comma-separated platform pillars, blue "View The <Name> Files →" CTA.

For "Awaiting declaration" candidates: card displays the candidate's name and role, the 2023 result if applicable, and the explanatory note "Awaiting 2026 declaration" in muted italics. No fake activity or placeholder records.

## 4. Per-candidate dashboard (`/<surname>`)

Reuses Phase 1 chrome and tab structure verbatim:
- USA banner-equivalent disclosure strip
- TTC palette + CN Tower silhouette + subway-line accent stripe
- Standardized "About this candidate" context block
- Tabs: `Said vs. Done · Positions · Pledges · Actions · Endorsements · Appearances · Quotes · By Topic · By Neighbourhood · Posts Not Surfaced · Methodology`

New extensions over Phase 1:
- Each Action record may display a green **"✓ Verified · Toronto Council voting record"** badge with the matched agenda item (e.g., `2024.GG12.7`), the candidate's vote disposition, the result string, and a link to the council record. Shown only when match confidence exceeds a threshold (defined in `scripts/match_votes.py`).
- Each Said-vs-Done topic block includes a **reader judgment widget** below the pair: three buttons (`Kept · Broke · Too early to tell`), a horizontal aggregate bar with breakdown percentages, sample-size disclosure (`N reader responses · Not a representative poll`), link to methodology.
- Per-candidate "About this candidate" block is generated from a candidate manifest (see Data architecture) so the same factual fields appear in the same order for every candidate.

For non-councillor candidates (e.g., Brown, future first-time candidates): the green verification badge is suppressed because no Council voting record exists. The absence is declared inline with a yellow note: *"This candidate has no prior Toronto Council voting record on file."* The reader judgment widget still operates.

## 5. Compare view (`/compare`)

URL takes query parameters: `?candidates=bradford,chow,brown&topic=transit`. Stateless, shareable.

Layout: candidate selector chips at top, topic filter on the right, three-column stacked layout below (one column per selected candidate). Each column shows that candidate's record count for the topic, the most-recent pledge, the most-recent action with its verification badge if applicable, and a `+ N more` link to that candidate's full filtered record list.

Brown's column (and any non-councillor's) shows the inline yellow "no prior Council voting record" note in place of where verification badges would appear in councillor columns. The site does not pretend to verify what it cannot.

Footer of the view shows the shareable URL and an "Add candidate" affordance.

## 6. Issues view (`/issues`)

Two stacked components:

**Reader voting layer (top).** "Which Toronto issues matter most to you?" with clickable issue tags drawn from the controlled topic taxonomy used by extract.py (`housing, transit, safety_crime, taxes_fiscal, parks_environment, infrastructure, civic_engagement, governance_ethics, small_business_economy, social_services`). Multi-select; readers click to add/remove. Each click POSTs to `/api/issue-vote`.

**Agenda-gap visualization (bottom).** Bar chart per issue. Rows are issues; columns are reader-priority percentage and per-candidate emphasis (% of substantive posts on that topic). Each candidate cell shows the gap signed: `−66` (under-indexed relative to reader priority), `+12` (over-indexed). Colour: muted grey for small gaps, gold for moderate, red for large.

Sample-size disclosure inline: `Reader priority based on N anonymous responses · Not a representative poll · Candidate emphasis derived from extracted records weighted by topic frequency.`

## 7. Pol.is deliberation (`/issues/<topic>/discuss`) — Phase 3

For 3–5 curated marquee deliberative topics ("Should Toronto raise property tax to fund TTC expansion?", "Should encampments be cleared from city parks?"). Pol.is hosted iframe embedded into a sub-route per topic. Editorial responsibility: seed each conversation with 5–10 starting statements, then leave the algorithm to surface bridging statements as participation grows.

This is structurally separate from the per-record voting widget and the issue-priority page. Phase 3 only — does not block Phases 1–5.

## 8. Per-record voting widget — detail

API:
- `POST /api/vote` — body: `{ record_id, judgment: "kept"|"broke"|"too_early", turnstile_token, fingerprint_hash }`. Server verifies Turnstile, dedupes against KV by fingerprint+record, increments counter.
- `GET /api/aggregate?record_id=…` — returns `{ kept, broke, too_early, total }`. Cached at edge for 60 seconds.

Frontend:
- Three buttons inline below each Said-vs-Done topic block. Disabled state after vote (one-vote-per-fingerprint enforcement is server-side; client just provides UX).
- Horizontal aggregate bar with three coloured segments (green / red / grey). Percentage labels and total response count to the right.
- "Not a representative poll" disclosure on every aggregate display.

## 9. Data architecture

```
data/
  <candidate-handle>/
    triage.jsonl                      [existing]
    posts.jsonl                       [existing]
    records.jsonl                     [existing]
    extracted.jsonl                   [existing]
    candidate.json                    [NEW] manifest: name, role, 2023 result,
                                              declared date, platform pillars,
                                              IG handle, photo URL, council term(s)
  votes/
    raw/                              [NEW] converted from City of Toronto JSON
      2006-2010.jsonl
      2010-2014.jsonl
      2014-2018.jsonl
      2018-2022.jsonl
      2022-2026.jsonl
    by-councillor/                    [NEW] index: name → list of vote rows
      bradford-brad.jsonl
      chow-olivia.jsonl
      …
    matches.jsonl                     [NEW] record_id → council_vote_id w/ confidence
  reader-votes/                       [NEW] periodic snapshot from Vercel KV
    record-judgments.jsonl
    issue-priorities.jsonl
site/
  data.json                           [existing — restructured]
  index.html                          [existing — becomes per-candidate template]
  landing.html                        [NEW]
  compare.html                        [NEW]
  issues.html                         [NEW]
  api/
    vote.js                           [NEW] Vercel Function
    issue-vote.js                     [NEW]
    aggregate.js                      [NEW]
scripts/
  triage.py                           [existing]
  extract.py                          [existing]
  build_site.py                       [updated — multi-candidate aware]
  ingest_votes.py                     [NEW] City JSON → JSONL + by-councillor index
  match_votes.py                      [NEW] record ↔ council_vote matcher
  sync_reader_votes.py                [NEW] KV → JSONL snapshot
```

`build_site.py` updates:
- Reads each `data/<handle>/candidate.json` manifest plus the records, posts, triage, extracted, and reader-votes files.
- Emits a parent `site/data.json` keyed by candidate handle with full dossier per candidate.
- Generates per-candidate static HTML pages from a shared template (`site/index.html` becomes the template).
- Emits the landing card grid data into `site/landing.json` (or inlined into `landing.html`).

`ingest_votes.py`:
- Loads the 5 JSON files from `City Council Member Voting Record 2006-2026/`.
- Writes line-delimited JSONL into `data/votes/raw/<term>.jsonl`.
- Builds `data/votes/by-councillor/<surname>-<firstname>.jsonl` for fast per-candidate lookup.

`match_votes.py`:
- For each Action record in `data/<handle>/records.jsonl`:
  - **Tier 1 match (high confidence ≥0.95):** extract any agenda item number from the source quote (regex `\d{4}\.[A-Z]{2}\d+\.\d+`). If matched directly against the candidate's by-councillor JSONL, this is a near-certain match.
  - **Tier 2 match (moderate confidence 0.7–0.94):** date proximity (±60 days from the Action's claimed date) AND keyword overlap between the record's `topic` field and the council vote's `Vote Description` / `Agenda Item Title`. Confidence scored on date closeness × keyword overlap fraction.
  - **No match (below 0.7):** record is unverified; no badge displayed.
- Writes `data/votes/matches.jsonl` with `{record_id, council_vote_id, confidence, match_type, agenda_item, vote_disposition, result}`.
- The frontend reads matches.jsonl during `build_site.py` and inlines verification badges into the dashboard. Confidence threshold of 0.7 is configurable.

## 10. Anti-brigading

Layered, no login wall:

1. **Cloudflare Turnstile** invisible challenge on every vote-submit endpoint. Free tier covers expected traffic.
2. **Browser fingerprint dedup** — one-way hash of (canvas + WebGL + fonts + timezone + UA hash). One vote per fingerprint per record.
3. **Vercel Edge rate limit** — 10 votes/IP/min, 50/hour.
4. **Bucketed aggregate display** — percentages rounded to whole numbers, response counts shown only after rounding (e.g., "62% kept · 218 responses"). Small numerical brigading attempts are absorbed into the rounding.
5. **Public integrity dashboard** at `/methodology#feedback` — shows aggregate vs. raw counts, Turnstile rejections, fingerprint collisions, IP rate-limit triggers. Transparency about the filtering itself.
6. **No login.** Friction kills participation; accounts do not actually reduce brigading on a transparency site.

## 11. Build phases

| Phase | Scope | Effort |
|---|---|---|
| **1 (done)** | Single-candidate Bradford site, federal-civic chrome, Said-vs-Done, methodology, context block. Live at bradford-files.vercel.app. | shipped |
| **2** | Multi-candidate scaffold: `landing.html`, per-candidate template extraction, `/compare` and `/issues` routes (read-only at this stage), `build_site.py` refactor, candidate manifest pattern, domain `themayoralfiles.bottlenecklabs.ai`. | 1–2 days |
| **3** | Council voting record verification: `ingest_votes.py`, `match_votes.py`, "✓ Verified" badge wired into Action cards. Highest-leverage feature. | 1–2 days |
| **4** | Per-record reader voting: Vercel KV provisioning, `vote.js` + `aggregate.js` Functions, Turnstile setup, frontend voting widget on Said-vs-Done pairs. | 2 days |
| **5** | Issue-priority polling: `issue-vote.js`, `/issues` interactive layer, agenda-gap visualization. | 1–2 days |
| **6** | Pol.is deliberation: 3–5 marquee topic embeds, editorial seeding. | half a day setup, ongoing editorial |
| **7** | Polish: per-candidate RSS, source-tier badges, money map, Vote Compass quiz. | rolling, post-launch |

Phases 2 + 3 alone (~3–4 days) move the site to "authoritative public record with primary-source verification" — the meaningful threshold for public launch.

## 12. Methodology updates

Existing `/methodology` page covers triage and extraction. New sections to add for Phase 2+:

- **Verification methodology** — explains the agenda-item matching algorithm, confidence threshold, how mismatches are surfaced, what "verified" does and doesn't mean.
- **Reader feedback methodology** — explains anti-brigading layers, why aggregates are bucketed, how the "Not a representative poll" framing protects against inappropriate generalisation.
- **Equal-billing methodology** — explains alphabetical sort, identical-fields rule, "awaiting declaration" tracked state, no editorial weighting.
- **Council voting record provenance** — cites City of Toronto open data portal, the file dates, what the Bureau does and doesn't modify (e.g., we never re-interpret a vote disposition; "Carried, 25-1" stays "Carried, 25-1").
- **Corrections process** — points to the GitHub issues link as the canonical channel for record disputes.

## 13. Out of scope

Explicitly deferred or not in this design:

- Custom authentication / accounts (anonymous voting only).
- Real-time / WebSocket features (polling cycles are slow enough for refresh-on-load).
- Decidim or Consul Democracy migration (rejected approach; Pol.is iframe gives 90% of the deliberation value at 1% of the ops cost).
- A horse-race "who's winning" poll (rejected: credibility risk).
- Dynamic re-extraction of records after publication (records are snapshotted at extraction time; updated records are appended, not edited in place).
- Council vote ingestion for terms before 2006 (not supplied; can add later if data appears).
- Council races / school board races (mayoral race only for 2026 cycle; structure is general and could extend later).

## 14. Open considerations (not blockers)

- **Domain name.** `themayoralfiles.bottlenecklabs.ai` is the working assumption. A `.com` or `.ca` could be acquired later if the project grows beyond 2026.
- **Photo sourcing for candidate cards.** First-pass: use the Instagram profile picture from `instagrapi` user_info. Per-candidate `candidate.json` allows manual override.
- **Bradford Files alias.** The existing `bradford-files.vercel.app` URL stays alive as a deep-link / vanity URL pointing at `themayoralfiles.bottlenecklabs.ai/bradford`. No migration friction.
- **Council vote matching false-positive rate.** First implementation is conservative (≥0.7 confidence threshold). Open to tuning after we see real records on the matches.jsonl output.
- **Pol.is hosted vs. self-hosted.** Hosted (free) is the default. Only revisit self-hosting if the project is forked into a long-running platform.

---

*Design complete. Next step: implementation planning via writing-plans skill.*
