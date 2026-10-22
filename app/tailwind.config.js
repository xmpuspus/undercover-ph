/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Jost", '"Jost Fallback"', '"Jost Fallback Roboto"', "system-ui", "sans-serif"] },
      colors: { ink: "#0F172A", brand: "#2563EB", sun: "#FACC15" },
      borderRadius: { card: "16px" },
      // Phones held sideways and other short screens.
      screens: { short: { raw: "(max-height: 520px)" } },
      boxShadow: { card: "0 8px 24px rgba(15, 23, 42, 0.12)" },
    },
  },
  plugins: [],
};
