import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16181D",
        "ink-soft": "#5B5F6B",
        line: "#ECEDF0",
        "line-strong": "#DFE1E6",
        // Brand accent — amber, unified with the dashboard (was muted brass).
        // Token names kept as `brass*` to avoid churn; values are the amber palette.
        brass: "#D97706",
        "brass-dark": "#B45309",
        "brass-tint": "#FFF7ED",
        danger: "#B3402F",
      },
      fontFamily: {
      display: ["var(--font-orbitron)", "sans-serif"], // <-- Yahan Orbitron hi hona chahiye
      body: ["var(--font-inter)", "system-ui", "sans-serif"],
      mono: ["var(--font-plex-mono)", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(22,24,29,0.04), 0 8px 32px rgba(22,24,29,0.06)",
        pop: "0 2px 4px rgba(22,24,29,0.05), 0 16px 48px rgba(22,24,29,0.10)",
      },
    },
  },
  plugins: [],
};
export default config;
