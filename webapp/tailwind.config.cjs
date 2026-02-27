/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#060916',
        panel: '#0f172a',
        line: '#1f2a44',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(56, 189, 248, 0.22), 0 8px 28px rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
};
