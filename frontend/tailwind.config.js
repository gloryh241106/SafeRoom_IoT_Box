/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: "#0f172a",
        darkCard: "#1e293b",
        darkBorder: "#334155",
        accentPrimary: "#3b82f6",
        accentSuccess: "#10b981",
        accentWarning: "#f59e0b",
        accentDanger: "#ef4444",
      }
    },
  },
  plugins: [],
}
