import type { Config } from "tailwindcss";

// Technica "Dare to Dive" palette, light version
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: "#eefbf8", // page background (light seafoam, like gotechnica.org)
        deep: "#ffffff", // table + header surfaces
        surface: "#ffffff",
        line: "#cfe9e4",
        ink: "#12303a", // body text
        muted: "#5d7f87",
        aqua: "#1fb5ac",
        coral: "#e8689a",
        seafoam: "#6fd6c2",
        peach: "#e9a56a",
        sky: "#4f86e0",
        gold: "#e8c46a",
        ok: "#1f9d6a",
        warn: "#c08a00",
        bad: "#dc3f56",
        early: "#d45e2a", // buoy early warning (PRODUCT-PLAN §7)
        offline: "#9aaeb3",
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
