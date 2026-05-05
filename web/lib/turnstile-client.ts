declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: { sitekey: string; size?: "compact" | "flexible" | "normal"; appearance?: "always" | "execute" | "interaction-only"; callback: (t: string) => void; "error-callback"?: () => void }) => void;
    };
  }
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

export async function getTurnstileToken(siteKey: string | undefined): Promise<string> {
  if (!siteKey) return "dev";
  return new Promise(resolve => {
    const tryRender = () => {
      if (!window.turnstile) {
        setTimeout(tryRender, 200);
        return;
      }
      const ctr = document.createElement("div");
      ctr.style.display = "none";
      document.body.appendChild(ctr);
      window.turnstile.render(ctr, {
        sitekey: siteKey,
        size: "flexible",
        appearance: "interaction-only",
        callback: (token: string) => resolve(token),
        "error-callback": () => resolve(""),
      });
    };
    tryRender();
  });
}
