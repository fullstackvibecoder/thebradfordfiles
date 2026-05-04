import type { ScenarioCard } from "@/lib/scenario-types";

export function validScenario(overrides: Partial<ScenarioCard> = {}): ScenarioCard {
  return {
    slug: "test-scenario",
    topic: "Test topic statement that runs more than a handful of words.",
    topic_short: "Test topic",
    pull_quote: "Research finds that the test mechanism reaches different populations on different timeframes. Both candidates analyzed under the same framework.",
    who_benefits: {
      intro: "Research on the incidence of the test mechanism shows two patterns.",
      mechanisms: [
        { candidate_handle: "bradfordgrams", summary: "Pattern A. Two sentences with caveats." },
        { candidate_handle: "oliviachow", summary: "Pattern B. Two sentences with caveats." },
      ],
      literature_row: [
        { tier: "T2", label: "Wellesley Inst. 2024" },
        { tier: "T3", label: "JCH 2019" },
      ],
    },
    positions: [
      {
        candidate_handle: "bradfordgrams",
        candidate_name: "Brad Bradford",
        summary: "Position A in one to two sentences.",
        citations: [{ tier: "T1", label: "Bradford 2026 platform" }],
      },
      {
        candidate_handle: "oliviachow",
        candidate_name: "Olivia Chow",
        summary: "Position B in one to two sentences.",
        citations: [{ tier: "T1", label: "Chow 2026 platform" }],
      },
    ],
    status_quo: {
      summary: "Toronto currently does X with cited numbers.",
      existing_policy_stack: [
        { label: "Existing program A", citations: [{ tier: "T1", label: "City budget 2024" }] },
        { label: "Existing program B", citations: [{ tier: "T1", label: "Provincial doc 2023" }] },
      ],
      citations: [{ tier: "T1", label: "CMHC 2024" }],
    },
    comparables: [
      {
        name: "Vienna",
        period: "1990s to present",
        summary: "City did X over period Y.",
        outcome: "Outcome Z with numerical citation.",
        citations: [{ tier: "T2", label: "OECD 2023" }],
        caveats: "Different legal regime around land ownership.",
      },
      {
        name: "Singapore",
        period: "1960s to present",
        summary: "City did A over period B.",
        outcome: "Outcome C with numerical citation.",
        citations: [{ tier: "T3", label: "Phang 2018" }],
        caveats: "Different state capacity.",
      },
      {
        name: "Auckland",
        period: "2016 to 2023",
        summary: "City did D over period E.",
        outcome: "Outcome F with numerical citation.",
        citations: [{ tier: "T3", label: "Greenaway-McGrevy 2023" }],
        caveats: "Smaller scale than Toronto.",
      },
    ],
    projections: { kind: "thin", rationale: "Literature does not support a confident singular projection on this question. The comparable-jurisdiction outcomes above are the closest defensible numerical anchors." },
    meta: {
      last_reviewed: "2026-05-04",
      next_review: "2026-05-18",
    },
    ...overrides,
  };
}
