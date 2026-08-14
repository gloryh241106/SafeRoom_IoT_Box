/** @type {import('tailwindcss').Config} */
export default {
  // Keep scanning limited to authored templates so generated dependencies do not
  // inflate the stylesheet or accidentally retain unused utility classes.
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Semantic safety colors provide one vocabulary across cards and alerts.
      colors: {
        accentPrimary: "#3b82f6",
        accentSuccess: "#10b981",
        accentWarning: "#f59e0b",
        accentDanger: "#ef4444",
      }
    },
  },
  plugins: [],
}
