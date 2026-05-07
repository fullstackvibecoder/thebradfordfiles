import { z } from "zod";
import { CitationSchema, ComparableSchema, type Citation, type Comparable } from "./scenario-types";

export const ClaimSourceSchema = z.object({
  attribution: z.string().min(1),
  url: z.string().url(),
  retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ClaimSource = z.infer<typeof ClaimSourceSchema>;

export const ClaimBlockSchema = z.object({
  headline: z.string().min(1),
  attribution: z.string().min(1),
  source: ClaimSourceSchema,
  response_from_source: z.string().optional(),
});
export type ClaimBlock = z.infer<typeof ClaimBlockSchema>;

export const PullConfigSchema = z.object({
  source: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  format: z.string().min(1),
});
export type PullConfig = z.infer<typeof PullConfigSchema>;

export const DataAnchorSchema = z.object({
  sub_section_anchor: z.string().regex(/^[a-z0-9-]+$/),
  sub_claim: z.string().min(1),
  finding: z.string().min(1),
  metric: z.string().min(1),
  source: CitationSchema,
  caveats: z.string().optional(),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pull_config: PullConfigSchema.optional(),
});
export type DataAnchor = z.infer<typeof DataAnchorSchema>;

export const ReceiptCardSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    topic: z.string().min(1),
    topic_short: z.string().min(1),
    pull_quote: z.string().min(40).max(400),
    claims: z.array(ClaimBlockSchema).min(1).max(3),
    receipt: z.object({
      intro: z.string().min(1),
      anchors: z.array(DataAnchorSchema).min(3).max(6),
    }),
    what_data_cannot_settle: z.string().optional(),
    comparables: z.array(ComparableSchema).optional(),
    meta: z.object({
      last_reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      next_review: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  })
  .superRefine((card, ctx) => {
    const anchors = new Set<string>();
    for (const a of card.receipt.anchors) {
      if (anchors.has(a.sub_section_anchor)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate sub_section_anchor: " + a.sub_section_anchor,
          path: ["receipt", "anchors"],
        });
      }
      anchors.add(a.sub_section_anchor);
    }
    for (const c of card.claims) {
      if (c.source.retrieved < "2024-01-01") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Claim source must be from 2024-01-01 or later (campaign window). Got " + c.source.retrieved,
          path: ["claims"],
        });
      }
    }
  });
export type ReceiptCard = z.infer<typeof ReceiptCardSchema>;

const EM_DASH = "\u2014";

export function containsEmDash(card: unknown): boolean {
  return JSON.stringify(card).includes(EM_DASH);
}

export interface ReceiptValidationResult {
  ok: boolean;
  card?: ReceiptCard;
  errors?: string[];
}

export function validateReceiptCard(input: unknown): ReceiptValidationResult {
  if (containsEmDash(input)) {
    return { ok: false, errors: ["Card contains an em dash (U+2014). Use periods, commas, colons, or parentheses instead."] };
  }
  const parsed = ReceiptCardSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message),
    };
  }
  return { ok: true, card: parsed.data };
}
