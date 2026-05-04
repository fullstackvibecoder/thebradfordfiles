import { redis, hashFingerprint } from "@/lib/api-helpers";
import { verifyTurnstile } from "@/lib/agent/turnstile";

const VALID_TOPICS = new Set([
  "housing", "transit", "safety_crime", "taxes_fiscal", "parks_environment",
  "infrastructure", "civic_engagement", "governance_ethics", "small_business_economy", "social_services",
]);

export const runtime = "nodejs";

async function readIssueCounts() {
  const raw = (await redis.hgetall("issue:counts") as Record<string, string> | null) ?? {};
  const total = parseInt(((await redis.get("issue:total_voters")) as string | null) ?? "0", 10);
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) counts[k] = parseInt(v, 10);
  return { counts, total_voters: total };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { topics, turnstile_token, fingerprint } = body as { topics?: unknown; turnstile_token?: string; fingerprint?: string };
  if (!Array.isArray(topics) || topics.length === 0 || topics.length > 10) return Response.json({ error: "invalid_topics" }, { status: 400 });
  for (const t of topics) if (!VALID_TOPICS.has(t as string)) return Response.json({ error: "unknown_topic", topic: t }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  if (!await verifyTurnstile(turnstile_token ?? null, ip)) return Response.json({ error: "turnstile_failed" }, { status: 403 });
  const fp = hashFingerprint(fingerprint ?? null);
  if (!fp) return Response.json({ error: "missing_fingerprint" }, { status: 400 });

  const set = await redis.set(`issue:fp:${fp}`, JSON.stringify(topics), { ex: 60 * 60 * 24 * 365, nx: true });
  if (set !== "OK") return Response.json({ ok: true, deduped: true, ...await readIssueCounts() });
  for (const t of topics as string[]) await redis.hincrby("issue:counts", t, 1);
  await redis.incr("issue:total_voters");
  return Response.json({ ok: true, ...await readIssueCounts() });
}
