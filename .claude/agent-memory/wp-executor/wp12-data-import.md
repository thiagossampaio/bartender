---
name: wp12-data-import
description: WP-12 — Importação CSV/XLSX + UI mapeamento de placeholders. Parsers no frontend, leitura via comando Rust.
metadata:
  type: project
---

# WP-12 — Importação CSV/XLSX

## Stack adicionada

- `papaparse` 5.x + `@types/papaparse` — parser CSV com `header: true` e
  `skipEmptyLines: 'greedy'`. Auto-detecção `,` vs `;` é nossa (`detectCsvDelimiter`),
  não a heurística do papaparse, porque queremos garantia de RF-D-01.
- `xlsx` 0.18 (SheetJS community). Lê XLSX/XLSM com `cellDates: true` e converte
  via `sheet_to_json({ header: 1, raw: false })` para preservar coluna por
  posição (não pula células vazias do cabeçalho).
  - **Risco conhecido**: este pacote tem CVE de prototype pollution e ReDoS
    (npm audit `high` severity). Como o app é offline-first e os arquivos vêm
    do disco do próprio usuário (não da internet), o risco é limitado. Substituir
    por `exceljs` é um polimento futuro se virar bloqueador.

## Estrutura criada

```
src/lib/data/
├── placeholders.ts   # extrai {{ campo }} de canvas_json (text/barcode/qrcode + binding)
├── parsers.ts        # parseCsvText, parseXlsxBytes, parseDataFile (lê via Tauri)
└── mapping.ts        # ColumnMapping, autoMatchMapping (case-insensitive)

src/components/data/
├── DataImportDialog.tsx   # wizard completo (file pick → preview → mapping)
├── PreviewTable.tsx       # tabela paginada (50 linhas/página default)
└── MappingPanel.tsx       # lista placeholders × select de colunas

src-tauri/src/data_source.rs   # comando data_source_read: lê bytes do disco
```

## Decisões importantes

- **Leitura de arquivo via comando Rust dedicado** (`data_source_read`),
  NÃO via `@tauri-apps/plugin-fs`. Motivo: o plugin-fs 2.x exige scope explícito
  por path no `capabilities/default.json`; declarar scope amplo enfraqueceria
  defense-in-depth. O comando Rust valida extensão (csv/txt/xlsx/xlsm) e teto
  de 32 MB antes de ler. **Apenas `dialog:allow-open` foi adicionado às
  capabilities** — sem novas permissões fs.
- **Auto-match de mapeamento**: normaliza (trim, lowercase, remove
  `[\s_\-.]+`); placeholder `{{ produto }}` casa com coluna "Produto",
  "produto", "PRODUTO".
- **Placeholders varridos**:
  1. `binding.field` explícito (todos os tipos que aceitam binding).
  2. Regex `\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}` no `content` (text) e `value`
     (barcode/qrcode). Mesma regex de `lib/canvas/barcode.ts` —
     intencionalmente duplicada para isolamento, mas mantida sincronizada.
- **Resultado do dialog (DataImportResult)** é guardado em state local do
  `Editor.tsx`. WP-13 vai promover isso a store global quando o
  `BatchPrintWizard` for cabeado.
- **Salvar mapeamento no template (RF-D-08)** ficou fora do MVP — Could/risco
  R10. O dialog aceita um `initial` para reabrir com o último mapeamento da
  sessão, mas nada persiste no banco.

## Allowlist do audit-bundle expandida

Adicionadas: `github.com/mholt/PapaParse`, `purl.oclc.org/...`,
`schemas.microsoft.com/...`, `schemas.openxmlformats.org/...`, `sheetjs.com`,
`sheetjs.openxmlformats.org`. Todas são XMLNS/identificadores OOXML ou URLs
de projeto impressas em strings literais — nunca fetchadas.

## Gotchas

- O xlsx package na importação ESM funciona como `import * as XLSX from 'xlsx'`
  (CommonJS module wrapped). Não confundir com o subpath `xlsx/dist/xlsx.mini.min.js`.
- `sheet_to_json` com `{ header: 1 }` retorna `unknown[][]` (matriz). Iterar é
  mais preciso que `{ header: 'A' }` porque preserva colunas vazias do header.
- Datas: `cellDates: true` faz cells de data virarem `Date` JS; convertemos para
  ISO no `cellToString`.
- O `papaparse` 5.x exporta como default — `import Papa from "papaparse"`.
  TypeScript exige `@types/papaparse` em devDependencies.
- `PreviewTable` usa `event.preventDefault` nada — paginação é click + state
  controlado externamente para o dialog poder resetar quando troca de arquivo.
