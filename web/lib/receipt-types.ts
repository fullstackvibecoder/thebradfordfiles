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
