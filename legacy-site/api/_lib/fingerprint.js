// Hash a client-supplied browser fingerprint for one-vote-per-fingerprint dedup.
// One-way hash; never logged in plaintext.
import crypto from "node:crypto";

export function hashFingerprint(raw) {
  if (!raw || typeof raw !== "string" || raw.length < 8) return null;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}
