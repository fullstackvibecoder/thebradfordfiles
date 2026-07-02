import { listCandidates, getRecordsForHandle } from "@/lib/agent/data-loader";
import { TOPICS } from "@/lib/featured-types";

export interface SectionCount {
  topic: string;
  label: string;
  count: number;
  query: string;
}

export interface CandidateSummary {
  slug: string;
  display_name: string;
  record_count: number;
}

const SECTION_LABELS: Record<string, string> = {
  housing: "Housing",
  transit: "Transit",
  safety_crime: "Public safety",
  taxes_fiscal: "Tax & fiscal",
  parks_environment: "Parks & environment",
  infrastructure: "Infrastructure",
  civic_engagement: "Civic engagement",
  governance_ethics: "Governance & ethics",
  small_business_economy: "Small business",
  social_services: "Social services",
};

const SECTION_QUERIES: Record<string, string> = {
  housing: "What are the candidates' positions and votes on housing?",
  transit: "What are the candidates' positions and votes on transit?",
  safety_crime: "What are the candidates' positions on public safety?",
  taxes_fiscal: "What are the candidates' positions and votes on taxes and fiscal policy?",
  parks_environment: "What are the candidates' positions on parks and environment?",
  infrastructure: "What are the candidates' positions on infrastructure?",
  civic_engagement: "What are the candidates' positions on civic engagement?",
  governance_ethics: "What are the candidates' positions on governance and ethics?",
  small_business_economy: "What are the candidates' positions on small business and the economy?",
  social_services: "What are the candidates' positions on social services?",
};

export function getSectionCounts(): SectionCount[] {
  const recordsBySlug = listCandidates().map(c => getRecordsForHandle(c.slug));
  const out: SectionCount[] = [];
  for (const topic of TOPICS) {
    let count = 0;
    for (const recs of recordsBySlug) {
      for (const r of recs) if (r.topic === topic) count++;
    }
    if (count === 0) continue;
    out.push({ topic, label: SECTION_LABELS[topic] ?? topic, count, query: SECTION_QUERIES[topic] ?? "" });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, 6);
}

export function getCandidateSummaries(): CandidateSummary[] {
  return listCandidates()
    .map(c => ({
      slug: c.slug,
      display_name: c.display_name,
      record_count: c.record_count ?? getRecordsForHandle(c.slug).length,
    }))
    .sort((a, b) => b.record_count - a.record_count);
}
