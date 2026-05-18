/**
 * Dicionário de strings de UI para o site Bartender.
 *
 * Conteúdo longo (docs, hero copy de páginas) NÃO mora aqui — vive em
 * `src/content/docs/<locale>/*.mdx` ou nos próprios `.astro` da página.
 * Este arquivo é apenas para strings reutilizadas no header, footer,
 * navegação, CTAs, cards de download e labels de OS.
 */

export const locales = ['en-US', 'pt-BR'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en-US';

export const localeNames: Record<Locale, string> = {
  'en-US': 'English',
  'pt-BR': 'Português (Brasil)',
};

export const ui = {
  'en-US': {
    'nav.home': 'Home',
    'nav.features': 'Features',
    'nav.docs': 'Docs',
    'nav.download': 'Download',
    'nav.github': 'GitHub',

    'cta.download': 'Download',
    'cta.download.for': 'Download for {os}',
    'cta.read.docs': 'Read the docs',
    'cta.view.source': 'View source on GitHub',
    'cta.get.bartender': 'Get Bartender',
    'cta.see.all.downloads': 'See all downloads',
    'cta.back.home': 'Back to home',

    'os.windows': 'Windows',
    'os.mac': 'macOS',
    'os.linux': 'Linux',
    'os.windows.full': 'Windows 10 / 11 (64-bit)',
    'os.mac.full': 'macOS (Intel + Apple Silicon)',
    'os.linux.deb.full': 'Linux · Debian / Ubuntu',
    'os.linux.appimage.full': 'Linux · AppImage (any distro)',

    'download.detected': 'We detected {os} on your device.',
    'download.detecting': 'Detecting your operating system…',
    'download.notes.win': 'Requires WebView2 (already included in Windows 10 1809+ and Windows 11).',
    'download.notes.mac': 'macOS 12 Monterey or later. Single universal build for Intel and Apple Silicon.',
    'download.notes.deb': 'Ubuntu 22.04+, Debian 12+.',
    'download.notes.appimage': 'Any x86_64 distro with glibc 2.35+. Portable — no install needed.',
    'download.size': 'Size: ~{size}',
    'download.verify': 'Verify on GitHub Releases',
    'download.install.guide': 'Installation guide',
    'download.older': 'Older versions',
    'download.source': 'Build from source',
    'download.version': 'Version {version}',
    'download.latest': 'Latest release',

    'docs.toc': 'On this page',
    'docs.prev': 'Previous',
    'docs.next': 'Next',
    'docs.edit': 'Edit this page on GitHub',
    'docs.sidebar.title': 'Documentation',

    'footer.tagline': 'Offline-first label design and printing.',
    'footer.product': 'Product',
    'footer.documentation': 'Documentation',
    'footer.community': 'Community',
    'footer.resources': 'Resources',
    'footer.downloads': 'Downloads',
    'footer.copy': '© {year} Bartender. Open source under the MIT License.',
    'footer.no.telemetry': 'Offline-first · No telemetry · No subscriptions',

    'hero.eyebrow': 'Open source · Offline-first',
    'lang.switch': 'Language',

    '404.title': 'Page not found',
    '404.body': 'The page you are looking for has moved or never existed.',
  },
  'pt-BR': {
    'nav.home': 'Início',
    'nav.features': 'Recursos',
    'nav.docs': 'Documentação',
    'nav.download': 'Download',
    'nav.github': 'GitHub',

    'cta.download': 'Baixar',
    'cta.download.for': 'Baixar para {os}',
    'cta.read.docs': 'Ler a documentação',
    'cta.view.source': 'Ver no GitHub',
    'cta.get.bartender': 'Use o Bartender',
    'cta.see.all.downloads': 'Ver todos os downloads',
    'cta.back.home': 'Voltar ao início',

    'os.windows': 'Windows',
    'os.mac': 'macOS',
    'os.linux': 'Linux',
    'os.windows.full': 'Windows 10 / 11 (64 bits)',
    'os.mac.full': 'macOS (Intel + Apple Silicon)',
    'os.linux.deb.full': 'Linux · Debian / Ubuntu',
    'os.linux.appimage.full': 'Linux · AppImage (qualquer distribuição)',

    'download.detected': 'Detectamos {os} no seu computador.',
    'download.detecting': 'Detectando seu sistema operacional…',
    'download.notes.win': 'Requer WebView2 (já incluso no Windows 10 1809+ e no Windows 11).',
    'download.notes.mac': 'macOS 12 Monterey ou superior. Build universal único para Intel e Apple Silicon.',
    'download.notes.deb': 'Ubuntu 22.04+, Debian 12+.',
    'download.notes.appimage': 'Qualquer distro x86_64 com glibc 2.35+. Portátil — não precisa instalar.',
    'download.size': 'Tamanho: ~{size}',
    'download.verify': 'Verificar no GitHub Releases',
    'download.install.guide': 'Guia de instalação',
    'download.older': 'Versões anteriores',
    'download.source': 'Compilar a partir do código',
    'download.version': 'Versão {version}',
    'download.latest': 'Última versão',

    'docs.toc': 'Nesta página',
    'docs.prev': 'Anterior',
    'docs.next': 'Próximo',
    'docs.edit': 'Editar esta página no GitHub',
    'docs.sidebar.title': 'Documentação',

    'footer.tagline': 'Criação e impressão de etiquetas offline-first.',
    'footer.product': 'Produto',
    'footer.documentation': 'Documentação',
    'footer.community': 'Comunidade',
    'footer.resources': 'Recursos',
    'footer.downloads': 'Downloads',
    'footer.copy': '© {year} Bartender. Open source sob a Licença MIT.',
    'footer.no.telemetry': 'Offline-first · Sem telemetria · Sem assinaturas',

    'hero.eyebrow': 'Open source · Offline-first',
    'lang.switch': 'Idioma',

    '404.title': 'Página não encontrada',
    '404.body': 'A página que você procura foi movida ou nunca existiu.',
  },
} satisfies Record<Locale, Record<string, string>>;

export type UIKey = keyof (typeof ui)['en-US'];
