# Vercel auto-deploy fix, 2026-05-11

## Symptom

From Sprint 13 onward, pushes to `origin/main` from both `aramamo` (operator)
and `data-refresh[bot]` (cron) stopped triggering Vercel auto-deploys.
Production (www.mayoralrecord.com) stayed stale until a manual
`vercel --prod --yes` was run. The Sprint 14 GitHub Actions workflow had a
manual Deploy step as a workaround.

## Root cause

The Vercel project (`prj_iPFWEkDXvl8ANaZkVYTk9cAXp40x`, team
`bottlenecklabs`) had been disconnected from its GitHub repository. The
project's REST API response contained NO `link` field and NO
`gitRepository` field, meaning Vercel had no git source to listen to.

Diagnostic evidence:

1. `GET /v9/projects/$PROJECT_ID` returned a project with these
   git-related fields only: `gitComments`, `gitForkProtection`,
   `gitLFS`, `gitProviderOptions`. NO `link` and NO `gitRepository`.
2. `commandForIgnoringBuildStep` was `null`, so it was not an
   ignored-build issue.
3. The most recent deployment's `meta` block still carried correct
   `githubCommitRef: main`, `githubOrg: fullstackvibecoder`,
   `githubRepo: thebradfordfiles`, confirming the project HAD been
   git-linked historically. The link had been silently removed.
4. The GitHub side was healthy: the `vercel` GitHub App is installed on
   the `fullstackvibecoder` org with `repository_selection: all` and
   could read the repo. The repo itself had zero classic webhooks
   (expected: Vercel uses the GitHub App event stream, not webhooks).
5. Reproduction at 19:38:35 UTC: pushed `82baa6c` (empty commit) to
   `origin/main`. After 90s no new deployment appeared. Symptom
   reproduced.

This was the missing piece that explained why GitHub Actions could push
to main but Vercel never picked it up.

## Remediation

Re-linked the project to GitHub via REST API:

```
POST https://api.vercel.com/v9/projects/$PROJECT_ID/link?teamId=$ORG_ID
Authorization: Bearer <CLI token>
Content-Type: application/json

{"type":"github","repo":"fullstackvibecoder/thebradfordfiles"}
```

After the POST, re-fetching the project returned a `link` object:

```
"link": {
  "type": "github",
  "repo": "thebradfordfiles",
  "repoId": 1227517138,
  "org": "fullstackvibecoder",
  "repoOwnerId": 239437634,
  "gitCredentialId": "cred_...",
  "productionBranch": "main",
  "createdAt": 1778528420001
}
```

No other settings were modified. The Vercel project, the GitHub App
installation, and the repository were all left otherwise untouched.

## Verification

At 19:40:37 UTC, pushed `040e342` (second empty commit) to
`origin/main`. Within 75s, `vercel ls` showed a fresh production
deployment:

- id: `dpl_H5TAw5KB4qNYWe5kvz2rFAgpa3uG`
- url: `https://thebradfordfiles-3vyozhilh-bottlenecklabs.vercel.app`
- created: 19:40:38 UTC (1 second after the push)
- status: Ready
- build duration: 21s
- aliases assigned: `www.mayoralrecord.com`, `mayoralrecord.com`,
  `bradford-files.vercel.app`,
  `thebradfordfiles-git-main-bottlenecklabs.vercel.app` (the new
  branch-alias confirms git integration is healthy)

Auto-deploy is fully restored.

## What to check if it breaks again

1. `GET /v9/projects/$PROJECT_ID?teamId=$ORG_ID` and look at the `link`
   field. If it is missing, the project has been unlinked again.
   Re-link via POST to `/v9/projects/$PROJECT_ID/link` as above.
2. Check the `commandForIgnoringBuildStep` field. If non-null, that may
   be silently rejecting commits.
3. Check `latestDeployments[0].meta` for `githubCommitRef`. If recent
   deployments have no github metadata, the project is not consuming
   GitHub events.
4. Check the GitHub App installation at
   `/orgs/fullstackvibecoder/installations`: look for `app_slug:
   vercel`. If missing, the GitHub App was uninstalled and needs to be
   reinstalled from the Vercel Dashboard.
5. As a last resort, the operator-action workaround documented in
   `docs/superpowers/notes/2026-05-08-vercel-bot-deploy-setup.md`
   (manual `vercel --prod --yes`) still works.

## How the link was lost

Unknown. The project was clearly git-linked at deployment time
`1778376595877` (2026-05-09, two days before this fix), because that
deployment's `meta` carries github commit info. Some action between
then and 2026-05-11 stripped the link. Candidates: a dashboard
disconnect, a previous CLI command, or a Vercel-side automated cleanup
of a stale credential. Worth knowing if it recurs.
