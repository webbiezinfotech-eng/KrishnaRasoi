/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Fraunces', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#fff8f0',
          100: '#ffecd6',
          200: '#ffd4a8',
          300: '#ffb570',
          400: '#ff8c35',
          500: '#f97316',
          600: '#ea6008',
          700: '#c24a09',
          800: '#9a3c10',
          900: '#7c3310',
        },
        surface: {
          0:   '#ffffff',
          50:  '#fafafa',
          100: '#f5f5f4',
          200: '#e8e7e5',
          300: '#d4d2cf',
          400: '#b8b4b0',
          500: '#8f8a84',
          600: '#6d6760',
          700: '#4b453f',
          800: '#292524',
          900: '#1c1917',
          950: '#0c0a09',
        }
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'card-md': '0 4px 12px 0 rgba(0,0,0,0.08), 0 2px 4px -1px rgba(0,0,0,0.04)',
        'card-lg': '0 12px 32px 0 rgba(0,0,0,0.10), 0 4px 8px -2px rgba(0,0,0,0.06)',
      }
    },
  },
  plugins: [],
}
