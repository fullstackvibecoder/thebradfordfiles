export interface EvidenceRef {
  shortcode: string;
  quote: string;   // verbatim source_quote
  date: string;    // record post_date (ISO) or ""
  source: string;  // e.g. "Council 2024.GG12.7" or source account
}

export interface ContradictionEntry {
  kind: "contradiction";
  slug: string;
  display_name: string;
  topic: string;
  topic_label: string;
  earlier: EvidenceRef;
  later: EvidenceRef;
  consistency: "evolving" | "shifted";
  score: number;
}

export type Vote = "YES" | "NO" | "ABSENT";

export interface DivergenceSide extends EvidenceRef {
  slug: string;
  display_name: string;
  vote?: Vote;
}

export interface DivergenceEntry {
  kind: "divergence";
  topic: string;
  topic_label: string;
  a: DivergenceSide;
  b: DivergenceSide;
  score: number;
}

export type FeaturedEntry = ContradictionEntry | DivergenceEntry;

export const TOPICS = [
  "housing", "transit", "safety_crime", "taxes_fiscal", "parks_environment",
  "infrastructure", "civic_engagement", "governance_ethics", "small_business_economy", "social_services",
] as const;

export const TOPIC_LABELS: Record<string, string> = {
  housing: "housing",
  transit: "transit",
  safety_crime: "public safety",
  taxes_fiscal: "taxes",
  parks_environment: "parks & environment",
  infrastructure: "infrastructure",
  civic_engagement: "civic engagement",
  governance_ethics: "governance & ethics",
  small_business_economy: "small business",
  social_services: "social services",
};
