import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        signal: "var(--signal)",
        "signal-ink": "var(--signal-ink)",
        success: "var(--success)",
        rule: "var(--rule)",
        masthead: "var(--masthead)",
        "masthead-ink": "var(--masthead-ink)",
        "stamp-bg": "var(--stamp-bg)",
        "stamp-border": "var(--stamp-border)",
        "stamp-text": "var(--stamp-text)",
        "stamp-verified-bg": "var(--stamp-verified-bg)",
        "stamp-verified-border": "var(--stamp-verified-border)",
        "stamp-verified-text": "var(--stamp-verified-text)",
        "audit-tint": "var(--audit-tint)",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif Pro"', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        "label": "0.14em",
      },
    },
  },
  plugins: [],
};
export default config;
