import type { RecordEntry } from "@/lib/agent/data-loader";

export interface RelatedVote {
  agenda_item?: string;
  agenda_item_title?: string;
  vote_disposition?: string;
  result?: string;
  vote_date?: string;
  vote_description?: string;
  confidence?: number;
}

export interface SaidVsDoneItem {
  shortcode: string;
  summary: string;
  post_date?: string;
  post_url?: string;
  kind: string;
  votes: RelatedVote[];
}

export interface SaidVsDoneTopic {
  items: SaidVsDoneItem[];
}

const POSITION_KINDS = new Set(["position", "pledge"]);

function maxConfidence(votes: RelatedVote[]): number {
  return votes.reduce((m, v) => Math.max(m, v.confidence ?? 0), 0);
}

export function buildSaidVsDone(records: RecordEntry[], topic: string): SaidVsDoneTopic {
  const qualifying = records.filter(
    (r) =>
      POSITION_KINDS.has(r.kind) &&
      r.topic === topic &&
      (r.summary ?? "").trim() !== "" &&
      Array.isArray(r.related_votes) &&
      r.related_votes.length > 0,
  );
  qualifying.sort((a, b) => {
    const va = a.related_votes ?? [], vb = b.related_votes ?? [];
    return (maxConfidence(vb) - maxConfidence(va)) || (vb.length - va.length);
  });
  const items: SaidVsDoneItem[] = qualifying.map((r) => ({
    shortcode: r.shortcode,
    summary: r.summary ?? "",
    post_date: r.post_date,
    post_url: r.post_url,
    kind: r.kind,
    votes: [...(r.related_votes ?? [])].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
  }));
  return { items };
}

export function councilAgendaUrl(agendaItem: string | undefined): string {
  if (!agendaItem) return "";
  return `https://secure.toronto.ca/council/agenda-item.do?item=${agendaItem}`;
}
