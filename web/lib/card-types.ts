import type { Stamp } from "./stamp-types";

export interface SingleAnswerCard {
  type: "single_answer";
  query_restated: string;
  answer: string;
  evidence: Stamp[];
  context?: { body: string; citations: string[] };
  follow_ups: string[];
}

export interface ComparisonCandidate {
  slug: string;
  display_name: string;
  consistency_dot: "green" | "yellow" | "red" | "gray";
  consistency_label: string;
  record_count: number;
  summary: string;
  key_positions: { stance: string; citations: string[] }[];
  council_votes: { vote: "YES" | "NO" | "ABSENT"; agenda_item: string; title: string }[];
  evidence: Stamp[];
}

export interface ComparisonCard {
  type: "comparison";
  query_restated: string;
  candidates: ComparisonCandidate[];
  topic: string;
  divergences: { headline: string; body: string }[];
  follow_ups: string[];
}

export interface RecordTrailCard {
  type: "record_trail";
  query_restated: string;
  theme: string;
  entries: { date: string; label: string; body: string; evidence: Stamp[] }[];
  follow_ups: string[];
}

export type AnyCard = SingleAnswerCard | ComparisonCard | RecordTrailCard;

// The emit_card tool schema only marks type/query_restated/follow_ups as
// required and leaves candidate/evidence shapes loose, so the model routinely
// emits valid-but-partial cards: a single_answer with no `evidence` array, or
// comparison candidates keyed `name` instead of `display_name`. Rejecting those
// dropped the answer to the fallback ("Could not produce a sourced answer") even
// though the content was good. Reject only on what a card genuinely needs to
// render; coerce the optional presentational fields to safe defaults. The card
// renderers already tolerate missing optional fields (`?? []`, `?? "..."`).
export function validateCard(payload: unknown): AnyCard | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = { ...(payload as Record<string, unknown>) };
  if (typeof p.type !== "string") return null;
  if (typeof p.query_restated !== "string") return null;
  if (!Array.isArray(p.follow_ups) || p.follow_ups.some(x => typeof x !== "string")) return null;

  if (p.type === "single_answer") {
    if (typeof p.answer !== "string") return null;
    p.evidence = Array.isArray(p.evidence) ? p.evidence : [];
    return p as unknown as SingleAnswerCard;
  }
  if (p.type === "comparison") {
    if (!Array.isArray(p.candidates) || p.candidates.length < 2) return null;
    const candidates: Record<string, unknown>[] = [];
    for (const cand of p.candidates) {
      if (typeof cand !== "object" || cand === null) return null;
      const c = { ...(cand as Record<string, unknown>) };
      // Accept the model's common "name" key as display_name.
      if (typeof c.display_name !== "string" && typeof c.name === "string") c.display_name = c.name;
      // display_name is essential (it labels the column); slug is optional and
      // gets resolved by name in enrichComparisonCard when the model omits it.
      if (typeof c.display_name !== "string") return null;
      if (typeof c.slug !== "string") c.slug = "";
      candidates.push(c);
    }
    p.candidates = candidates;
    p.topic = typeof p.topic === "string" ? p.topic : "";
    p.divergences = Array.isArray(p.divergences) ? p.divergences : [];
    return p as unknown as ComparisonCard;
  }
  if (p.type === "record_trail") {
    p.theme = typeof p.theme === "string" ? p.theme : "";
    p.entries = Array.isArray(p.entries) ? p.entries : [];
    return p as unknown as RecordTrailCard;
  }
  return null;
}

const EM_DASH = "—";

export function containsEmDash(card: AnyCard): boolean {
  const stringify = JSON.stringify(card);
  return stringify.includes(EM_DASH);
}

// The no-em-dash rule is a house style for the model's own prose, but a card
// embeds verbatim source evidence (synthesis summaries, quotes, vote titles)
// that legitimately contains em dashes. Rejecting the whole card on any em dash
// silently discarded almost every sourced answer. Normalize instead: replace an
// em dash (and any spaces hugging it) with a comma + space. The em dash only
// ever appears inside JSON string values, never as structural syntax, so
// operating on the serialized form and re-parsing is safe.
export function normalizeEmDash<T extends AnyCard>(card: T): T {
  const cleaned = JSON.stringify(card).replace(/ *— */g, ", ");
  return JSON.parse(cleaned) as T;
}
