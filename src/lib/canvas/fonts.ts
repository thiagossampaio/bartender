/**
 * Sistema tipográfico (WP-06 / SPEC-05).
 *
 * Catálogo declarativo das fontes empacotadas no app + utilitários para mesclar
 * com as fontes do sistema (vindas do backend Rust via `fonts_list_system`).
 *
 * Decisões:
 *  - **Bundle = SIL Open Font License (OFL).** Todas as fontes deste catálogo
 *    devem ser SIL OFL ou licenças igualmente permissivas para uso comercial
 *    e redistribuição (PRD §6.4 + RF-F-02). Mantemos a `license` declarada
 *    como autodocumentação e como gatilho de validação futura.
 *  - **15 fontes mínimas** (RF-F-02). A lista abaixo cobre as 13 obrigatórias
 *    explicitadas no PRD §5.3 + duas adicionais que cobrem casos pendentes
 *    (Fira Sans para UI/SemiBold acentuado e Noto Sans Mono para tabularidade
 *    monoespaçada legível em etiquetas).
 *  - **Fallback robusto.** Cada família declara um `cssFallback` aderente ao
 *    CSS Fonts Module Level 4. Se o `.ttf` ainda não tiver sido baixado para
 *    `src/assets/fonts/` na build (caso comum em ambientes restritos), o
 *    browser cai no fallback genérico e a UI continua funcional. Isso evita
 *    "fonte fantasma" no preview.
 *  - **Preview na própria fonte** (RF-F-08). O `FontPicker` referencia
 *    `fontFamily` direto; quando o `@font-face` está presente, o nome é
 *    renderizado nela mesma. Sem cabeçalho de rede.
 */

export type FontCategory =
  | "sans-serif"
  | "serif"
  | "display"
  | "monospace"
  | "barcode";

export interface BundleFont {
  /** Nome canônico (CSS `font-family`). Deve casar com o `font-family` no `@font-face`. */
  family: string;
  /** Categoria genérica — usada para agrupar e para fallback CSS. */
  category: FontCategory;
  /** Fallback CSS aplicado quando o arquivo da fonte não estiver disponível. */
  cssFallback: string;
  /** Caminho relativo a `src/assets/fonts/` do .ttf/.woff2 esperado. */
  filename: string;
  /** Licença declarada (apenas SIL OFL ou similares permissivas para o bundle). */
  license: "SIL OFL 1.1" | "Apache 2.0";
  /** URL canônica para download (usada pelo script de bootstrap; nunca em runtime). */
  sourceUrl: string;
}

/**
 * 15 fontes empacotadas no app. A coluna `filename` é o que o `@font-face`
 * espera encontrar em `src/assets/fonts/`. Quando o arquivo está ausente,
 * o navegador apenas usa o fallback CSS — nada quebra.
 */
export const BUNDLE_FONTS: readonly BundleFont[] = [
  {
    family: "Inter",
    category: "sans-serif",
    cssFallback: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    filename: "Inter-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl:
      "https://github.com/rsms/inter/releases/latest/download/Inter.zip",
  },
  {
    family: "Roboto",
    category: "sans-serif",
    cssFallback: "system-ui, sans-serif",
    filename: "Roboto-Regular.ttf",
    license: "Apache 2.0",
    sourceUrl:
      "https://fonts.google.com/download?family=Roboto",
  },
  {
    family: "Open Sans",
    category: "sans-serif",
    cssFallback: "system-ui, sans-serif",
    filename: "OpenSans-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=Open+Sans",
  },
  {
    family: "Montserrat",
    category: "sans-serif",
    cssFallback: "system-ui, sans-serif",
    filename: "Montserrat-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=Montserrat",
  },
  {
    family: "Poppins",
    category: "sans-serif",
    cssFallback: "system-ui, sans-serif",
    filename: "Poppins-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=Poppins",
  },
  {
    family: "Lato",
    category: "sans-serif",
    cssFallback: "system-ui, sans-serif",
    filename: "Lato-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=Lato",
  },
  {
    family: "Oswald",
    category: "display",
    cssFallback: "'Impact', system-ui, sans-serif",
    filename: "Oswald-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=Oswald",
  },
  {
    family: "Bebas Neue",
    category: "display",
    cssFallback: "'Impact', system-ui, sans-serif",
    filename: "BebasNeue-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=Bebas+Neue",
  },
  {
    family: "Playfair Display",
    category: "serif",
    cssFallback: "Georgia, 'Times New Roman', serif",
    filename: "PlayfairDisplay-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=Playfair+Display",
  },
  {
    family: "Source Code Pro",
    category: "monospace",
    cssFallback: "ui-monospace, 'Cascadia Code', Menlo, monospace",
    filename: "SourceCodePro-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=Source+Code+Pro",
  },
  {
    family: "JetBrains Mono",
    category: "monospace",
    cssFallback: "ui-monospace, 'Cascadia Code', Menlo, monospace",
    filename: "JetBrainsMono-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=JetBrains+Mono",
  },
  {
    family: "Libre Barcode 39",
    category: "barcode",
    cssFallback: "monospace",
    filename: "LibreBarcode39-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=Libre+Barcode+39",
  },
  {
    family: "Libre Barcode 128",
    category: "barcode",
    cssFallback: "monospace",
    filename: "LibreBarcode128-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=Libre+Barcode+128",
  },
  {
    family: "Fira Sans",
    category: "sans-serif",
    cssFallback: "system-ui, sans-serif",
    filename: "FiraSans-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=Fira+Sans",
  },
  {
    family: "Noto Sans Mono",
    category: "monospace",
    cssFallback: "ui-monospace, 'Cascadia Code', Menlo, monospace",
    filename: "NotoSansMono-Regular.ttf",
    license: "SIL OFL 1.1",
    sourceUrl: "https://fonts.google.com/download?family=Noto+Sans+Mono",
  },
] as const;

/** Aceita um nome de família e devolve o CSS final (com fallback). */
export function fontFamilyWithFallback(family: string | undefined): string {
  if (!family) return "system-ui, -apple-system, sans-serif";
  const bundle = BUNDLE_FONTS.find((f) => f.family === family);
  if (bundle) {
    return `"${bundle.family}", ${bundle.cssFallback}`;
  }
  // Fontes do sistema — embrulhar em aspas para nomes com espaço.
  return /\s/.test(family) ? `"${family}", system-ui, sans-serif` : `${family}, system-ui, sans-serif`;
}

/** Default global usado por textos recém-criados. Inter é universal e legível. */
export const DEFAULT_FONT_FAMILY = "Inter";

/** Fontes do sistema clássicas que aparecem em todo Win/macOS. Usado como
 *  fallback quando o backend ainda não respondeu ao `fonts_list_system`. */
export const COMMON_SYSTEM_FONTS: readonly string[] = [
  "Arial",
  "Courier New",
  "Georgia",
  "Helvetica",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
];
