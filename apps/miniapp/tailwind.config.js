/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FFF8F0',
        peach: {
          100: '#FFE8D6',
          200: '#FFDAB9',
          400: '#F4A988',
          500: '#E8906B',
        },
        lavender: {
          100: '#F0EAFB',
          200: '#E6E6FA',
          400: '#B8A9D9',
          500: '#9B8AC4',
        },
        ink: '#4A3F52',
        soft: '#8A7B93',
        phase: {
          menstrual: '#F4A9B8',
          follicular: '#A9D9B8',
          ovulatory: '#F4C988',
          luteal: '#B8A9D9',
        },
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};
