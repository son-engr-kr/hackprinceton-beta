import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#FFF5EC",
        peach: { 100: "#FFE5D9", 300: "#FFB4A2", 500: "#FF8A7A" },
        charcoal: "#4A3F45",
        hotpink: "#FF477E",
        mint: "#B5E48C",
        lavender: "#D6C8FF",
        sunny: "#FFD166",
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        display: ["Cafe24 Ohsquare", "Pretendard Variable", "sans-serif"],
      },
      boxShadow: {
        cushion: "0 6px 0 rgba(74, 63, 69, 0.12), 0 14px 30px -12px rgba(74, 63, 69, 0.25)",
        pop: "0 2px 0 rgba(74, 63, 69, 0.15), 0 8px 16px -8px rgba(74, 63, 69, 0.3)",
      },
      borderRadius: {
        blob: "32px",
      },
      keyframes: {
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" },
        },
      },
      animation: {
        bob: "bob 3s ease-in-out infinite",
        wiggle: "wiggle 0.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
