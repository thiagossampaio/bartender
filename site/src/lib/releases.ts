/**
 * Helpers para resolver os links dos assets de cada release.
 *
 * Os padrões de nome são definidos por `.github/workflows/release.yml`:
 *   Windows:        Bartender_{X.Y.Z}_x64_pt-BR.msi
 *   macOS:          Bartender_{X.Y.Z}_universal.dmg
 *   Linux .deb:     bartender_{X.Y.Z}_amd64.deb
 *   Linux AppImage: bartender_{X.Y.Z}_amd64.AppImage
 *
 * A versão atual vem do env `PUBLIC_BARTENDER_VERSION` no momento do build.
 * Em runtime, `scripts/live-version.ts` faz fetch da GitHub API e atualiza
 * todos os elementos com `data-bartender-download`.
 */

export const REPO_OWNER = 'thiagossampaio';
export const REPO_NAME = 'bartender';
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;

/**
 * Versão usada em build-time. Default `0.1.0` em dev, sobrescrita pelo
 * workflow via `PUBLIC_BARTENDER_VERSION=v0.1.2` (com ou sem `v`).
 */
export function buildTimeVersion(): string {
  const raw = (import.meta.env.PUBLIC_BARTENDER_VERSION ?? '0.1.0') as string;
  return raw.replace(/^v/, '');
}

export type OS = 'win' | 'mac' | 'linux-deb' | 'linux-appimage';

export interface DownloadAsset {
  os: OS;
  filename: (version: string) => string;
  approxSize: string;
}

export const ASSETS: Record<OS, DownloadAsset> = {
  win: {
    os: 'win',
    filename: (v) => `Bartender_${v}_x64_pt-BR.msi`,
    approxSize: '14 MB',
  },
  mac: {
    os: 'mac',
    filename: (v) => `Bartender_${v}_universal.dmg`,
    approxSize: '22 MB',
  },
  'linux-deb': {
    os: 'linux-deb',
    filename: (v) => `bartender_${v}_amd64.deb`,
    approxSize: '12 MB',
  },
  'linux-appimage': {
    os: 'linux-appimage',
    filename: (v) => `bartender_${v}_amd64.AppImage`,
    approxSize: '28 MB',
  },
};

/**
 * URL direta para baixar o asset de uma versão específica.
 */
export function assetUrl(os: OS, version: string): string {
  const v = version.replace(/^v/, '');
  return `${REPO_URL}/releases/download/v${v}/${ASSETS[os].filename(v)}`;
}

/**
 * URL "latest stable" — útil quando queremos um link estável que sempre
 * aponta para o último release publicado.
 */
export function latestAssetUrl(os: OS): string {
  return `${REPO_URL}/releases/latest/download/${ASSETS[os].filename('latest')}`;
}

export function releasesPage(): string {
  return `${REPO_URL}/releases`;
}

export function latestReleasePage(): string {
  return `${REPO_URL}/releases/latest`;
}

export function apiLatestRelease(): string {
  return `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
}

export interface DownloadCard {
  os: OS;
  label: string;
  full: string;
  notes: string;
  size: string;
  filename: string;
  href: string;
}

export function buildDownloadCards(
  version: string,
  labels: Record<OS, { short: string; full: string; notes: string }>,
): DownloadCard[] {
  return (Object.keys(ASSETS) as OS[]).map((os) => {
    const v = version.replace(/^v/, '');
    return {
      os,
      label: labels[os].short,
      full: labels[os].full,
      notes: labels[os].notes,
      size: ASSETS[os].approxSize,
      filename: ASSETS[os].filename(v),
      href: assetUrl(os, v),
    };
  });
}
