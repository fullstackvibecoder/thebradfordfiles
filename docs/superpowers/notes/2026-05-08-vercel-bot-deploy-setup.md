# Vercel bot-deploy setup

After Sprint 14 ships, the data-refresh workflow has a deploy step that
fires on bot commits, replacing the manual `vercel --prod --yes` operator
step that was needed in Sprint 13.

For the deploy step to actually run, three GitHub repository secrets must
be set. Without them, the deploy step exits cleanly without deploying
(operator falls back to manual deploy, same as Sprint 13 state).

## Secrets to set

| Name | Source |
|---|---|
| `VERCEL_TOKEN` | Generate at https://vercel.com/account/tokens . Recommend "Full Account" scope, 90-day expiry. |
| `VERCEL_ORG_ID` | `cat web/.vercel/project.json` then read field `orgId` |
| `VERCEL_PROJECT_ID` | `cat web/.vercel/project.json` then read field `projectId` |

## How to set them

```bash
# Set the token (paste when prompted)
gh secret set VERCEL_TOKEN --repo fullstackvibecoder/thebradfordfiles

# Set org and project IDs from the local .vercel/project.json
ORG_ID=$(jq -r .orgId web/.vercel/project.json)
gh secret set VERCEL_ORG_ID --repo fullstackvibecoder/thebradfordfiles --body "$ORG_ID"

PROJECT_ID=$(jq -r .projectId web/.vercel/project.json)
gh secret set VERCEL_PROJECT_ID --repo fullstackvibecoder/thebradfordfiles --body "$PROJECT_ID"
```

## Verify

After setting all three:

```bash
gh secret list --repo fullstackvibecoder/thebradfordfiles | grep VERCEL
gh workflow run data-refresh.yml --repo fullstackvibecoder/thebradfordfiles
gh run list --workflow=data-refresh.yml --limit 1
```

The workflow run should:
1. Run refresh-data (success)
2. Commit any data changes
3. If a commit was made, deploy via Vercel CLI (the new Sprint 14 step)
4. Open a failure issue only if a fetch failed

If the deploy step is skipped silently with "VERCEL_* secrets not set", a secret is missing or empty.

## Rotation

Rotate `VERCEL_TOKEN` every 90 days. Org and Project IDs are stable; rotate only when the project moves between Vercel teams.
