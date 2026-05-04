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

export function validateCard(payload: unknown): AnyCard | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.type !== "string") return null;
  if (typeof p.query_restated !== "string") return null;
  if (!Array.isArray(p.follow_ups) || p.follow_ups.some(x => typeof x !== "string")) return null;

  if (p.type === "single_answer") {
    if (typeof p.answer !== "string") return null;
    if (!Array.isArray(p.evidence)) return null;
    return p as unknown as SingleAnswerCard;
  }
  if (p.type === "comparison") {
    if (!Array.isArray(p.candidates) || p.candidates.length < 2) return null;
    if (typeof p.topic !== "string") return null;
    if (!Array.isArray(p.divergences)) return null;
    return p as unknown as ComparisonCard;
  }
  if (p.type === "record_trail") {
    if (typeof p.theme !== "string") return null;
    if (!Array.isArray(p.entries)) return null;
    return p as unknown as RecordTrailCard;
  }
  return null;
}

const EM_DASH = "—";

export function containsEmDash(card: AnyCard): boolean {
  const stringify = JSON.stringify(card);
  return stringify.includes(EM_DASH);
}
