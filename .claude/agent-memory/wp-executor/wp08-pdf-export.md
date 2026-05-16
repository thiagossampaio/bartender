---
name: wp08-pdf-export
description: Decisões e armadilhas do pipeline de exportação PDF (WP-08), incluindo printpdf 0.7, parser SVG do bwip-js e fator de DPI da tela.
metadata:
  type: project
---

# WP-08 — Pré-visualização + Exportação PDF vetorial

## Decisões arquiteturais

- **Crate Rust:** `printpdf 0.7` com feature `embedded_images` + `image 0.24`
  (pinada para casar a versão usada internamente pelo printpdf).
- **Texto vetorial:** Helvetica builtin (Regular/Bold/Italic/BoldOblique).
  Embeddar fontes do bundle (.ttf) fica como polimento (WP-17). Trade-off:
  PDFs ficam leves e o texto é selecionável, mas glyphs especiais (acentos
  pesados em fontes serif) saem em Helvetica até embeddar.
- **Imagens:** PNG/JPEG decoded via `image` crate → `Image::try_from(decoder)`.
  Dimensões lidas via `ImageDecoder::dimensions` ANTES de consumir o decoder
  (o layout interno de `printpdf::Image` muda entre 0.7.x).
- **Barcodes/QR:** o frontend pré-renderiza via `bwip-js.toSVG()` (mesmo cache
  do editor) e anexa `renderedSvg` ao objeto. O Rust faz parser minimalista
  do SVG (regex de `<rect>`) e emite retângulos pretos vetoriais no PDF.
  Cobre 100% das simbologias 1D + QR/DataMatrix/PDF417 (todas usam apenas
  `<rect>` no bwip-js). Vantagem: barcodes vetoriais sem reimplementar
  bwip-js em Rust.

## DPI da tela (preview fiel mm-correto)

- `src/lib/preview/screen-dpi.ts` exporta `CSS_PX_PER_MM = 96/25.4 ≈ 3.78`.
- O webview do Tauri segue o padrão CSS (96 CSS px/in). `devicePixelRatio`
  só afeta `pixelRatio` do `Konva.Stage` (nitidez retina), não a proporção.
- Critério RF-P-01 ("50×30 mm aparecem com ~50×30 mm físicos") é atingido
  por construção em monitores ~96 dpi calibrados. Usuários com escala do SO
  ≠ 100% mantêm proporção correta (CSS px escala junto).

## Gotchas da printpdf 0.7

- `Rgb::new(r, g, b, icc)` espera `f32`, não `f64`. Centralizei o cast num
  helper `rgb()`/`rgb_black()`/`rgb_white()` em `src-tauri/src/pdf.rs`.
- `Point::new(Mm, Mm)` aceita Mm direto (converte para Pt internamente).
- `ImageTransform` tem `rotate` opcional cujo tipo muda entre patches —
  uso `..ImageTransform::default()` para compor de forma resistente.
- `set_outline_thickness(f64)` espera Pt (não Mm). Converti com `mm_to_pt()`.
- A origem PDF é canto **inferior** esquerdo; canvas_json usa canto
  **superior** esquerdo. Função `pdf_y(page_h, y_top, h) = page_h - y_top - h`.

## Schema de IPC (Tauri)

- Comando: `pdf_export(canvas_jsons: Vec<String>, output_path: String)`.
- Aceita 1..N páginas (já preparado para WP-13). Cada string deve ser um
  JSON `canvas_json` válido, com objetos `barcode`/`qrcode` enriquecidos
  com `renderedSvg` (string SVG). O backend ignora campos desconhecidos
  via `#[serde(default)]` + `#[serde(other)] Unknown` no enum de objetos.

## Capabilities

- Adicionei `dialog:allow-save` ao `capabilities/default.json` (apesar de
  `dialog:default` provavelmente já incluir, explicitar evita surpresa em
  Tauri 2.x versões mais novas).

## Estimativa de texto e width measurement

- Não temos AFM/TTF embarcado, então `use_text` posiciona pela baseline com
  `font_size_pt * 0.8 / 72 * 25.4` mm de descida (aproximação Helvetica).
- Alinhamento `center`/`right` usa estimativa `0.5 * font_size_pt * len`
  para largura — suficiente para etiqueta comum. Métrica precisa = backlog.
- Linhas separadas por `\n` são emitidas em baselines sequenciais com
  `line_height = font_size_pt * 1.2`. Wrap por largura não está implementado
  no PDF (o usuário típico de etiqueta usa 1 linha; quando precisa, quebra
  manualmente com `\n`).

## Frontend: pipeline de exportação

- `src/lib/pdf/export.ts` é o ponto único. Recebe `pages: PdfPage[]` e:
  1. Pré-renderiza barcodes via `renderBarcodeSvg` (cache compartilhado).
  2. Serializa via `canvasToJson` adicionando `renderedSvg` por objeto.
  3. Abre `save()` do `@tauri-apps/plugin-dialog` se não vier `outputPath`.
  4. Chama `invoke('pdf_export', { canvasJsons, outputPath })`.

- `suggestPdfFileName(name, date?)` produz `MeuTemplate_2026-05-15_1432.pdf`
  (RF-P-06). Sanitiza diacríticos via NFD + `[̀-ͯ]` (regex
  construído via `new RegExp(string, flags)` para evitar combining chars
  invisíveis no source).

## PreviewModal

- Componente em `src/components/editor/PreviewModal.tsx`. Stage Konva
  off-screen em CSS px reais (mm-correto). Navegação primeira/anterior/
  próxima/última + input "ir para nº" + ARIA "página X de Y" (aria-live).
- Atalhos do modal: ESC fecha; ←/→ ou PgUp/PgDn navegam; Home/End vão
  para primeira/última.
- O modal recebe `pages: PreviewPage[]`. Editor passa 1 página; WP-13
  passará N páginas resolvendo placeholders por linha do CSV/XLSX.
