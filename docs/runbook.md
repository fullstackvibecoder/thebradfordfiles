# The Mayoral Record — Operational Runbook

Last updated: 2026-05-04.

This is the on-call doc. When something looks wrong on https://www.mayoralrecord.com, start here.

## Where things live

| System | Where | What it does |
|---|---|---|
| Hosting | https://vercel.com/bottlenecklabs/thebradfordfiles | Static site + Vercel Functions on Fluid Compute |
| Storage | Upstash Redis (via Vercel Marketplace integration) | Vote counters + dedup keys |
| Bot detection | Cloudflare Turnstile dashboard | Reader-vote anti-brigading |
| Analytics | Cloudflare Web Analytics dashboard | Aggregate page views |
| Domain registrar | Cloudflare Registrar | mayoralrecord.com |
| LLM API | Anthropic console | Triage (Haiku 4.5), extraction (Opus 4.7), synthesis (Opus 4.7) |
| Transcription | Deepgram console | Nova 3 transcription for video posts |
| Source-of-record | https://github.com/fullstackvibecoder/thebradfordfiles | Code, plans, specs, methodology |

## Common diagnostic commands

```bash
# Latest deployments
vercel ls --scope bottlenecklabs

# Logs from the latest deployment
vercel logs --scope bottlenecklabs

# Function logs (errors only) for the last hour
vercel logs <deployment-url> --level error --since 1h

# What's currently aliased to the production domain
vercel inspect <deployment-url> --scope bottlenecklabs
```

## Failure modes & fixes

### "/api/vote returns 500"
1. Check function logs: `vercel logs --scope bottlenecklabs --function /api/vote --since 1h`
2. Most common cause: Upstash Redis quota exceeded. Check the Upstash dashboard → "Daily Commands" graph.
3. Less common: `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL` env var lost. Re-pull from Vercel and re-deploy.

### "Reader votes always fail with turnstile_failed"
1. Check Cloudflare Turnstile dashboard → widget settings → Hostname Management. Confirm `mayoralrecord.com` and `www.mayoralrecord.com` are listed.
2. Confirm `TURNSTILE_SECRET_KEY` is set in Vercel project env (production). Run `vercel env ls production | grep TURNSTILE`.
3. If both look right, check the widget itself isn't paused in the Cloudflare dashboard.

### "/issues/transit-funding/discuss shows no statements"
1. The Pol.is conversation auto-creates on first page load. Confirm by checking https://pol.is/admin for a conversation with `page_id=tomf-transit-funding-2026`.
2. If the conversation exists but is empty: log into Pol.is admin and add the 7 seed statements (see Sprint 8A spec, Section 28 manual step).

### "Synthesis paragraph for topic X is empty / wrong"
1. Inspect the cell: `cat data/<handle>/synthesis/<topic>.json | python3 -m json.tool`
2. If it shows `synthesis_skipped_reason: "model_declined"` — the LLM judged the records insufficient. This is correct behavior; the frontend skip-renders.
3. If it shows real content but wrong: regenerate with `--force`:
   ```bash
   set -a && source ./.env && set +a
   .venv/bin/python scripts/synthesize.py --account <handle> --topic <topic> --force
   .venv/bin/python scripts/build_site.py
   ```

### "Vercel deploy is serving stale content"
1. Confirm the alias chain: `vercel inspect <deployment-url>` shows mayoralrecord.com aliases.
2. If aliases are right but content is wrong: re-deploy with `vercel --prod --yes --force` from the `site/` dir. The `--force` skips the build cache.
3. The most common cause is `vercel --prod` being run from a stale checkout. Pull main first.

### "A reader reports an error in a record"
1. Open the GitHub issues link from the error report.
2. The cited shortcode points to an Instagram URL. Click it; verify against the post.
3. Records are in `data/<handle>/records.jsonl`. If the record is wrong, the upstream source (Opus extraction) made an error — re-run extraction with `--force` for that post, or hand-edit and commit the JSONL fix.
4. Re-run `./scripts/build_all.sh` and re-deploy.

## Pipeline operations

### Add a new candidate
1. Create `data/<handle>/candidate.json` (use bradfordgrams's manifest as a template).
2. Run triage: `.venv/bin/python scripts/triage.py --account <handle>`.
3. Run extraction: `.venv/bin/python scripts/extract.py --account <handle>`.
4. Run synthesis: `.venv/bin/python scripts/synthesize_all.py --handles <handle>`.
5. Run `./scripts/build_all.sh`.
6. Deploy: `cd site && vercel --prod --yes`.

### Refresh a candidate's content
The pipeline is idempotent. Re-run triage + extract on a handle whenever you want fresh content. The synthesis cache invalidates automatically when records change.

### Cost touchpoints
- Anthropic API: ~$10 per full synthesis pass + variable for triage/extract per new candidate (Bradford full extract was ~6.5 hours of wall-clock at $30-50 estimated in API spend).
- Vercel function execution: free tier is generous; check the dashboard if usage spikes.
- Upstash Redis: free tier covers ~10k commands/day; we're well under.
- Cloudflare Turnstile: free, unlimited.
- Cloudflare Web Analytics: free.
- Deepgram Nova 3: ~$0.004/minute of audio; full Bradford pass cost a few dollars.

## What's NOT on alerts

This site has no automated paging. We don't get a Slack message when /api/vote 5xxes. The site is monitored by manual visiting.

If we see real traffic and need alerts, the simplest path is:
- Vercel → Project Settings → Notifications → enable email on deploy failures
- Cloudflare → Notifications → enable email on Turnstile widget errors
- For Upstash → use their built-in alerting on quota thresholds

## Manual editorial review

The 17+ synthesis paragraphs are LLM-generated public content under your name. Run the editorial review checklist (`docs/editorial-review.md`) once before a public launch announcement and after any synthesis prompt changes.
