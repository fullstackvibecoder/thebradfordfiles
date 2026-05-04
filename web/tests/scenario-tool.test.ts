import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setScenarioDataDir } from "@/lib/scenario-loader";
import { getScenarioCard, type RedisLogger } from "@/lib/agent/scenario-tool";
import { validScenario } from "./fixtures/valid-scenario";

let tmp: string;
const housing = validScenario({
  slug: "housing-supply-mechanism",
  topic: "City as developer or private-sector primary",
  topic_short: "Housing supply",
  pull_quote: "Research finds the two mechanisms reach different populations on different timeframes. Bradford supply-side and Chow direct delivery target distinct beneficiary groups.",
});
const transit = validScenario({
  slug: "transit-operating-funding",
  topic: "TTC operating funding mechanism",
  topic_short: "Transit operating funding",
  pull_quote: "Toronto faces a structural transit operating gap through 2034. Bradford and Chow propose different revenue mechanisms with different incidence profiles.",
});

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-scn-tool-"));
  setScenarioDataDir(tmp);
  writeFileSync(join(tmp, "housing-supply-mechanism.json"), JSON.stringify(housing));
  writeFileSync(join(tmp, "transit-operating-funding.json"), JSON.stringify(transit));
});

class FakeLogger implements RedisLogger {
  pushed: string[] = [];
  trims: [string, number, number][] = [];
  async lpush(key: string, value: string) { this.pushed.push(key + ":" + value); return 1; }
  async ltrim(key: string, start: number, stop: number) { this.trims.push([key, start, stop]); return "OK"; }
}

test("matches via topic_hint exact", async () => {
  const r = await getScenarioCard(
    { query: "irrelevant text", topic_hint: "housing-supply-mechanism" },
    null,
    "agent reasoned about a hint"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.slug).toBe("housing-supply-mechanism");
});

test("matches via keyword overlap when query mentions topic", async () => {
  const r = await getScenarioCard(
    { query: "What would happen if Toronto cut development charges to boost housing supply?" },
    null,
    "agent saw housing keywords"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.slug).toBe("housing-supply-mechanism");
});

test("matches transit query to transit card", async () => {
  const r = await getScenarioCard(
    { query: "Who pays for the TTC operating budget through 2034?" },
    null,
    "transit keywords"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.slug).toBe("transit-operating-funding");
});

test("returns no_match for clearly off-topic query", async () => {
  const logger = new FakeLogger();
  const r = await getScenarioCard(
    { query: "What is the best pizza topping?" },
    logger,
    "no scenario applies"
  );
  expect(r.status).toBe("no_match");
});

test("logs no_match queries to Redis with timestamp and reasoning", async () => {
  const logger = new FakeLogger();
  await getScenarioCard(
    { query: "Tell me about constellations." },
    logger,
    "scenario corpus does not cover astronomy"
  );
  expect(logger.pushed).toHaveLength(1);
  const entry = logger.pushed[0];
  expect(entry).toContain("scenarios:unmatched:");
  expect(entry).toContain("constellations");
  expect(entry).toContain("astronomy");
});

test("trims the Redis list to 1000 entries on each no_match", async () => {
  const logger = new FakeLogger();
  await getScenarioCard({ query: "completely unrelated" }, logger, "no match");
  expect(logger.trims).toEqual([["scenarios:unmatched", 0, 999]]);
});

test("returns no_match when no scenarios are loaded", async () => {
  const empty = mkdtempSync(join(tmpdir(), "tomr-empty-"));
  setScenarioDataDir(empty);
  const r = await getScenarioCard({ query: "anything" }, null, "no corpus");
  expect(r.status).toBe("no_match");
});
