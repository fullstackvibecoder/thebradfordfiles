# Methodology

> *The Bradford Files is an independent civic transparency project. This page documents exactly how every record on the site was extracted from public Instagram posts. Nothing is generated, paraphrased, or inferred without disclosure. Every record is sourced to a specific post, click-throughable to the original.*

## What this is

A searchable record of public political content from Brad Bradford's Instagram account ([@bradfordgrams](https://www.instagram.com/bradfordgrams/)). Organized into structured records — Positions, Pledges, Actions, Endorsements, Appearances, Quotes — and surfaced in a dashboard with a centerpiece "Said vs. Done" view that pairs forward-looking commitments against past actions on the same topic.

Not affiliated with the candidate, his campaign, or any political party.

## What it is *not*

- Not a fact-checker. We extract what the post says; we do not adjudicate whether the claims inside are true.
- Not opposition research. There is no editorial framing. No "flip-flop" labels, no "controversy" tags. Where positions evolve over time, evolution is shown chronologically with full quotes — readers conclude.
- Not a private-life tracker. Posts classified as purely personal (birthdays, family vacations, generic life moments) are logged as excluded with a stated reason, but their contents are not extracted or surfaced.

## Pipeline (3 stages)

### Stage 1 — Triage (Claude Haiku 4.5)

Every public post on the source account is classified into one of three buckets:

- **Substantive** — contains a stated political position, pledge, council action, endorsement (received or given), substantive critique, or public appearance with civic content. These get full extraction in Stage 2.
- **Contextual** — personal post but the framing informs civic identity ("as a dad…", "as a city planner…", references to neighborhood roots). These get a single short character note in Stage 2.
- **Skip** — purely personal, no civic content. Logged with reason; no extraction.

The triage classifier sees only the post's caption, post type, mentions, hashtags, and location tag — not the video transcript. It returns a `bucket`, `reason`, and `topics` array per post. Every triage decision is stored in `data/triage.jsonl` and is auditable.

A "Posts Not Surfaced" view on the live site exposes every Skip decision with its reason, so the filter is open to scrutiny.

### Stage 2 — Extraction (Claude Opus 4.7 + Whisper)

For substantive posts that are videos and were flagged as `needs_transcript=true`, audio is extracted from the post's video URL using ffmpeg and transcribed locally with `whisper small.en`. Caption + transcript together are then sent to Claude Opus with a structured tool definition that returns zero or more records of these kinds:

| Kind | Captures |
|---|---|
| **Position** | A stated stance on a topic (e.g., "Supports motorized watercraft ban at Woodbine Beach"). |
| **Pledge** | A future-tense commitment (e.g., "Will keep pushing for buoys, enforcement, and tangible results"). |
| **Action** | A past-tense action: motion, vote, project, intervention (e.g., "Brought motion creating no-go zone; passed unanimously at Council, 2024"). |
| **Endorsement** | A named public endorsement, given or received. |
| **Appearance** | A public event with location and named attendees. |
| **Quote** | A standalone notable quote, used sparingly. |

For contextual posts, a lighter Haiku call extracts a single short background note describing what the post tells us about character or values.

Every record is required to include a `source_quote` field — a verbatim excerpt from the caption or transcript that supports the record. No paraphrasing. The source quote is the receipt.

Every record carries:
- `shortcode` (the Instagram post ID)
- `post_url` (clickable to the original)
- `post_date`
- `extracted_at`
- `model` (which Claude version did the work)
- `source_text` (caption / transcript / both)

### Stage 3 — Surfacing

The dashboard reads the structured records and presents them in views:

- **Said vs. Done** — Pledges and Actions on the same topic shown side-by-side, sorted chronologically. No editorial scoring.
- **By Topic** — All records grouped by topic (housing, transit, safety/crime, taxes/fiscal, parks/environment, etc.).
- **By Date** — Calendar of all records.
- **Endorsements** — Who he's endorsed and who has endorsed him.
- **Appearances** — Geographic and event coverage.
- **Posts Not Surfaced** — Every Skip with reason. Auditable filter.

## Sourcing, evolution, and corrections

Every record links back to the original Instagram post. If a post is deleted or edited after extraction, the original quote and date are preserved on this site as a snapshot. Edits to original posts will be reflected by re-running the pipeline on the next cron cycle.

Where a Position on the same topic appears more than once, the dashboard shows all instances chronologically. Positions that genuinely change are shown changed; the user is presented with the receipts and concludes whether and how. There is no "flip-flop" tag.

If you believe a record is misclassified or extracted inaccurately, [open an issue](https://github.com/fullstackvibecoder/thebradfordfiles/issues) on the public repo — every line of the extraction pipeline is open source.

## Why two Claude models

Triage uses **Haiku 4.5** because it's cheap (~$0.005 per post) and adequate for "is this politically substantive, yes/no/contextual." On 3,642 posts that's ~$18 in API spend.

Extraction uses **Opus 4.7** because the structured-record task is harder: identifying what's a Position vs. a Pledge vs. an Action, locating a verbatim source quote, classifying topic from a controlled vocabulary, all without paraphrase. Opus is roughly 16× the cost (~$0.08 per post) but only runs on the substantive subset (~half of all posts).

Total backfill cost: roughly **$100–135 in Claude API spend**, one-time. Incremental updates afterward cost cents per cycle.

## Why this approach instead of just reading the account

Three reasons:

1. **Search**. 3,642 posts can't be browsed practically. Structured records can be filtered, grouped, and cross-referenced.
2. **Said vs. Done**. Pairing forward-looking pledges with past actions on the same topic is something the account itself doesn't do — the chronology hides it. Voters and journalists benefit from the alignment.
3. **Durability**. Instagram posts disappear, get edited, or get hidden. A timestamped, source-quoted record is a public artifact that doesn't depend on the account's continued availability.

## Limitations and disclosures

- **The triage filter can be wrong.** If we misclassify a substantive post as contextual or skip, it won't surface. This is why every Skip is logged with reason — open to challenge.
- **Audio transcription is imperfect.** Whisper is good but not flawless. Where a transcript may have introduced an error, the source video is one click away for verification.
- **Captions can change.** Instagram allows edits. We snapshot the caption at extraction time. The source URL, when clicked, shows the *current* caption; differences between our snapshot and the live version are normal and traceable via post `extracted_at` timestamp.
- **This site does not currently ingest [@beybradford](https://www.instagram.com/beybradford/)**, the candidate's councillor-era account. That ingestion is planned for Phase 2; until then, Said-vs-Done evidence relies on what the candidate himself surfaces about his council work.

## Open source

The full pipeline, including this methodology page, lives at [github.com/fullstackvibecoder/thebradfordfiles](https://github.com/fullstackvibecoder/thebradfordfiles). MIT licensed. Fork it.

## Operator

The Bradford Files is built and maintained by [Ara at BottleneckLabs / TryEchoMe](https://bottlenecklabs.ai). Independent civic project. No party affiliation. No campaign involvement. No financial relationship with the candidate.
