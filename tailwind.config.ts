import type { Config } from "tailwindcss";

/**
 * "Graphite ember" — premium finance-grade design tokens, keyed to the
 * Kizz Lubricant mark (graphite gear + orange-red flame/drop).
 * Tonally-unified neutrals, a single restrained orange-red accent, and a
 * layered elevation system so white surfaces actually sit on the canvas.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces — all light, tinted. No pure white/black anywhere.
        canvas: "#F4F5F9", // page background — cool off-white
        surface: "#FFFFFF", // cards / content
        panel: "#EDEEF4", // sidebar — soft slate
        "panel-raised": "#F6F6FA", // raised chips on the panel

        // Text
        ink: "#26262F", // primary — slate-ink (not black)
        muted: "#6A6A76", // secondary
        faint: "#9A9AA6", // tertiary / micro-labels

        // Lines
        line: "#E6E7EE", // hairline dividers/borders
        "line-strong": "#D9DAE2", // input borders

        // Accent — orange-red flame/drop from the mark, used sparingly
        accent: "#E2540C",
        "accent-hover": "#C2440A",
        "accent-ink": "#9C3A0A", // accent text on light tints (contrast)
        "accent-tint": "#FDEEE6",
        "accent-tint-strong": "#FADCC9", // hero surface

        // Semantic (kept distinct from the accent family)
        success: "#15914B",
        "success-tint": "#E9F8EF",
        danger: "#DC2626",
        "danger-tint": "#FEF1F1",
        warning: "#B8790C", // amber-gold, echoes the mark's "LUBRICANT" wordmark
        "warning-tint": "#FBF0DC",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
        // Numbers / IDs — the "data" face. Tabular figures.
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.03em",
        eyebrow: "0.08em",
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        // Layered elevation — a tight contact shadow + a soft ambient one.
        card: "0 1px 2px 0 rgba(23,22,29,0.04), 0 2px 8px -2px rgba(23,22,29,0.06)",
        "card-hover":
          "0 2px 4px -1px rgba(23,22,29,0.06), 0 12px 28px -6px rgba(23,22,29,0.12)",
        pop: "0 16px 48px -12px rgba(23,22,29,0.24), 0 2px 6px -2px rgba(23,22,29,0.10)",
        btn: "0 1px 2px 0 rgba(23,22,29,0.10), inset 0 1px 0 0 rgba(255,255,255,0.10)",
        "accent-glow": "0 6px 20px -6px rgba(226,84,12,0.55)",
        focus: "0 0 0 3px rgba(226,84,12,0.28)",
      },
    },
  },
  plugins: [],
};
export default config;
