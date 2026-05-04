// Server-side verification of a Cloudflare Turnstile token.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

export async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!token) return false;
  const body = new URLSearchParams();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) body.append("remoteip", remoteIp);
  try {
    const r = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body }
    );
    const json = await r.json();
    return Boolean(json.success);
  } catch {
    return false;
  }
}
