import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

let DATA_DIR = join(process.cwd(), "public", "data");

export function setDataDir(path: string): void {
  DATA_DIR = path;
}

export interface CandidateLanding {
  slug: string;
  display_name: string;
  surname: string;
  files_label?: string;
  consistency_dot?: string;
  record_count?: number;
  current_role?: string;
  candidacy_status?: string;
  emphasis?: Record<string, number>;
}

export function listCandidates(): CandidateLanding[] {
  const path = join(DATA_DIR, "landing.json");
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf-8"));
  return Array.isArray(data.candidates) ? data.candidates : [];
}

export interface SynthesisCell {
  candidate_handle: string;
  candidate_slug: string;
  topic: string;
  summary: string | null;
  consistency: { label: string; stable_since?: string | null; changes?: unknown[] } | null;
  key_positions?: { stance: string; supporting_records: string[] }[];
  key_actions?: { action: string; supporting_records: string[] }[];
  input_record_count?: number;
  synthesis_skipped_reason?: string | null;
}

const HANDLE_FOR_SLUG: Record<string, string> = {
  bradford: "bradfordgrams",
  chow: "oliviachow",
};

export function getSynthesis(slug: string, topic: string): SynthesisCell | null {
  const handle = HANDLE_FOR_SLUG[slug] ?? slug;
  const path = join(DATA_DIR, "synthesis", handle, `${topic}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export interface RecordEntry {
  shortcode: string;
  kind: string;
  topic?: string;
  summary?: string;
  source_quote?: string;
  post_date?: string;
  post_url?: string;
  source_account?: string;
  council_verification?: { agenda_item?: string; vote_disposition?: string; result?: string; confidence?: number };
  related_votes?: import("@/lib/said-vs-done").RelatedVote[];
}

export function getRecordsForHandle(slug: string): RecordEntry[] {
  const path = join(DATA_DIR, "candidates", `${slug}.json`);
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf-8"));
  return Array.isArray(data.records) ? data.records : [];
}

export function getDossier(slug: string): unknown {
  const path = join(DATA_DIR, "candidates", `${slug}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function listSynthesisHandles(): string[] {
  const synthDir = join(DATA_DIR, "synthesis");
  if (!existsSync(synthDir)) return [];
  return readdirSync(synthDir);
}
