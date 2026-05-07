import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#15110d",
        ink: "#e8e3d5",
        muted: "#8a8275",
        accent: "#c4923a",
        "stamp-bg": "#1c1813",
        "stamp-border": "#4a4234",
        "stamp-text": "#b8b09e",
        "stamp-verified-bg": "#1c1813",
        "stamp-verified-border": "#c4923a",
        "stamp-verified-text": "#c4923a",
        success: "#3a8a3a",
        rule: "#2a2520",
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
