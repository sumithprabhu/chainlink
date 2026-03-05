import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: "#375BD2",
        "primary-hover": "#4a6ae8",
        card: "#121525",
        dark: "#0B0D17",
        muted: "#AAB3C5",
        success: "#00D395",
        error: "#FF4D4F",
      },
      backgroundImage: {
        "accent-gradient": "linear-gradient(135deg, #375BD2 0%, #2F80ED 100%)",
        "hero-glow": "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(55, 91, 210, 0.35), transparent)",
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(55, 91, 210, 0.4)",
        "glow-sm": "0 0 20px -5px rgba(55, 91, 210, 0.3)",
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.75rem",
      },
      maxWidth: {
        "7xl": "80rem",
      },
    },
  },
  plugins: [],
};
export default config;
