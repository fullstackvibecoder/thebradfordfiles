import {
  listCandidates,
  getRecordsForHandle,
  getSynthesis,
  type CandidateLanding,
  type RecordEntry,
  type SynthesisCell,
} from "./data-loader";

export interface ListCandidatesResult {
  candidates: CandidateLanding[];
}

export function list_candidates(): ListCandidatesResult {
  return { candidates: listCandidates() };
}

export interface SearchRecordsArgs {
  slug?: string;
  topic?: string;
  query?: string;
  kind?: "position" | "pledge" | "action" | "endorsement" | "appearance" | "quote";
  limit?: number;
}

export interface SearchRecordsResult {
  records: RecordEntry[];
  total: number;
  truncated: boolean;
}

export function search_records(args: SearchRecordsArgs): SearchRecordsResult {
  const limit = args.limit ?? 25;
  const slugs = args.slug ? [args.slug] : listCandidates().map(c => c.slug);
  let matches: RecordEntry[] = [];
  for (const slug of slugs) {
    const records = getRecordsForHandle(slug);
    matches = matches.concat(records.filter(r => {
      if (args.topic && r.topic !== args.topic) return false;
      if (args.kind && r.kind !== args.kind) return false;
      if (args.query) {
        const haystack = `${r.summary ?? ""} ${r.source_quote ?? ""}`.toLowerCase();
        if (!haystack.includes(args.query.toLowerCase())) return false;
      }
      return true;
    }));
  }
  const total = matches.length;
  const truncated = total > limit;
  return { records: matches.slice(0, limit), total, truncated };
}

export interface LookupCouncilVoteArgs {
  agenda_item?: string;
  slug?: string;
}

export interface LookupCouncilVoteResult {
  matches: { shortcode: string; agenda_item?: string; vote_disposition?: string; result?: string; confidence?: number; topic?: string; post_date?: string; post_url?: string }[];
}

export function lookup_council_vote(args: LookupCouncilVoteArgs): LookupCouncilVoteResult {
  const slugs = args.slug ? [args.slug] : listCandidates().map(c => c.slug);
  const out: LookupCouncilVoteResult["matches"] = [];
  for (const slug of slugs) {
    const records = getRecordsForHandle(slug);
    for (const r of records) {
      const v = r.council_verification;
      if (!v) continue;
      if (args.agenda_item && v.agenda_item !== args.agenda_item) continue;
      out.push({
        shortcode: r.shortcode,
        agenda_item: v.agenda_item,
        vote_disposition: v.vote_disposition,
        result: v.result,
        confidence: v.confidence,
        topic: r.topic,
        post_date: r.post_date,
        post_url: r.post_url,
      });
    }
  }
  return { matches: out };
}

export interface GetSynthesisArgs {
  slug: string;
  topic: string;
}

export interface GetSynthesisResult {
  cell: SynthesisCell | null;
}

export function get_synthesis(args: GetSynthesisArgs): GetSynthesisResult {
  return { cell: getSynthesis(args.slug, args.topic) };
}

export interface GetRecordDetailArgs {
  shortcode: string;
}

export interface GetRecordDetailResult {
  record: RecordEntry | null;
}

export function get_record_detail(args: GetRecordDetailArgs): GetRecordDetailResult {
  for (const cand of listCandidates()) {
    const records = getRecordsForHandle(cand.slug);
    const found = records.find(r => r.shortcode === args.shortcode);
    if (found) return { record: found };
  }
  return { record: null };
}

export interface ListRecentQuestionsResult {
  questions: string[];
}

export function list_recent_questions(): ListRecentQuestionsResult {
  return { questions: [] };
}
