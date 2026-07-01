import { listCandidates, getSynthesis, getRecordsForHandle, type RecordEntry, type SynthesisCell, type CandidateLanding } from "@/lib/agent/data-loader";
import { TOPICS, TOPIC_LABELS, type EvidenceRef, type ContradictionEntry, type DivergenceEntry, type FeaturedEntry, type Vote } from "@/lib/featured-types";

export function resolveEvidence(records: RecordEntry[], shortcode: string): EvidenceRef | null {
  const r = records.find(x => x.shortcode === shortcode);
  if (!r || !r.source_quote) return null;
  const source = r.council_verification?.agenda_item
    ? `Council ${r.council_verification.agenda_item}`
    : (r.source_account ?? "IG");
  return { shortcode, quote: r.source_quote, date: r.post_date ?? "", source };
}

interface RawChange {
  date?: string;
  from?: { stance?: string; records?: string[] };
  to?: { stance?: string; records?: string[] };
}
function isChange(x: unknown): x is RawChange {
  return typeof x === "object" && x !== null;
}

function firstResolvable(records: RecordEntry[], shortcodes: string[] | undefined): EvidenceRef | null {
  for (const sc of shortcodes ?? []) {
    const ev = resolveEvidence(records, sc);
    if (ev) return ev;
  }
  return null;
}

function toVote(d: string | undefined): Vote | undefined {
  return d === "YES" || d === "NO" || d === "ABSENT" ? d : undefined;
}

export function deriveDivergences(
  cells: SynthesisCell[],
  recordsBySlug: Map<string, RecordEntry[]>,
  candidates: CandidateLanding[],
): DivergenceEntry[] {
  const nameBySlug = new Map(candidates.map(c => [c.slug, c.display_name]));
  const byTopic = new Map<string, SynthesisCell[]>();
  for (const cell of cells) {
    if (!cell.key_positions?.length) continue;
    const list = byTopic.get(cell.topic) ?? [];
    list.push(cell);
    byTopic.set(cell.topic, list);
  }
  const out: DivergenceEntry[] = [];
  for (const [topic, group] of byTopic) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => (b.input_record_count ?? 0) - (a.input_record_count ?? 0));
    const sides: { side: DivergenceEntry["a"]; count: number; agendaItem?: string }[] = [];
    for (const cell of ranked) {
      const records = recordsBySlug.get(cell.candidate_slug) ?? [];
      let ev: EvidenceRef | null = null;
      for (const kp of cell.key_positions ?? []) {
        ev = firstResolvable(records, kp.supporting_records);
        if (ev) break;
      }
      if (!ev) continue;
      const rec = records.find(r => r.shortcode === ev!.shortcode);
      sides.push({
        side: {
          slug: cell.candidate_slug,
          display_name: nameBySlug.get(cell.candidate_slug) ?? cell.candidate_slug,
          ...ev,
          vote: toVote(rec?.council_verification?.vote_disposition),
        },
        count: cell.input_record_count ?? 0,
        agendaItem: rec?.council_verification?.agenda_item,
      });
      if (sides.length === 2) break;
    }
    if (sides.length < 2) continue;
    const [sideA, sideB] = sides;
    const a = sideA.side;
    const b = sideB.side;
    const sameAgendaItem = !!sideA.agendaItem && !!sideB.agendaItem && sideA.agendaItem === sideB.agendaItem;
    const opposing = sameAgendaItem && !!a.vote && !!b.vote && a.vote !== b.vote && a.vote !== "ABSENT" && b.vote !== "ABSENT";
    const score = 100 + (opposing ? 500 : 0) + (sideA.count + sideB.count);
    out.push({ kind: "divergence", topic, topic_label: TOPIC_LABELS[topic] ?? topic, a, b, score });
  }
  return out;
}

export function deriveContradictions(
  cells: SynthesisCell[],
  recordsBySlug: Map<string, RecordEntry[]>,
  candidates: CandidateLanding[],
): ContradictionEntry[] {
  const nameBySlug = new Map(candidates.map(c => [c.slug, c.display_name]));
  const out: ContradictionEntry[] = [];
  for (const cell of cells) {
    const label = cell.consistency?.label;
    if (label !== "evolving" && label !== "shifted") continue;
    const records = recordsBySlug.get(cell.candidate_slug) ?? [];
    const changes = Array.isArray(cell.consistency?.changes) ? cell.consistency.changes : [];
    for (const ch of changes) {
      if (!isChange(ch)) continue;
      const earlier = firstResolvable(records, ch.from?.records);
      const later = firstResolvable(records, ch.to?.records);
      if (!earlier || !later) continue;
      out.push({
        kind: "contradiction",
        slug: cell.candidate_slug,
        display_name: nameBySlug.get(cell.candidate_slug) ?? cell.candidate_slug,
        topic: cell.topic,
        topic_label: TOPIC_LABELS[cell.topic] ?? cell.topic,
        earlier,
        later,
        consistency: label,
        score: 300,
      });
      break; // at most one contradiction per cell
    }
  }
  return out;
}

export function getFeaturedComparisons(limit = 6): FeaturedEntry[] {
  const candidates = listCandidates();
  const cells: SynthesisCell[] = [];
  const recordsBySlug = new Map<string, RecordEntry[]>();
  for (const c of candidates) {
    recordsBySlug.set(c.slug, getRecordsForHandle(c.slug));
    for (const topic of TOPICS) {
      const cell = getSynthesis(c.slug, topic);
      if (cell) cells.push(cell);
    }
  }
  const entries: FeaturedEntry[] = [
    ...deriveContradictions(cells, recordsBySlug, candidates),
    ...deriveDivergences(cells, recordsBySlug, candidates),
  ];
  return entries.sort((a, b) => b.score - a.score).slice(0, limit);
}
