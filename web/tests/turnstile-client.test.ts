import { test, expect, vi } from "vitest";
import { getTurnstileToken } from "@/lib/turnstile-client";

test("returns 'dev' immediately when no site key", async () => {
  await expect(getTurnstileToken(undefined)).resolves.toBe("dev");
});

test("resolves to '' after timeout when turnstile never loads", async () => {
  vi.useFakeTimers();
  const fakeWin = { turnstile: undefined } as unknown as Window & { turnstile?: unknown };
  const p = getTurnstileToken("sitekey", { timeoutMs: 1000, win: fakeWin });
  await vi.advanceTimersByTimeAsync(1200);
  await expect(p).resolves.toBe("");
  vi.useRealTimers();
});
