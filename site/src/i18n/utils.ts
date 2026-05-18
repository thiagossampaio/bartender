import { defaultLocale, locales, ui, type Locale, type UIKey } from './ui';

/**
 * Resolve a locale a partir da URL. Astro i18n nativo já garante que rotas
 * dentro de `/pt-BR/*` mapeiam para pt-BR; aqui apenas espelhamos a regra
 * para uso em templates `.astro`.
 */
export function getLocaleFromUrl(url: URL): Locale {
  const segments = url.pathname.replace(/^\/+/, '').split('/');
  // Quando rodando em subpath /bartender/, Astro já remove o base antes
  // de chegar aqui — mas se vier embutido, descartamos o primeiro segmento.
  const candidate = segments[0] === 'bartender' ? segments[1] : segments[0];
  if (candidate && (locales as readonly string[]).includes(candidate)) {
    return candidate as Locale;
  }
  return defaultLocale;
}

/**
 * Cria um helper `t(key, vars?)` para traduções.
 *
 * Vars são interpoladas com a sintaxe `{name}`. Faltar uma chave causa
 * fallback para a string da default locale.
 */
export function useTranslations(locale: Locale) {
  return function t(key: UIKey, vars?: Record<string, string | number>): string {
    const dict = ui[locale] ?? ui[defaultLocale];
    const fallback = ui[defaultLocale];
    let template = (dict[key] as string | undefined) ?? (fallback[key] as string);
    if (!template) return key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        template = template.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
      }
    }
    return template;
  };
}

/**
 * Prepende a base URL (`/bartender/` em produção, `/` em dev) a um caminho
 * relativo. Use em todos os `href` internos.
 */
export function withBase(path: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');
  if (!path.startsWith('/')) path = '/' + path;
  return `${base}${path}` || '/';
}

/**
 * Constrói o link da página equivalente na outra locale.
 *
 * Mapeia slugs traduzidos onde necessário (ex.: /features ↔ /pt-BR/recursos).
 */
const SLUG_MAP: Record<string, Partial<Record<Locale, string>>> = {
  features: { 'en-US': 'features', 'pt-BR': 'recursos' },
  recursos: { 'en-US': 'features', 'pt-BR': 'recursos' },
};

export function getLocalizedHref(currentUrl: URL, targetLocale: Locale): string {
  const pathname = currentUrl.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '') || '/';
  const segments = pathname.split('/').filter(Boolean);

  // Remove o prefixo da locale atual, se presente
  if (segments[0] && (locales as readonly string[]).includes(segments[0])) {
    segments.shift();
  }

  // Traduz slug top-level se houver mapeamento
  if (segments[0] && SLUG_MAP[segments[0]]) {
    const mapped = SLUG_MAP[segments[0]]?.[targetLocale];
    if (mapped) segments[0] = mapped;
  }

  const prefix = targetLocale === defaultLocale ? '' : `/${targetLocale}`;
  const rest = segments.length ? `/${segments.join('/')}` : '/';
  return withBase(`${prefix}${rest}`);
}

/**
 * Gera o caminho de uma página de docs preservando locale.
 * Ex.: docPath('en-US', 'gallery') → `/bartender/docs/gallery/`
 */
export function docPath(locale: Locale, slug?: string): string {
  const prefix = locale === defaultLocale ? '' : `/${locale}`;
  const suffix = slug ? `/${slug}/` : '/';
  return withBase(`${prefix}/docs${suffix}`);
}

/**
 * Gera o caminho de uma página top-level preservando locale e o mapping
 * de slug (features ↔ recursos).
 */
export function pagePath(locale: Locale, page: 'home' | 'features' | 'download'): string {
  const prefix = locale === defaultLocale ? '' : `/${locale}`;
  if (page === 'home') return withBase(`${prefix}/`);
  if (page === 'features') {
    const slug = locale === 'pt-BR' ? 'recursos' : 'features';
    return withBase(`${prefix}/${slug}/`);
  }
  return withBase(`${prefix}/download/`);
}
