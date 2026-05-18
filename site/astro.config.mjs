import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// Bartender website — GitHub Pages em subpath `/bartender/`.
// A versão é injetada pela GitHub Action via PUBLIC_BARTENDER_VERSION; em
// dev local usamos um fallback.
const SITE_URL = 'https://thiagossampaio.github.io';
const BASE = '/bartender';

export default defineConfig({
  site: SITE_URL,
  base: BASE,
  trailingSlash: 'ignore',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    mdx(),
    sitemap({
      i18n: {
        defaultLocale: 'en-US',
        locales: {
          'en-US': 'en-US',
          'pt-BR': 'pt-BR',
        },
      },
    }),
  ],
  i18n: {
    defaultLocale: 'en-US',
    locales: ['en-US', 'pt-BR'],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  build: {
    format: 'directory',
  },
});
