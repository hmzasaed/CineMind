/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07070c",
          900: "#0c0c14",
          850: "#11111c",
          800: "#16161f",
          700: "#1f1f2c",
          600: "#2a2a3a",
        },
        // "gold" now carries the warm bronze/copper accent used across every
        // existing button, badge, and focus ring — retinting here reskins the
        // whole app without touching ~40 call sites.
        gold: {
          200: "#f0d9ae",
          300: "#e3b877",
          400: "#cf9a52",
          500: "#b5793a",
          600: "#93602e",
        },
        mist: {
          300: "#c7cdd6",
          400: "#9aa3b2",
          500: "#717a8a",
        },
        azure: {
          400: "#5eb3d9",
          500: "#3c92bd",
        },
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["\"JetBrains Mono\"", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        "glow-copper": "0 0 0 1px rgba(207,154,82,0.25), 0 8px 30px -8px rgba(207,154,82,0.35)",
        "glow-soft": "0 20px 60px -20px rgba(0,0,0,0.65)",
        elevated: "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 48px -24px rgba(0,0,0,0.7)",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        shimmer: "shimmer 1.6s linear infinite",
        "fade-up": "fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fadeIn 0.6s ease-out both",
        drift: "drift 14s ease-in-out infinite",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        drift: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(-1.5%,1%,0) scale(1.03)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
        },
      },
      transitionTimingFunction: {
        cinematic: "cubic-bezier(0.16,1,0.3,1)",
      },
    },
  },
  plugins: [],
};