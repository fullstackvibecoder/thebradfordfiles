import { redis } from "@/lib/api-helpers";

const RID = /^[A-Za-z0-9_-]{6,32}$/;

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const record_id = url.searchParams.get("record_id");
  if (!record_id || !RID.test(record_id)) return Response.json({ error: "invalid_record_id" }, { status: 400 });
  const counts = (await redis.hgetall(`vote:${record_id}:counts`)) as Record<string, string> | null;
  const r = counts ?? {};
  return Response.json({
    record_id,
    counts: { kept: parseInt(r.kept ?? "0", 10), broke: parseInt(r.broke ?? "0", 10), too_early: parseInt(r.too_early ?? "0", 10), total: parseInt(r.total ?? "0", 10) },
  }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
