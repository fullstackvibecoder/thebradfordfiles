import { redis, hashFingerprint } from "@/lib/api-helpers";
import { verifyTurnstile } from "@/lib/agent/turnstile";

const VALID = new Set(["kept", "broke", "too_early"]);
const RID = /^[A-Za-z0-9_-]{6,32}$/;

export const runtime = "nodejs";

function norm(c: Record<string, string> | null) {
  const r = c ?? {};
  return { kept: parseInt(r.kept ?? "0", 10), broke: parseInt(r.broke ?? "0", 10), too_early: parseInt(r.too_early ?? "0", 10), total: parseInt(r.total ?? "0", 10) };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { record_id, judgment, turnstile_token, fingerprint } = body as Record<string, string>;
  if (!record_id || !RID.test(record_id)) return Response.json({ error: "invalid_record_id" }, { status: 400 });
  if (!VALID.has(judgment)) return Response.json({ error: "invalid_judgment" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  if (!await verifyTurnstile(turnstile_token ?? null, ip)) return Response.json({ error: "turnstile_failed" }, { status: 403 });
  const fp = hashFingerprint(fingerprint);
  if (!fp) return Response.json({ error: "missing_fingerprint" }, { status: 400 });

  const dedupKey = `vote:${record_id}:fp:${fp}`;
  const set = await redis.set(dedupKey, judgment, { ex: 60 * 60 * 24 * 365, nx: true });
  if (set !== "OK") {
    const counts = await redis.hgetall(`vote:${record_id}:counts`) as Record<string, string> | null;
    return Response.json({ ok: true, deduped: true, counts: norm(counts) });
  }
  await redis.hincrby(`vote:${record_id}:counts`, judgment, 1);
  await redis.hincrby(`vote:${record_id}:counts`, "total", 1);
  const counts = await redis.hgetall(`vote:${record_id}:counts`) as Record<string, string> | null;
  return Response.json({ ok: true, counts: norm(counts) });
}
