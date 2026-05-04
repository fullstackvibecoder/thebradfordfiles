import { redis } from "./_lib/redis.js";
import { verifyTurnstile } from "./_lib/turnstile.js";
import { hashFingerprint } from "./_lib/fingerprint.js";

const VALID_JUDGMENTS = new Set(["kept", "broke", "too_early"]);
const RECORD_ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

function normalizeCounts(raw) {
  const c = raw || {};
  return {
    kept: parseInt(c.kept || 0, 10),
    broke: parseInt(c.broke || 0, 10),
    too_early: parseInt(c.too_early || 0, 10),
    total: parseInt(c.total || 0, 10),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: "invalid_json" }); }
  const { record_id, judgment, turnstile_token, fingerprint } = body || {};

  if (!record_id || !RECORD_ID_RE.test(record_id))
    return res.status(400).json({ error: "invalid_record_id" });
  if (!VALID_JUDGMENTS.has(judgment))
    return res.status(400).json({ error: "invalid_judgment" });

  const ok = await verifyTurnstile(
    turnstile_token,
    req.headers["x-forwarded-for"] || req.headers["x-real-ip"]
  );
  if (!ok) return res.status(403).json({ error: "turnstile_failed" });

  const fp = hashFingerprint(fingerprint);
  if (!fp) return res.status(400).json({ error: "missing_fingerprint" });

  const dedupKey = `vote:${record_id}:fp:${fp}`;
  const setResult = await redis.set(dedupKey, judgment, { ex: 60 * 60 * 24 * 365, nx: true });
  if (setResult !== "OK") {
    const counts = await redis.hgetall(`vote:${record_id}:counts`);
    return res.status(200).json({ ok: true, deduped: true, counts: normalizeCounts(counts) });
  }

  await redis.hincrby(`vote:${record_id}:counts`, judgment, 1);
  await redis.hincrby(`vote:${record_id}:counts`, "total", 1);

  const counts = await redis.hgetall(`vote:${record_id}:counts`);
  return res.status(200).json({ ok: true, counts: normalizeCounts(counts) });
}
