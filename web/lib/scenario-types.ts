import { z } from "zod";

export const TIERS = ["T1", "T2", "T3", "T4"] as const;
export type Tier = (typeof TIERS)[number];

export const CitationSchema = z.object({
  tier: z.enum(TIERS),
  label: z.string().min(1),
  url: z.string().url().optional(),
  retrieved: z.string().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const CandidatePositionSchema = z.object({
  candidate_handle: z.string().min(1),
  candidate_name: z.string().min(1),
  summary: z.string().min(1),
  citations: z.array(CitationSchema),
});
export type CandidatePosition = z.infer<typeof CandidatePositionSchema>;

export const MechanismSchema = z.object({
  candidate_handle: z.string().min(1),
  summary: z.string().min(1),
});
export type Mechanism = z.infer<typeof MechanismSchema>;

export const ComparableSchema = z.object({
  name: z.string().min(1),
  period: z.string().min(1),
  summary: z.string().min(1),
  outcome: z.string().min(1),
  citations: z.array(CitationSchema),
  caveats: z.string().min(1),
});
export type Comparable = z.infer<typeof ComparableSchema>;

export const ProjectionSchema = z.object({
  scenario_label: z.string().min(1),
  range_or_value: z.string().min(1),
  citation: CitationSchema,
  notes: z.string().optional(),
});
export type Projection = z.infer<typeof ProjectionSchema>;

export const ProjectionsBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("plural"),
    intro: z.string().min(1),
    items: z.array(ProjectionSchema).min(2).max(3),
  }),
  z.object({
    kind: z.literal("thin"),
    rationale: z.string().min(1),
  }),
]);
export type ProjectionsBlock = z.infer<typeof ProjectionsBlockSchema>;

export const ScenarioCardSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    topic: z.string().min(1),
    topic_short: z.string().min(1),
    pull_quote: z.string().min(40).max(400),
    who_benefits: z.object({
      intro: z.string().min(1),
      mechanisms: z.array(MechanismSchema).min(1),
      literature_row: z.array(CitationSchema),
    }),
    positions: z.array(CandidatePositionSchema).min(1),
    status_quo: z.object({
      summary: z.string().min(1),
      existing_policy_stack: z.array(
        z.object({
          label: z.string().min(1),
          citations: z.array(CitationSchema),
        })
      ),
      citations: z.array(CitationSchema),
    }),
    comparables: z.array(ComparableSchema).min(3).max(5),
    projections: ProjectionsBlockSchema,
    time_horizon: z.string().optional(),
    meta: z.object({
      last_reviewed: z.string(),
      next_review: z.string(),
      methodology_notes: z.string().optional(),
    }),
  })
  .superRefine((card, ctx) => {
    const allCitations: Citation[] = [];
    allCitations.push(...card.who_benefits.literature_row);
    for (const p of card.positions) allCitations.push(...p.citations);
    allCitations.push(...card.status_quo.citations);
    for (const e of card.status_quo.existing_policy_stack) allCitations.push(...e.citations);
    for (const c of card.comparables) allCitations.push(...c.citations);
    if (card.projections.kind === "plural") {
      for (const p of card.projections.items) allCitations.push(p.citation);
    }
    const hasT4 = allCitations.some((c) => c.tier === "T4");
    if (hasT4 && !card.meta.methodology_notes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cards with T4 citations require meta.methodology_notes",
        path: ["meta", "methodology_notes"],
      });
    }
  });
export type ScenarioCard = z.infer<typeof ScenarioCardSchema>;

const EM_DASH = "\u2014";

export function containsEmDash(card: unknown): boolean {
  return JSON.stringify(card).includes(EM_DASH);
}

export interface ValidationResult {
  ok: boolean;
  card?: ScenarioCard;
  errors?: string[];
}

export function validateScenarioCard(input: unknown): ValidationResult {
  if (containsEmDash(input)) {
    return { ok: false, errors: ["Card contains an em dash (U+2014). Use periods, commas, colons, or parentheses instead."] };
  }
  const parsed = ScenarioCardSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message),
    };
  }
  return { ok: true, card: parsed.data };
}
