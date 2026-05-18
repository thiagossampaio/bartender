/**
 * Tailwind config para o site Bartender.
 *
 * Mapeia os tokens do DESIGN.md em utilities. O sistema é editorial:
 *  - canvas off-white, ink near-black
 *  - tipografia display em peso 300 (EB Garamond como substituto de Waldenburg)
 *  - sem CTA color saturado — só ink pill
 *  - gradientes pastel SOMENTE como atmosphere via <GradientOrb>
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}',
    './public/**/*.html',
  ],
  theme: {
    extend: {
      colors: {
        // Brand
        primary: '#292524',
        'primary-active': '#0c0a09',

        // Surface
        canvas: '#f5f5f5',
        'canvas-soft': '#fafafa',
        'canvas-deep': '#0c0a09',
        'surface-card': '#ffffff',
        'surface-strong': '#f0efed',
        'surface-dark': '#0c0a09',
        'surface-dark-elevated': '#1c1917',

        // Hairlines
        hairline: '#e7e5e4',
        'hairline-soft': '#f0efed',
        'hairline-strong': '#d6d3d1',

        // Text
        ink: '#0c0a09',
        body: '#4e4e4e',
        'body-strong': '#292524',
        muted: '#777169',
        'muted-soft': '#a8a29e',
        'on-primary': '#ffffff',
        'on-dark': '#ffffff',
        'on-dark-soft': '#a8a29e',

        // Atmospheric gradient stops — uso restrito a <GradientOrb>
        'gradient-mint': '#a7e5d3',
        'gradient-peach': '#f4c5a8',
        'gradient-lavender': '#c8b8e0',
        'gradient-sky': '#a8c8e8',
        'gradient-rose': '#e8b8c4',

        // Semantic
        'semantic-success': '#16a34a',
        'semantic-error': '#dc2626',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', '"Times New Roman"', 'serif'],
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontWeight: {
        // Reforça o uso de peso 300 para display
        display: '300',
      },
      borderRadius: {
        none: '0px',
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
        xxl: '24px',
        pill: '9999px',
        full: '9999px',
      },
      boxShadow: {
        'soft-drop': '0 4px 16px rgba(0, 0, 0, 0.04)',
        'hairline': '0 0 0 1px #e7e5e4',
      },
      spacing: {
        section: '96px',
      },
      maxWidth: {
        prose: '720px',
        content: '1200px',
      },
      letterSpacing: {
        display: '-0.01em',
        'display-tight': '-0.03em',
        'display-mega': '-0.03em',
        body: '0.01em',
        caption: '0.08em',
      },
    },
  },
  plugins: [],
};
