import { readFileSync, existsSync } from "node:fs";

const SUMMARY_PATH = "web/.refresh-summary.json";
const REPO = process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.GITHUB_TOKEN;

if (!existsSync(SUMMARY_PATH)) {
  console.log("No refresh summary found. Skipping issue post.");
  process.exit(0);
}

const summary = JSON.parse(readFileSync(SUMMARY_PATH, "utf-8"));
if (!summary.failures || summary.failures.length === 0) {
  console.log("No failures. Skipping issue post.");
  process.exit(0);
}

if (!REPO || !TOKEN) {
  console.error("GITHUB_REPOSITORY and GITHUB_TOKEN must be set.");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const title = "Data refresh failures " + today;

const tableHeader = "| File | Anchor | Source | Error | Resource URL |\n|---|---|---|---|---|";
const tableRows = summary.failures.map((f) => {
  const errEscaped = f.error.replace(/\|/g, "\\|");
  return "| `" + f.file + "` | " + f.anchor_id + " | " + f.source + " | " + errEscaped + " | " + (f.resource_url ?? "n/a") + " |";
}).join("\n");

const body = "Weekly data refresh on " + summary.run_at + " encountered failures.\n\n" +
  "**Updated:** " + summary.updated_count + "\n" +
  "**Unchanged:** " + summary.unchanged_count + "\n" +
  "**Failed:** " + summary.failures.length + "\n\n" +
  tableHeader + "\n" + tableRows + "\n\n" +
  "Editorial fields and existing metrics on failed anchors are preserved. Investigate the source error above and update `web/lib/data-sources.ts` if a resource_id or schema has changed.";

const url = "https://api.github.com/repos/" + REPO + "/issues";
const resp = await fetch(url, {
  method: "POST",
  headers: {
    "authorization": "Bearer " + TOKEN,
    "accept": "application/vnd.github+json",
    "content-type": "application/json",
  },
  body: JSON.stringify({ title, body, labels: ["data-refresh-failure"] }),
});
if (!resp.ok) {
  console.error("Failed to create issue: HTTP " + resp.status, await resp.text());
  process.exit(1);
}
const issue = await resp.json();
console.log("Created issue #" + issue.number + ": " + issue.html_url);
