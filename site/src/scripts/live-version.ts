/**
 * Live-version: faz uma única chamada à GitHub API para descobrir a tag da
 * última release publicada e, se for diferente da versão embutida em
 * build-time, atualiza os hrefs dos elementos `[data-bartender-download]`
 * e o badge `[data-version-badge]`.
 *
 * Falha silenciosa: se a API retornar erro (rate-limit, offline), o site
 * segue usando os links de build-time renderizados pelo SSR.
 */

const API = 'https://api.github.com/repos/thiagossampaio/bartender/releases/latest';
const REPO = 'https://github.com/thiagossampaio/bartender';

type OS = 'win' | 'mac' | 'linux-deb' | 'linux-appimage';

const ASSET_FILENAME: Record<OS, (v: string) => string> = {
  win: (v) => `Bartender_${v}_x64_pt-BR.msi`,
  mac: (v) => `Bartender_${v}_universal.dmg`,
  'linux-deb': (v) => `bartender_${v}_amd64.deb`,
  'linux-appimage': (v) => `bartender_${v}_amd64.AppImage`,
};

function currentBuildVersion(): string {
  const badge = document.querySelector<HTMLElement>('[data-version-badge]');
  const text = badge?.textContent?.trim() ?? '';
  return text.replace(/^v/, '') || '0.1.0';
}

function applyVersion(latest: string) {
  const cleaned = latest.replace(/^v/, '');
  (window as unknown as { __BARTENDER_VERSION__?: string }).__BARTENDER_VERSION__ = cleaned;

  const badges = document.querySelectorAll<HTMLElement>('[data-version-badge]');
  badges.forEach((b) => {
    b.textContent = `v${cleaned}`;
  });

  const links = document.querySelectorAll<HTMLAnchorElement>('[data-bartender-download]');
  links.forEach((a) => {
    const os = a.dataset.bartenderDownload as OS | undefined;
    if (!os || !(os in ASSET_FILENAME)) return;
    const filename = ASSET_FILENAME[os](cleaned);
    a.href = `${REPO}/releases/download/v${cleaned}/${filename}`;
    a.dataset.assetFilename = filename;
    // Atualiza o <code> com o filename, se existir como irmão
    const card = a.closest('[data-os]');
    if (card) {
      const codeEl = card.querySelector('code');
      if (codeEl) codeEl.textContent = filename;
    }
  });
}

async function fetchLatest() {
  try {
    const res = await fetch(API, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'default',
    });
    if (!res.ok) return;
    const data = (await res.json()) as { tag_name?: string };
    const tag = data?.tag_name;
    if (!tag) return;
    const cleaned = tag.replace(/^v/, '');
    if (cleaned !== currentBuildVersion()) {
      applyVersion(tag);
    }
  } catch {
    /* silencioso — fica no build-time fallback */
  }
}

if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void })
      .requestIdleCallback(fetchLatest);
  } else {
    setTimeout(fetchLatest, 1200);
  }
}
