/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        dark: {
          bg: {
            primary: '#000000',
            secondary: '#0f0f0f',
            card: '#111111',
            elevated: '#1a1a1a',
            hover: '#262626',
          },
          border: {
            default: '#262626',
            subtle: '#1a1a1a',
            accent: '#404040',
          },
        },
        light: {
          bg: {
            primary: '#ffffff',
            secondary: '#fafafa',
            card: '#ffffff',
            elevated: '#f5f5f5',
            hover: '#f0f0f0',
          },
          border: {
            default: '#e4e4e7',
            subtle: '#f4f4f5',
            accent: '#a1a1aa',
          },
        },
      },
      boxShadow: {
        'card': '0 0 0 1px rgba(255, 255, 255, 0.05)',
        'card-hover': '0 0 0 1px rgba(255, 255, 255, 0.1), 0 4px 24px -1px rgba(0, 0, 0, 0.15)',
        'elevated': '0 8px 32px -8px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'fade-up': 'fadeUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
