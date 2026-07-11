/**
 * Design tokens ported from Open Science Desktop (MIT, ai4s-research/open-science).
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "color-mix(in srgb, var(--bg) calc(<alpha-value> * 100%), transparent)",
        surface: "color-mix(in srgb, var(--surface) calc(<alpha-value> * 100%), transparent)",
        "surface-2": "color-mix(in srgb, var(--surface-2) calc(<alpha-value> * 100%), transparent)",
        border: "color-mix(in srgb, var(--border) calc(<alpha-value> * 100%), transparent)",
        faint: "color-mix(in srgb, var(--border-faint) calc(<alpha-value> * 100%), transparent)",
        text: "color-mix(in srgb, var(--text) calc(<alpha-value> * 100%), transparent)",
        muted: "color-mix(in srgb, var(--muted) calc(<alpha-value> * 100%), transparent)",
        accent: "color-mix(in srgb, var(--accent) calc(<alpha-value> * 100%), transparent)",
        "accent-fg": "color-mix(in srgb, var(--accent-fg) calc(<alpha-value> * 100%), transparent)",
        link: "color-mix(in srgb, var(--link) calc(<alpha-value> * 100%), transparent)",
        warn: "color-mix(in srgb, var(--warn) calc(<alpha-value> * 100%), transparent)",
        ok: "color-mix(in srgb, var(--ok) calc(<alpha-value> * 100%), transparent)",
        error: "color-mix(in srgb, var(--error) calc(<alpha-value> * 100%), transparent)",
      },
      fontFamily: {
        serif: ["'Source Serif 4'", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "14px",
        input: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(40, 39, 35, 0.04), 0 4px 16px rgba(40, 39, 35, 0.05)",
        pop: "0 8px 30px rgba(40, 39, 35, 0.14)",
      },
    },
  },
  plugins: [],
};
