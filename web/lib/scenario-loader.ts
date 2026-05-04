import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateScenarioCard, type ScenarioCard } from "./scenario-types";

let SCENARIO_DIR = join(process.cwd(), "public", "data", "scenarios");

export function setScenarioDataDir(path: string): void {
  SCENARIO_DIR = path;
}

export function listScenarios(): ScenarioCard[] {
  if (!existsSync(SCENARIO_DIR)) return [];
  const files = readdirSync(SCENARIO_DIR).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_")
  );
  const out: ScenarioCard[] = [];
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(SCENARIO_DIR, f), "utf-8"));
    const result = validateScenarioCard(raw);
    if (result.ok && result.card) out.push(result.card);
  }
  return out.sort((a, b) => a.topic_short.localeCompare(b.topic_short));
}

export function getScenario(slug: string): ScenarioCard | null {
  const path = join(SCENARIO_DIR, slug + ".json");
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const result = validateScenarioCard(raw);
  return result.ok && result.card ? result.card : null;
}

export function listScenarioSlugs(): string[] {
  return listScenarios().map((c) => c.slug);
}
