/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '400px',
        tablet: '640px',
        // lg (1024px): switch from bottom nav to full top nav
      },
      fontFamily: {
        display: ['"DM Sans"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif']
      },
      colors: {
        binokio: {
          accent: '#f43f5e',
          dark: '#0f0a0c',
          card: '#1a1216',
          muted: '#9c8b92',
          surface: '#24181e'
        }
      },
      backgroundImage: {
        'hero-gradient':
          'linear-gradient(135deg, #1a0a12 0%, #2d1520 40%, #0f0a0c 100%)',
        'card-shine':
          'linear-gradient(145deg, rgba(255,255,255,0.06) 0%, transparent 50%)'
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-top': 'env(safe-area-inset-top, 0px)'
      }
    }
  },
  plugins: []
};
