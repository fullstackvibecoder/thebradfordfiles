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
