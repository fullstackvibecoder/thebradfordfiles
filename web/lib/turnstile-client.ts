type TurnstileWindow = {
  turnstile?: {
    render: (el: HTMLElement, options: { sitekey: string; size?: "compact" | "flexible" | "normal"; appearance?: "always" | "execute" | "interaction-only"; callback: (t: string) => void; "error-callback"?: () => void }) => void;
  };
};

declare global {
  interface Window extends TurnstileWindow {}
}

let scriptLoading = false;

export function ensureTurnstileScript(): void {
  if (typeof window === "undefined") return;
  if (window.turnstile || scriptLoading) return;
  scriptLoading = true;
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  s.async = true;
  document.head.appendChild(s);
}

export function getTurnstileToken(
  siteKey: string | undefined,
  opts: { timeoutMs?: number; win?: TurnstileWindow } = {},
): Promise<string> {
  if (!siteKey) return Promise.resolve("dev");
  const timeoutMs = opts.timeoutMs ?? 8000;
  const win = opts.win ?? (typeof window !== "undefined" ? (window as TurnstileWindow) : undefined);
  return new Promise(resolve => {
    let settled = false;
    const done = (t: string) => { if (!settled) { settled = true; clearTimeout(timer); resolve(t); } };
    const timer = setTimeout(() => done(""), timeoutMs);
    let attempts = 0;
    const maxAttempts = Math.ceil(timeoutMs / 200);
    const tryRender = () => {
      if (settled) return;
      if (!win || !win.turnstile) {
        if (attempts++ >= maxAttempts) { done(""); return; }
        setTimeout(tryRender, 200);
        return;
      }
      const ctr = document.createElement("div");
      ctr.style.display = "none";
      document.body.appendChild(ctr);
      win.turnstile.render(ctr, {
        sitekey: siteKey,
        size: "flexible",
        appearance: "interaction-only",
        callback: (token: string) => done(token),
        "error-callback": () => done(""),
      });
    };
    tryRender();
  });
}
