import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const expected = process.env.ADMIN_SHARED_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  return auth.slice(7) === expected;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    return NextResponse.json({ error: "redis_not_configured" }, { status: 503 });
  }
  const redis = new Redis({ url, token });
  const raw = await redis.lrange("scenarios:unmatched", 0, 99);

  type Entry = { query: string; timestamp: string; agent_reasoning: string };
  const entries: Entry[] = (raw as string[])
    .map((s): Entry | null => {
      try { return JSON.parse(s) as Entry; } catch { return null; }
    })
    .filter((e): e is Entry => e !== null);

  const groups = new Map<string, { query: string; count: number; latest: string; reasonings: string[] }>();
  for (const e of entries) {
    const key = e.query.toLowerCase().replace(/\s+/g, " ").trim();
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (e.timestamp > existing.latest) existing.latest = e.timestamp;
      existing.reasonings.push(e.agent_reasoning);
    } else {
      groups.set(key, { query: e.query, count: 1, latest: e.timestamp, reasonings: [e.agent_reasoning] });
    }
  }
  const items = [...groups.values()].sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));

  return NextResponse.json({ items, total_logged: entries.length });
}
