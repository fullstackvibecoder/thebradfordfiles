import { NextResponse } from "next/server";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const expected = process.env.ADMIN_SHARED_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  return auth.slice(7) === expected;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null) as { slug?: string; topic_short?: string; topic?: string; query?: string } | null;
  if (!body?.slug || !/^[a-z0-9-]+$/.test(body.slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }
  if (!body.topic || !body.topic_short) {
    return NextResponse.json({ error: "topic_required" }, { status: 400 });
  }

  const dir = join(process.cwd(), "public", "data", "scenarios");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, body.slug + ".json");
  if (existsSync(path)) {
    return NextResponse.json({ error: "slug_exists", path }, { status: 409 });
  }

  const skeleton = {
    slug: body.slug,
    topic: body.topic,
    topic_short: body.topic_short,
    pull_quote: "Skeleton for \"" + body.topic_short + "\". Replace with 1 to 3 sentences of evidentiary pull quote before publishing.",
    who_benefits: { intro: "Replace with 1 to 2 sentences framing the incidence question.", mechanisms: [], literature_row: [] },
    positions: [],
    status_quo: { summary: "Replace with current Toronto state.", existing_policy_stack: [], citations: [] },
    comparables: [],
    projections: { kind: "thin", rationale: "Literature does not support a confident singular projection on this question. The comparable-jurisdiction outcomes above are the closest defensible numerical anchors." },
    meta: { last_reviewed: new Date().toISOString().slice(0, 10), next_review: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10) },
    _skeleton: { source_query: body.query ?? null, generated: new Date().toISOString() },
  };

  writeFileSync(path, JSON.stringify(skeleton, null, 2));
  return NextResponse.json({ ok: true, path: "/public/data/scenarios/" + body.slug + ".json" });
}
