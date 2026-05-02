# The Bradford Files

> An independent civic transparency project tracking the public political record of Brad Bradford ([@bradfordgrams](https://www.instagram.com/bradfordgrams/)), Toronto City Councillor and 2026 mayoral candidate.

**Not affiliated with the candidate, his campaign, or any political party.** Every record on this site is sourced directly to a public Instagram post; click through to verify.

## What this is

A searchable, indexed record extracted from the candidate's public Instagram posts. The site organizes his stated positions, pledges, council actions, endorsements, and public appearances into structured records, with a centerpiece "Said vs. Done" view pairing pledges against subsequent actions on the same topic.

The pipeline is deliberately conservative:

- A cheap **triage classifier** (Claude Haiku 4.5) reviews each post's caption and decides whether it contains substantive political content, contextual character information, or purely personal material.
- Only posts classified as substantive get full extraction (Claude Opus on caption + transcribed audio).
- Every triage decision is logged with a stated reason, so the filter is auditable.
- Personal posts are not extracted, but they are logged as such — readers can see what was excluded and why.

## Methodology

See `/methodology` on the live site for the full extraction methodology, including:
- Triage prompt and rubric
- Extraction schema
- How records are dated and sourced
- How "Said vs. Done" pairs are constructed
- How to request a correction

## Stack

- **Instaloader** — IG profile pagination + caption + media download
- **whisper small.en** — local audio transcription
- **Claude Haiku 4.5** — triage (cheap, fast)
- **Claude Opus 4.7** — full extraction (structured tool use)
- Vanilla HTML/CSS/JS dashboard, single-file
- GitHub Actions cron for incremental updates
- Hosted on Vercel

## License

MIT. See `LICENSE`.
