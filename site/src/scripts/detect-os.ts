/**
 * Detecção de SO client-side.
 *
 * Estratégia:
 *  1. Tenta `navigator.userAgentData` (Chromium 90+).
 *  2. Fallback para parse de `navigator.userAgent`.
 *  3. Permite override via `?os=win|mac|linux-deb|linux-appimage`.
 *
 * Atualiza os CTAs principais (hero da home + DownloadHero) trocando:
 *  - `href` para o asset correto
 *  - `data-current-os` (que controla qual ícone aparece, via CSS no
 *    componente OsIconStack)
 *  - `<span data-cta-label>` com o nome do SO
 *  - elementos `[data-detected-label]` e `[data-detected-headline]`
 *
 * Sem JS, o SSR mantém o default (Windows) e o site continua funcional.
 */

type OS = 'win' | 'mac' | 'linux-deb' | 'linux-appimage' | 'unknown';

interface UADataLike {
  platform?: string;
}

function fromUaData(): OS {
  const ua = (navigator as unknown as { userAgentData?: UADataLike }).userAgentData;
  if (!ua?.platform) return 'unknown';
  const p = ua.platform.toLowerCase();
  if (p.includes('win')) return 'win';
  if (p.includes('mac')) return 'mac';
  if (p.includes('linux')) return 'linux-appimage';
  return 'unknown';
}

function fromUserAgent(): OS {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows')) return 'win';
  if (ua.includes('mac os x') || ua.includes('macintosh')) return 'mac';
  if (ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) return 'unknown';
  // AppImage cobre qualquer x86_64 sem instalar — escolha-padrão para Linux.
  if (ua.includes('linux')) return 'linux-appimage';
  return 'unknown';
}

function detectOs(): OS {
  try {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('os') as OS | null;
    if (forced && ['win', 'mac', 'linux-deb', 'linux-appimage'].includes(forced)) {
      return forced;
    }
  } catch {
    /* ignore */
  }

  const fromData = fromUaData();
  if (fromData !== 'unknown') return fromData;
  return fromUserAgent();
}

const OS_LABELS: Record<Exclude<OS, 'unknown'>, { short: string; full: string }> = {
  win: { short: 'Windows', full: 'Windows 10 / 11' },
  mac: { short: 'macOS', full: 'macOS (Intel + Apple Silicon)' },
  'linux-deb': { short: 'Linux .deb', full: 'Linux · Debian / Ubuntu' },
  'linux-appimage': { short: 'Linux AppImage', full: 'Linux · AppImage' },
};

const ASSET_FILENAME: Record<Exclude<OS, 'unknown'>, (v: string) => string> = {
  win: (v) => `Bartender_${v}_x64_pt-BR.msi`,
  mac: (v) => `Bartender_${v}_universal.dmg`,
  'linux-deb': (v) => `bartender_${v}_amd64.deb`,
  'linux-appimage': (v) => `bartender_${v}_amd64.AppImage`,
};

function getLocale(): 'en-US' | 'pt-BR' {
  const lang = document.documentElement.lang;
  return lang === 'pt-BR' ? 'pt-BR' : 'en-US';
}

function detectedLabel(locale: 'en-US' | 'pt-BR', os: Exclude<OS, 'unknown'>) {
  const t = locale === 'pt-BR'
    ? 'Detectamos {os} no seu computador.'
    : 'We detected {os} on your device.';
  return t.replace('{os}', OS_LABELS[os].full);
}

function downloadForFull(locale: 'en-US' | 'pt-BR', os: Exclude<OS, 'unknown'>) {
  const t = locale === 'pt-BR' ? 'Baixar para {os}' : 'Download for {os}';
  return t.replace('{os}', OS_LABELS[os].full);
}

function downloadForShort(locale: 'en-US' | 'pt-BR', os: Exclude<OS, 'unknown'>) {
  const t = locale === 'pt-BR' ? 'Baixar para {os}' : 'Download for {os}';
  return t.replace('{os}', OS_LABELS[os].short);
}

function currentVersion(): string {
  return (
    (window as unknown as { __BARTENDER_VERSION__?: string }).__BARTENDER_VERSION__
    ?? document.querySelector<HTMLElement>('[data-version-badge]')?.textContent?.replace(/^v/, '').trim()
    ?? '0.1.0'
  );
}

function applyToCta(
  ctaEl: HTMLAnchorElement | null,
  os: Exclude<OS, 'unknown'>,
  locale: 'en-US' | 'pt-BR',
  shortLabel: boolean,
) {
  if (!ctaEl) return;
  const version = currentVersion();
  const filename = ASSET_FILENAME[os](version);
  ctaEl.href = `https://github.com/thiagossampaio/bartender/releases/download/v${version}/${filename}`;
  ctaEl.dataset.currentOs = os;
  ctaEl.dataset.bartenderDownload = os;
  ctaEl.dataset.assetFilename = filename;
  const label = ctaEl.querySelector<HTMLElement>('[data-cta-label]');
  if (label) {
    label.textContent = shortLabel
      ? downloadForShort(locale, os)
      : downloadForFull(locale, os);
  }
}

function applyDetectedOs(os: OS) {
  if (os === 'unknown') return;
  const locale = getLocale();

  // Labels descritivos (acima e ao redor do CTA)
  const labelEl = document.querySelector<HTMLElement>('[data-detected-label]');
  const headlineEl = document.querySelector<HTMLElement>('[data-detected-headline]');
  if (labelEl) labelEl.textContent = detectedLabel(locale, os);
  if (headlineEl) headlineEl.textContent = downloadForFull(locale, os);

  // CTA primário do hero da página de Download
  applyToCta(document.querySelector<HTMLAnchorElement>('[data-detected-cta]'), os, locale, true);

  // CTA primário do hero da Home
  applyToCta(document.querySelector<HTMLAnchorElement>('[data-hero-download-cta]'), os, locale, true);
}

if (typeof window !== 'undefined') {
  const run = () => applyDetectedOs(detectOs());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}
