import { listCandidates, getSynthesis, getRecordsForHandle, type SynthesisCell } from "@/lib/agent/data-loader";

export interface SurfacedStanceEvolved {
  type: "stance_evolved";
  candidate_name: string;
  candidate_slug: string;
  topic: string;
  body: string;
  ig_count?: number;
  council_count?: number;
}

export interface SurfacedVerifiedVote {
  type: "verified_vote";
  candidate_name: string;
  candidate_slug: string;
  agenda_item: string;
  body: string;
  vote_disposition: string;
  result: string;
  post_date?: string;
}

export interface SurfacedSynthesis {
  type: "synthesis";
  candidate_name: string;
  candidate_slug: string;
  topic: string;
  body: string;
  record_count: number;
}

export type SurfacedCard = SurfacedStanceEvolved | SurfacedVerifiedVote | SurfacedSynthesis;

export function pickSurfacedCards(): SurfacedCard[] {
  const cards: SurfacedCard[] = [];
  const cands = listCandidates();
  const TOPICS = ["housing", "transit", "safety_crime", "taxes_fiscal", "parks_environment", "infrastructure", "civic_engagement", "governance_ethics", "small_business_economy", "social_services"];

  for (const cand of cands) {
    for (const topic of TOPICS) {
      const cell = getSynthesis(cand.slug, topic);
      if (!cell) continue;
      const label = cell.consistency?.label;
      if ((label === "evolving" || label === "shifted") && cell.summary && cards.find(c => c.type === "stance_evolved") === undefined) {
        cards.push({
          type: "stance_evolved",
          candidate_name: cand.display_name,
          candidate_slug: cand.slug,
          topic,
          body: cell.summary.split(". ").slice(0, 2).join(". ") + ".",
        });
        break;
      }
    }
    if (cards.length >= 1) break;
  }

  for (const cand of cands) {
    if (cards.find(c => c.type === "verified_vote")) break;
    const records = getRecordsForHandle(cand.slug);
    const verified = records.find(r => r.council_verification && (r.council_verification.confidence ?? 0) >= 0.95 && r.council_verification.agenda_item);
    if (!verified || !verified.council_verification) continue;
    cards.push({
      type: "verified_vote",
      candidate_name: cand.display_name,
      candidate_slug: cand.slug,
      agenda_item: verified.council_verification.agenda_item ?? "",
      body: (verified.summary ?? "").slice(0, 160),
      vote_disposition: verified.council_verification.vote_disposition ?? "",
      result: verified.council_verification.result ?? "",
      post_date: verified.post_date,
    });
  }

  for (const cand of cands) {
    if (cards.find(c => c.type === "synthesis")) break;
    for (const topic of TOPICS) {
      const cell = getSynthesis(cand.slug, topic);
      if (!cell?.summary) continue;
      cards.push({
        type: "synthesis",
        candidate_name: cand.display_name,
        candidate_slug: cand.slug,
        topic,
        body: cell.summary.slice(0, 180),
        record_count: cell.input_record_count ?? 0,
      });
      break;
    }
  }

  return cards.slice(0, 3);
}
