import { redis } from "./_lib/redis.js";

const RECORD_ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

export default async function handler(req, res) {
  const { record_id } = req.query;
  if (!record_id || !RECORD_ID_RE.test(record_id))
    return res.status(400).json({ error: "invalid_record_id" });
  const raw = (await redis.hgetall(`vote:${record_id}:counts`)) || {};
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
  return res.status(200).json({
    record_id,
    counts: {
      kept: parseInt(raw.kept || 0, 10),
      broke: parseInt(raw.broke || 0, 10),
      too_early: parseInt(raw.too_early || 0, 10),
      total: parseInt(raw.total || 0, 10),
    },
  });
}
