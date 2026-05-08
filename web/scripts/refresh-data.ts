import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { lookupSource } from "../lib/data-sources";

interface AnchorPullConfig {
  source: string;
  params?: Record<string, string | number>;
  format: string;
}

interface AnchorWithPullConfig {
  sub_section_anchor: string;
  metric: string;
  as_of: string;
  pull_config?: AnchorPullConfig;
  [key: string]: unknown;
}

interface CardWithAnchors {
  receipt?: { anchors: AnchorWithPullConfig[] };
  [key: string]: unknown;
}

interface FailureRecord {
  file: string;
  anchor_id: string;
  source: string;
  error: string;
  attempted_at: string;
  resource_url?: string;
}

interface RefreshSummary {
  run_at: string;
  updated_count: number;
  unchanged_count: number;
  failures: FailureRecord[];
}

export function applyFormat(format: string, value: string | number, params: Record<string, string | number> | undefined): string {
  let out = format.replace(/\{value\}/g, String(value));
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replaceAll("{" + k + "}", String(v));
    }
  }
  return out;
}

export async function refreshAnchor(
  file: string,
  anchor: AnchorWithPullConfig,
  failures: FailureRecord[]
): Promise<boolean> {
  const cfg = anchor.pull_config;
  if (!cfg) return false;
  const source = lookupSource(cfg.source);
  if (!source) {
    failures.push({
      file,
      anchor_id: anchor.sub_section_anchor,
      source: cfg.source,
      error: "Unknown source in registry: " + cfg.source,
      attempted_at: new Date().toISOString(),
    });
    return false;
  }
  try {
    const result = await source.fetch(cfg.params ?? {});
    const newMetric = applyFormat(cfg.format, result.value, cfg.params);
    const changed = anchor.metric !== newMetric || anchor.as_of !== result.as_of;
    anchor.metric = newMetric;
    anchor.as_of = result.as_of;
    return changed;
  } catch (err) {
    failures.push({
      file,
      anchor_id: anchor.sub_section_anchor,
      source: cfg.source,
      error: err instanceof Error ? err.message : String(err),
      attempted_at: new Date().toISOString(),
    });
    return false;
  }
}

async function processFile(path: string, failures: FailureRecord[]): Promise<{ updated: number; unchanged: number }> {
  const raw = readFileSync(path, "utf-8");
  const card = JSON.parse(raw) as CardWithAnchors;
  let updated = 0;
  let unchanged = 0;
  if (card.receipt?.anchors) {
    for (const anchor of card.receipt.anchors) {
      if (!anchor.pull_config) {
        unchanged += 1;
        continue;
      }
      const changed = await refreshAnchor(path, anchor, failures);
      if (changed) updated += 1;
      else unchanged += 1;
    }
  }
  if (updated > 0) {
    writeFileSync(path, JSON.stringify(card, null, 2) + "\n");
  }
  return { updated, unchanged };
}

async function main() {
  const failures: FailureRecord[] = [];
  let totalUpdated = 0;
  let totalUnchanged = 0;
  const dirs = [
    join(process.cwd(), "public", "data", "receipts"),
    join(process.cwd(), "public", "data", "scenarios"),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    for (const f of files) {
      const result = await processFile(join(dir, f), failures);
      totalUpdated += result.updated;
      totalUnchanged += result.unchanged;
    }
  }
  const summary: RefreshSummary = {
    run_at: new Date().toISOString(),
    updated_count: totalUpdated,
    unchanged_count: totalUnchanged,
    failures,
  };
  writeFileSync(join(process.cwd(), ".refresh-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log("Refresh complete: " + totalUpdated + " updated, " + totalUnchanged + " unchanged, " + failures.length + " failures.");
}

// Only run main when invoked directly (not when imported by tests)
const isMain = (() => {
  try {
    return import.meta.url === "file://" + process.argv[1] || process.argv[1].endsWith("refresh-data.ts") || process.argv[1].endsWith("refresh-data.js");
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error("refresh-data fatal error:", err);
    process.exit(1);
  });
}
