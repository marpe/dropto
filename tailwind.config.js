/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#edfcf4',
          100: '#d5f7e6',
          200: '#aef0d1',
          300: '#76e4b4',
          400: '#52d69b',
          500: '#3ECF8E', // Supabase primary green
          600: '#24b47e',
          700: '#1c8f65',
          800: '#1a7152',
          900: '#175c44',
          950: '#073324',
        },
        supabase: {
          bg: '#121212',
          surface: '#181818',
          card: '#1e1e1e',
          border: '#27272a',
        },
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        radar: {
          '0%': { transform: 'scale(0.95)', opacity: '0.8' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
      },
      animation: {
        float: 'float 3.5s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2.5s ease-in-out infinite',
        shimmer: 'shimmer 2.5s ease-in-out infinite',
        radar: 'radar 2s cubic-bezier(0, 0.2, 0.8, 1) infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 4s linear infinite',
      },
    },
  },
  plugins: [],
}
