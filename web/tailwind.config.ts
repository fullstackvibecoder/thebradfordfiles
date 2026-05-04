import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#fbfbf9",
        ink: "#1c1c1c",
        muted: "#5a5a55",
        accent: "#a07223",
        "stamp-bg": "#f6f3ea",
        "stamp-border": "#d8cfbd",
        "stamp-text": "#5a4a2a",
        "stamp-verified-bg": "#fff8eb",
        "stamp-verified-border": "#b59238",
        "stamp-verified-text": "#7a5e2a",
        success: "#1a5b1a",
        rule: "#ececea",
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
