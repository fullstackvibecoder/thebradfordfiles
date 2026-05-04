import { redis } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function GET() {
  const raw = (await redis.hgetall("issue:counts") as Record<string, string> | null) ?? {};
  const total = parseInt(((await redis.get("issue:total_voters")) as string | null) ?? "0", 10);
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) counts[k] = parseInt(v, 10);
  return Response.json({ counts, total_voters: total }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
