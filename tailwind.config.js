/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        aura: {
          black: "#000000",
          surface: "#0e0e0e",
          card: "#181818",
          cardLow: "#141414",
          cardHigh: "#222222",
          gold: "#D4AF37",
          goldLight: "#F5D061",
          goldDark: "#9A7B1C",
          purple: "#8B5CF6",
          purpleLight: "#A78BFA",
          purpleDark: "#6D28D9",
          text: "#FFFFFF",
          muted: "#9CA3AF",
          subtle: "#4B5563",
          border: "#2A2A2A"
        },
        primary: {
          DEFAULT: "#D4AF37",
          light: "#F5D061",
          dark: "#9A7B1C",
        },
        secondary: {
          DEFAULT: "#8B5CF6",
          light: "#A78BFA",
          dark: "#6D28D9",
        }
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        sans: ["'Manrope'", "sans-serif"],
        display: ["'Space Grotesk'", "sans-serif"],
      }
    },
  },
  plugins: [],
}
