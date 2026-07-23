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
        // Monochrome accent — the whole UI reads black & white / minimal.
        accent: {
          DEFAULT: "#fafafa",
          soft: "#e5e5e5",
          glow: "#ffffff",
        },
        // Semantic score colors, desaturated to sit quietly in a B&W UI.
        brand: {
          yellow: "#d8d8d8",
          green: "#ffffff",
          red: "#8a8f9a",
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
        glow: "0 0 20px rgba(255,255,255,0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
