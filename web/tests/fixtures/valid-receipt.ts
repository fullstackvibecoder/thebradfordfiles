import type { ReceiptCard } from "@/lib/receipt-types";

export function validReceipt(overrides: Partial<ReceiptCard> = {}): ReceiptCard {
  return {
    slug: "test-receipt",
    topic: "Test topic statement that runs more than a few words",
    topic_short: "Test topic",
    pull_quote: "Research finds the verbatim claim is partly true and partly misleading. The data shows different patterns across categories.",
    claims: [
      {
        headline: "This is the verbatim claim being audited.",
        attribution: "Test Candidate, Test Outlet, 2024-06-15",
        source: {
          attribution: "Test Outlet article",
          url: "https://example.com/article",
          retrieved: "2024-06-15",
        },
      },
    ],
    receipt: {
      intro: "Brief framing of what the data shows overall.",
      anchors: [
        {
          sub_section_anchor: "first-anchor",
          sub_claim: "First sub-claim",
          finding: "What the data actually shows for this sub-claim.",
          metric: "12,408 cases reported in 2024 vs 5,212 in 2018",
          source: { tier: "T1", label: "City data 2024" },
          caveats: "Single-year snapshot.",
          as_of: "2024-12-31",
        },
        {
          sub_section_anchor: "second-anchor",
          sub_claim: "Second sub-claim",
          finding: "Different angle on the same topic.",
          metric: "Median rate increased 4 percent over 5 years",
          source: { tier: "T2", label: "IMFG 2024" },
          as_of: "2024-09-30",
        },
        {
          sub_section_anchor: "third-anchor",
          sub_claim: "Third sub-claim",
          finding: "Third angle.",
          metric: "Comparable jurisdiction outcome",
          source: { tier: "T3", label: "Author 2023" },
          as_of: "2023-12-31",
        },
      ],
    },
    meta: {
      last_reviewed: "2026-05-07",
      next_review: "2026-06-07",
    },
    ...overrides,
  };
}
