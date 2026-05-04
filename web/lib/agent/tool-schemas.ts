import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const TOOL_SCHEMAS: Tool[] = [
  {
    name: "list_candidates",
    description: "List all primary candidates with their landing-card metadata. Use this to discover which candidates are documented before searching their records.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_records",
    description: "Search records (positions, pledges, actions, endorsements, appearances, quotes) across one or all candidates. Filter by topic, kind, or free-text query against summary and source quote.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Candidate slug, e.g., 'bradford'. Omit for all candidates." },
        topic: { type: "string", enum: ["housing", "transit", "safety_crime", "taxes_fiscal", "parks_environment", "infrastructure", "civic_engagement", "governance_ethics", "small_business_economy", "social_services"] },
        query: { type: "string", description: "Free text matched against the record's summary and source quote." },
        kind: { type: "string", enum: ["position", "pledge", "action", "endorsement", "appearance", "quote"] },
        limit: { type: "number", description: "Max results to return. Default 25." },
      },
    },
  },
  {
    name: "lookup_council_vote",
    description: "Look up a candidate's verified council vote by agenda item number, or list all verified votes for a candidate. Returns the vote disposition (YES/NO/ABSENT), result, and the Instagram record that referenced it.",
    input_schema: {
      type: "object",
      properties: {
        agenda_item: { type: "string", description: "Toronto agenda item, e.g., '2024.GG12.7'." },
        slug: { type: "string", description: "Candidate slug. Omit for all." },
      },
    },
  },
  {
    name: "get_synthesis",
    description: "Get the synthesis cell for a (candidate, topic). Synthesis cells contain a 80 to 150 word summary, a consistency label (consistent/evolving/shifted), key positions, and key actions, all with cited shortcodes. Use this when the reader asks about a candidate's overall stance on a topic.",
    input_schema: {
      type: "object",
      required: ["slug", "topic"],
      properties: {
        slug: { type: "string" },
        topic: { type: "string", enum: ["housing", "transit", "safety_crime", "taxes_fiscal", "parks_environment", "infrastructure", "civic_engagement", "governance_ethics", "small_business_economy", "social_services"] },
      },
    },
  },
  {
    name: "get_record_detail",
    description: "Get full detail for one record by its shortcode. Use this to verify or expand a specific cited record.",
    input_schema: {
      type: "object",
      required: ["shortcode"],
      properties: { shortcode: { type: "string" } },
    },
  },
  {
    name: "emit_card",
    description: "Emit the final structured card payload as the answer. This is the terminal tool call.",
    input_schema: {
      type: "object",
      required: ["type", "query_restated", "follow_ups"],
      properties: {
        type: { type: "string", enum: ["single_answer", "comparison", "record_trail"] },
        query_restated: { type: "string" },
        answer: { type: "string", description: "Required for single_answer." },
        evidence: { type: "array", items: { type: "object" } },
        context: { type: "object", properties: { body: { type: "string" }, citations: { type: "array", items: { type: "string" } } } },
        candidates: { type: "array", description: "Required for comparison.", items: { type: "object" } },
        topic: { type: "string", description: "Required for comparison." },
        divergences: { type: "array", items: { type: "object", properties: { headline: { type: "string" }, body: { type: "string" } } } },
        theme: { type: "string", description: "Required for record_trail." },
        entries: { type: "array", description: "Required for record_trail.", items: { type: "object" } },
        follow_ups: { type: "array", items: { type: "string" } },
      },
    },
  },
];

export const AGENT_MODEL = "claude-sonnet-4-6";
