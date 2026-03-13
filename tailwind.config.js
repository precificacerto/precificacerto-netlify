/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',

    // Or if using `src` directory:
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'primary-light-color': '#1890FF',
        primary: {
          50: '#052e16',
          100: '#14532d',
          200: '#15803d',
          300: '#16a34a',
          400: '#4ade80',
          500: '#3bd671',
          600: '#22C55E',
          700: '#16a34a',
          800: '#15803d',
          900: '#14532d',
          950: '#052e16',
        },
        neutral: {
          0: '#0a1628',
          25: '#0d1526',
          50: '#0f1a2e',
          100: '#1e293b',
          200: '#334155',
          300: '#475569',
          400: '#64748b',
          500: '#94a3b8',
          600: '#cbd5e1',
          700: '#e2e8f0',
          800: '#f1f5f9',
          900: '#f8fafc',
          950: '#ffffff',
        },
        success: '#12B76A',
        warning: '#F79009',
        error: '#F04438',
        info: '#2E90FA',
        page: '#0a1628',
        card: '#111c2e',
        elevated: '#162236',
      },
      fontFamily: {
        sans: ["'Inter'", '-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        xs: '0px 1px 2px rgba(16, 24, 40, 0.05)',
        card: '0px 1px 3px rgba(16, 24, 40, 0.08)',
        sidebar: '2px 0px 8px rgba(16, 24, 40, 0.06)',
      },
      spacing: {
        sidebar: '230px',
        'sidebar-collapsed': '64px',
        'mobile-nav': '64px',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
}
