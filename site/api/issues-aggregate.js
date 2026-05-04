import { redis } from "./_lib/redis.js";

export default async function handler(req, res) {
  const raw = (await redis.hgetall("issue:counts")) || {};
  const total = parseInt((await redis.get("issue:total_voters")) || 0, 10);
  const counts = {};
  for (const [k, v] of Object.entries(raw)) counts[k] = parseInt(v, 10);
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
  return res.status(200).json({ counts, total_voters: total });
}
