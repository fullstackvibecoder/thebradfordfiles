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
