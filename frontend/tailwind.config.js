/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#378ADD",
        success: "#1D9E75",
        warning: "#D85A30",
        danger: "#BA7517",
      },
    },
  },
  plugins: [],
}
