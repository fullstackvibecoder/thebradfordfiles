import { listReceipts } from "@/lib/receipt-loader";

export type ReceiptToolInput = { query: string; topic_hint?: string };
export type ReceiptToolResult =
  | { status: "matched"; slug: string; topic_short: string; pull_quote: string; anchor?: string }
  | { status: "no_match" };

export interface RedisLogger {
  lpush(key: string, value: string): Promise<unknown>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "to", "for", "in", "on", "at", "by", "with",
  "and", "or", "but", "is", "are", "was", "were", "be", "been", "being",
  "what", "would", "this", "that", "do", "does", "did", "how", "why",
  "i", "you", "we", "they", "it", "us", "them", "if", "when", "where",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function score(query: string, haystack: string): number {
  const q = new Set(tokenize(query));
  const h = tokenize(haystack);
  if (q.size === 0 || h.length === 0) return 0;
  let hits = 0;
  for (const t of h) if (q.has(t)) hits += 1;
  return hits / q.size;
}

const MATCH_THRESHOLD = 0.25;
const ANCHOR_THRESHOLD = 0.4;

export async function getClaimAudit(
  input: ReceiptToolInput,
  logger: RedisLogger | null,
  agentReasoning: string
): Promise<ReceiptToolResult> {
  const cards = listReceipts();
  if (cards.length === 0) return { status: "no_match" };

  if (input.topic_hint) {
    const exact = cards.find((c) => c.slug === input.topic_hint);
    if (exact) {
      let bestAnchor: string | undefined;
      let bestAnchorScore = 0;
      for (const a of exact.receipt.anchors) {
        const s = score(input.query, a.sub_claim + " " + a.finding);
        if (s > bestAnchorScore && s >= ANCHOR_THRESHOLD) {
          bestAnchor = a.sub_section_anchor;
          bestAnchorScore = s;
        }
      }
      return { status: "matched", slug: exact.slug, topic_short: exact.topic_short, pull_quote: exact.pull_quote, anchor: bestAnchor };
    }
  }

  let best: { card: typeof cards[number]; score: number } | null = null;
  for (const card of cards) {
    const haystack = card.topic + " " + card.topic_short + " " + card.pull_quote;
    const s = score(input.query, haystack);
    if (!best || s > best.score) best = { card, score: s };
  }

  if (best && best.score >= MATCH_THRESHOLD) {
    let bestAnchor: string | undefined;
    let bestAnchorScore = 0;
    for (const a of best.card.receipt.anchors) {
      const s = score(input.query, a.sub_claim + " " + a.finding);
      if (s > bestAnchorScore && s >= ANCHOR_THRESHOLD) {
        bestAnchor = a.sub_section_anchor;
        bestAnchorScore = s;
      }
    }
    return {
      status: "matched",
      slug: best.card.slug,
      topic_short: best.card.topic_short,
      pull_quote: best.card.pull_quote,
      anchor: bestAnchor,
    };
  }

  if (logger) {
    const entry = JSON.stringify({
      query: input.query,
      timestamp: new Date().toISOString(),
      agent_reasoning: agentReasoning,
    });
    await logger.lpush("receipts:unmatched", entry);
    await logger.ltrim("receipts:unmatched", 0, 999);
  }

  return { status: "no_match" };
}
