import { brandColors, accentColors } from './src/theme/tokens.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  safelist: [
    'bg-brand-600',
    'hover:bg-brand-700',
    'border-brand-600',
    'hover:border-brand-700',
    'text-white',
    'focus-visible:ring-brand-500',
    'bg-accent-600',
    'hover:bg-accent-700',
    'focus-visible:ring-accent-500',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: brandColors,
        accent: accentColors,
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 4px 12px -2px rgb(15 23 42 / 0.10)',
      },
    },
  },
  plugins: [],
}
