import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08090c",
          900: "#0c0e13",
          850: "#11141b",
          800: "#161a23",
          700: "#1e2330",
          600: "#2a3040",
          500: "#3b4256",
        },
        accent: {
          DEFAULT: "#7c5cff",
          soft: "#9d86ff",
          glow: "#b7a6ff",
        },
        brand: {
          yellow: "#ffd400",
          green: "#2dd4a0",
          red: "#ff5c72",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        caption: ["Archivo Black", "Inter", "sans-serif"],
      },
      boxShadow: {
        panel:
          "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.45)",
        glow: "0 0 24px rgba(124,92,255,0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
