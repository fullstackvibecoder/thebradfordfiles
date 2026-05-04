import { redis } from "./_lib/redis.js";
import { verifyTurnstile } from "./_lib/turnstile.js";
import { hashFingerprint } from "./_lib/fingerprint.js";

const VALID_TOPICS = new Set([
  "housing", "transit", "safety_crime", "taxes_fiscal",
  "parks_environment", "infrastructure", "civic_engagement",
  "governance_ethics", "small_business_economy", "social_services",
]);

async function readIssueCounts() {
  const raw = (await redis.hgetall("issue:counts")) || {};
  const total = parseInt((await redis.get("issue:total_voters")) || 0, 10);
  const counts = {};
  for (const [k, v] of Object.entries(raw)) counts[k] = parseInt(v, 10);
  return { counts, total_voters: total };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: "invalid_json" }); }
  const { topics, turnstile_token, fingerprint } = body || {};
  if (!Array.isArray(topics) || topics.length === 0 || topics.length > 10)
    return res.status(400).json({ error: "invalid_topics" });
  for (const t of topics)
    if (!VALID_TOPICS.has(t)) return res.status(400).json({ error: "unknown_topic", topic: t });

  const ok = await verifyTurnstile(
    turnstile_token,
    req.headers["x-forwarded-for"] || req.headers["x-real-ip"]
  );
  if (!ok) return res.status(403).json({ error: "turnstile_failed" });

  const fp = hashFingerprint(fingerprint);
  if (!fp) return res.status(400).json({ error: "missing_fingerprint" });

  const setResult = await redis.set(`issue:fp:${fp}`, JSON.stringify(topics),
    { ex: 60 * 60 * 24 * 365, nx: true });
  if (setResult !== "OK") {
    return res.status(200).json({ ok: true, deduped: true, ...await readIssueCounts() });
  }
  for (const t of topics) await redis.hincrby("issue:counts", t, 1);
  await redis.incr("issue:total_voters");
  return res.status(200).json({ ok: true, ...await readIssueCounts() });
}
