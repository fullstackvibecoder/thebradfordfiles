import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolUseBlock, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { TOOL_SCHEMAS, AGENT_MODEL } from "@/lib/agent/tool-schemas";
import { verifyTurnstile } from "@/lib/agent/turnstile";
import * as tools from "@/lib/agent/tools";
import { listCandidates } from "@/lib/agent/data-loader";
import { validateCard, containsEmDash, type AnyCard } from "@/lib/card-types";

function enrichComparisonCard(card: AnyCard): AnyCard {
  if (card.type !== "comparison") return card;
  const candidatesIndex = new Map(listCandidates().map(c => [c.slug, c]));
  return {
    ...card,
    candidates: card.candidates.map(c => {
      const ref = candidatesIndex.get(c.slug);
      if (!ref) return c;
      return {
        ...c,
        record_count: c.record_count ?? ref.record_count ?? 0,
        consistency_label: c.consistency_label ?? ref.consistency_dot ?? "Records noted",
        consistency_dot: c.consistency_dot ?? (ref.consistency_dot as "green" | "yellow" | "red" | "gray" | undefined) ?? "gray",
      };
    }),
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOOL_LOOPS = 8;
const FALLBACK_CARD: AnyCard = {
  type: "single_answer",
  query_restated: "",
  answer: "Could not produce a sourced answer for this question.",
  evidence: [],
  follow_ups: ["Try rephrasing the question.", "Compare candidates on a topic."],
};

interface AskRequestBody {
  query?: string;
  turnstile_token?: string | null;
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function callTool(name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case "list_candidates": return tools.list_candidates();
    case "search_records": return tools.search_records(input);
    case "lookup_council_vote": return tools.lookup_council_vote(input);
    case "get_synthesis": return tools.get_synthesis(input as { slug: string; topic: string });
    case "get_record_detail": return tools.get_record_detail(input as { shortcode: string });
    case "get_scenario_card": return tools.get_scenario_card(input as { query?: string; topic_hint?: string });
    default: throw new Error(`unknown tool ${name}`);
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AskRequestBody;
  const query = (body.query ?? "").trim();
  if (!query || query.length > 500) {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  const ok = await verifyTurnstile(body.turnstile_token ?? null, ip);
  if (!ok) {
    return Response.json({ error: "turnstile_failed" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "server_misconfigured" }, { status: 500 });
  const client = new Anthropic({ apiKey });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(new TextEncoder().encode(sse(event, data)));
      const messages: MessageParam[] = [{ role: "user", content: query }];

      let finalCard: AnyCard | null = null;

      for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
        const response = await client.messages.create({
          model: AGENT_MODEL,
          max_tokens: 2048,
          system: AGENT_SYSTEM_PROMPT,
          tools: TOOL_SCHEMAS,
          messages,
        });

        const toolUses = response.content.filter(b => b.type === "tool_use") as ToolUseBlock[];
        if (toolUses.length === 0) break;

        const toolResultsContent: ToolResultBlockParam[] = [];
        for (const use of toolUses) {
          if (use.name === "emit_card") {
            const card = validateCard(use.input);
            if (card && !containsEmDash(card)) {
              finalCard = enrichComparisonCard(card);
            } else {
              finalCard = { ...FALLBACK_CARD, query_restated: query };
            }
            toolResultsContent.push({ type: "tool_result", tool_use_id: use.id, content: "ok" });
          } else {
            send("tool_call", { tool: use.name, args: use.input, status: "running" });
            try {
              const result = await Promise.resolve(callTool(use.name, use.input as Record<string, unknown>));
              send("tool_call", { tool: use.name, args: use.input, status: "complete", result_summary: summarizeResult(use.name, result) });
              toolResultsContent.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result) });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              send("tool_call", { tool: use.name, args: use.input, status: "error", message });
              toolResultsContent.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify({ error: message }), is_error: true });
            }
          }
        }

        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResultsContent });

        if (finalCard) break;
        if (response.stop_reason === "end_turn") break;
      }

      send("card", { payload: finalCard ?? { ...FALLBACK_CARD, query_restated: query } });
      send("done", {});
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}

function summarizeResult(toolName: string, result: unknown): string {
  if (toolName === "search_records") {
    const r = result as { records: unknown[]; total: number };
    return `${r.total} hits${r.total !== r.records.length ? `, showing ${r.records.length}` : ""}`;
  }
  if (toolName === "lookup_council_vote") {
    const r = result as { matches: unknown[] };
    return `${r.matches.length} match${r.matches.length === 1 ? "" : "es"}`;
  }
  if (toolName === "list_candidates") {
    const r = result as { candidates: unknown[] };
    return `${r.candidates.length} candidates`;
  }
  if (toolName === "get_synthesis") {
    const r = result as { cell: { summary?: string | null } | null };
    return r.cell?.summary ? "synthesis loaded" : "no cell";
  }
  if (toolName === "get_record_detail") {
    const r = result as { record: unknown };
    return r.record ? "record loaded" : "not found";
  }
  if (toolName === "get_scenario_card") {
    const r = result as { status: string; slug?: string };
    return r.status === "matched" ? `matched ${r.slug}` : "no_match";
  }
  return "ok";
}
