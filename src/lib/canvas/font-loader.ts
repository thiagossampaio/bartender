/**
 * Registro dinâmico de @font-face para o bundle (WP-06 / SPEC-05).
 *
 * Em vez de declarar `@font-face` estaticamente em CSS — o que faria o Vite
 * tentar resolver URLs de arquivos que podem não existir no checkout local
 * (vide src/assets/fonts/README.md) — usamos `import.meta.glob` para
 * **descobrir** os `.ttf`/`.woff2` realmente presentes em build time e
 * registramos cada um via [`FontFace`](https://developer.mozilla.org/docs/Web/API/FontFace)
 * em runtime.
 *
 * Benefícios:
 *  - Build não falha por arquivo ausente; o glob simplesmente devolve `{}`.
 *  - Mantém o critério offline-first: o glob é resolvido pelo Vite e os
 *    bytes da fonte entram no `dist/assets/`. Nenhuma requisição de rede.
 *  - O fallback CSS (`fontFamilyWithFallback`) cobre famílias ausentes sem
 *    quebrar a UI.
 */

import { BUNDLE_FONTS } from "@/lib/canvas/fonts";

/**
 * Eager glob — Vite resolve em build time. Cada chave é o caminho relativo,
 * cada valor é a URL final (string) do arquivo no bundle. Quando o arquivo
 * não existe no diretório, ele simplesmente não aparece no map.
 */
const FONT_URLS = import.meta.glob<string>(
  "/src/assets/fonts/*.{ttf,otf,woff,woff2}",
  { eager: true, query: "?url", import: "default" },
);

let registered = false;

/**
 * Carrega no `document.fonts` cada arquivo presente em `src/assets/fonts/`
 * que case com uma família declarada em `BUNDLE_FONTS`. Idempotente — só
 * registra uma vez por sessão.
 *
 * Falhas individuais (`fontFace.load()` rejeita) são absorvidas: o usuário
 * verá o fallback CSS na UI; logamos um aviso para diagnóstico.
 */
export async function registerBundleFonts(): Promise<void> {
  if (registered) return;
  registered = true;

  // Mapa de filename → URL final. Chave normalizada para basename.
  const byFilename = new Map<string, string>();
  for (const [key, url] of Object.entries(FONT_URLS)) {
    const basename = key.split("/").pop();
    if (basename) byFilename.set(basename, url);
  }

  await Promise.all(
    BUNDLE_FONTS.map(async (font) => {
      const url = byFilename.get(font.filename);
      if (!url) return; // arquivo ausente — fallback CSS assumirá.
      try {
        const face = new FontFace(font.family, `url(${url})`);
        await face.load();
        document.fonts.add(face);
      } catch (err) {
        // Vite pode ter copiado um arquivo corrompido; não derrubar o app.
        console.warn(`[fonts] Falha ao carregar ${font.filename}`, err);
      }
    }),
  );
}

/** True quando o arquivo da família existe no bundle. */
export function isBundleFontAvailable(family: string): boolean {
  const font = BUNDLE_FONTS.find((f) => f.family === family);
  if (!font) return false;
  return Object.keys(FONT_URLS).some((k) => k.endsWith(`/${font.filename}`));
}
