// Upstash Redis client. Reads URL and TOKEN from either:
//   - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (Upstash-native naming)
//   - KV_REST_API_URL       / KV_REST_API_TOKEN          (Vercel Marketplace
//                                                          legacy "Vercel KV"
//                                                          naming, same service)
// Whichever is present wins; in practice the Marketplace integration sets the
// KV_* pair while the Upstash dashboard sets the UPSTASH_* pair.

import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});
