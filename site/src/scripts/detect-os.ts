/**
 * Detecção de SO client-side.
 *
 * Estratégia:
 *  1. Tenta `navigator.userAgentData` (Chromium 90+) — caminho moderno.
 *  2. Fallback para parse de `navigator.userAgent`.
 *  3. Permite override via `?os=win|mac|linux-deb|linux-appimage`.
 *
 * Atualiza o `<DownloadHero>` com a URL correta + label do SO + ícone.
 * Sem JS habilitado, o SSR mantém o default (Windows) sem quebrar.
 */

type OS = 'win' | 'mac' | 'linux-deb' | 'linux-appimage' | 'unknown';

interface UADataLike {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ platform?: string }>;
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
  if (ua.includes('linux')) {
    // Heurística simples: distros Debian/Ubuntu são comuns, mas AppImage
    // funciona em qualquer x86_64 — preferimos AppImage como zero-install.
    return 'linux-appimage';
  }
  return 'unknown';
}

function detectOs(): OS {
  // Override por query string
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

const OS_LABELS: Record<Exclude<OS, 'unknown'>, { short: { 'en-US': string; 'pt-BR': string }; full: { 'en-US': string; 'pt-BR': string } }> = {
  win: {
    short: { 'en-US': 'Windows', 'pt-BR': 'Windows' },
    full: { 'en-US': 'Windows 10 / 11', 'pt-BR': 'Windows 10 / 11' },
  },
  mac: {
    short: { 'en-US': 'macOS', 'pt-BR': 'macOS' },
    full: { 'en-US': 'macOS (Intel + Apple Silicon)', 'pt-BR': 'macOS (Intel + Apple Silicon)' },
  },
  'linux-deb': {
    short: { 'en-US': 'Linux .deb', 'pt-BR': 'Linux .deb' },
    full: { 'en-US': 'Linux · Debian / Ubuntu', 'pt-BR': 'Linux · Debian / Ubuntu' },
  },
  'linux-appimage': {
    short: { 'en-US': 'Linux AppImage', 'pt-BR': 'Linux AppImage' },
    full: { 'en-US': 'Linux · AppImage', 'pt-BR': 'Linux · AppImage' },
  },
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
  const template = locale === 'pt-BR' ? 'Detectamos {os} no seu computador.' : 'We detected {os} on your device.';
  return template.replace('{os}', OS_LABELS[os].full[locale]);
}

function downloadFor(locale: 'en-US' | 'pt-BR', os: Exclude<OS, 'unknown'>) {
  const template = locale === 'pt-BR' ? 'Baixar para {os}' : 'Download for {os}';
  return template.replace('{os}', OS_LABELS[os].full[locale]);
}

function downloadForShort(locale: 'en-US' | 'pt-BR', os: Exclude<OS, 'unknown'>) {
  const template = locale === 'pt-BR' ? 'Baixar para {os}' : 'Download for {os}';
  return template.replace('{os}', OS_LABELS[os].short[locale]);
}

function applyDetectedOs(os: OS) {
  if (os === 'unknown') return;
  const locale = getLocale();

  const labelEl = document.querySelector<HTMLElement>('[data-detected-label]');
  const headlineEl = document.querySelector<HTMLElement>('[data-detected-headline]');
  const ctaEl = document.querySelector<HTMLAnchorElement>('[data-detected-cta]');
  const heroCta = document.querySelector<HTMLAnchorElement>('[data-hero-download-cta]');

  if (labelEl) labelEl.textContent = detectedLabel(locale, os);
  if (headlineEl) headlineEl.textContent = downloadFor(locale, os);

  const version = (window as unknown as { __BARTENDER_VERSION__?: string }).__BARTENDER_VERSION__
    ?? document.querySelector<HTMLElement>('[data-version-badge]')?.textContent?.replace(/^v/, '')
    ?? '0.1.0';
  const filename = ASSET_FILENAME[os](version);
  const repo = 'https://github.com/thiagossampaio/bartender';
  const href = `${repo}/releases/download/v${version}/${filename}`;

  if (ctaEl) {
    ctaEl.href = href;
    ctaEl.dataset.bartenderDownload = os;
    ctaEl.dataset.assetFilename = filename;
    // Replace inner text preserving icon if present
    const textNode = Array.from(ctaEl.childNodes).find(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent && n.textContent.trim().length > 0,
    );
    const txt = ' ' + downloadForShort(locale, os);
    if (textNode) {
      textNode.textContent = txt;
    } else {
      ctaEl.appendChild(document.createTextNode(txt));
    }
  }

  if (heroCta) {
    heroCta.href = href;
    heroCta.dataset.bartenderDownload = os;
    heroCta.dataset.assetFilename = filename;
    const heroText = heroCta.querySelector<HTMLElement>('[data-cta-label]');
    if (heroText) heroText.textContent = downloadForShort(locale, os);
  }
}

if (typeof window !== 'undefined') {
  const run = () => applyDetectedOs(detectOs());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}
