import { Redis } from "@upstash/redis";
import crypto from "node:crypto";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

export function hashFingerprint(raw: string | null): string | null {
  if (!raw || typeof raw !== "string" || raw.length < 8) return null;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}
