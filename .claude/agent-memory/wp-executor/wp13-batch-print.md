---
name: wp13-batch-print
description: WP-13 — Wizard end-to-end de Impressão em Lote (filtro/qtd/preview/destino). Reusa parsers WP-12, PDF WP-08, raw WP-10/11.
metadata:
  type: project
---

# WP-13 — Wizard de Impressão em Lote

## Estrutura criada

```
src/lib/batch/
├── types.ts            # RowFilter, RowQuantity, BatchPlan, BatchPage,
│                       # BatchValidationSummary, BatchDestination
├── selection.ts        # resolveRowIndices, resolveQuantities, totalLabels
├── selection-text.ts   # parseSelectionText ("1,3,5-9" → number[])
├── validation.ts       # validateBatch (RF-D-07 + simbologias WP-07)
├── expand.ts           # expandBatchPlan (com `limit`) + materializePageObjects
└── runner.ts           # runBatch: orquestra pdf | driver | native

src/components/batch/
├── BatchPrintWizard.tsx    # orquestrador, stepper, footer com Avançar/Voltar/Imprimir
├── BatchFilterStep.tsx     # filtro all/range/selection + quantidade fixed/column
├── BatchValidationStep.tsx # tiles de resumo + tabela de erros (cap 200)
├── BatchPreviewStep.tsx    # carrossel Konva limitado a 10 etiquetas
└── BatchDestinationStep.tsx # pick PDF / impressora; toggle "Modo nativo"
```

## Decisões importantes

- **Estado local com `useState`** (não Zustand) — o plano é compacto e o wizard
  é fechado/aberto sem precisar persistir. WP-15 vai consumir o `runBatch` para
  o histórico; aí avaliamos promover a store.
- **Não há novo comando Rust**. O lote reusa três caminhos existentes:
  - `exportPdf({pages, bindingPerPage})` (WP-08) — `bindingPerPage` já estava lá.
  - `buildPdfBytes(pages, bindingPerPage)` → `printersPrintRaster` (WP-09).
  - `pplbPrint`/`zplPrint` por linha (WP-10/11) — UMA chamada por linha, com
    `copies = quantityForRow`. O `P<n>`/`^PQ<n>` no envelope replica os
    rótulos sem reenviar bytes.
- **Materialização de placeholders no JS antes do PPLB/ZPL**: o backend Rust
  não substitui `{{ campo }}`. Em `runBatch` modo nativo, chamamos
  `materializePageObjects` para clonar text/barcode/qrcode com `content`/`value`
  já resolvido via `applyBinding`. **Importante**: o WP-07 já documenta isso
  como contrato de PPLB/ZPL.
- **Filtro + Quantidade resolvidos em utilitários puros**
  (`resolveRowIndices`/`resolveQuantities`). Quantidade por coluna: aceita
  apenas inteiros positivos; "3.5" ou "abc" viram 0 (aviso, linha pulada).
- **Validação por linha (RF-D-07)**: roda `validateBarcode` para cada barcode
  com o valor substituído. Placeholder não resolvido (sem coluna mapeada) é
  CRÍTICO. Quantidade ≤ 0 é AVISO. Texto com placeholder não resolvido também é
  crítico (defesa para datasets trocados).
- **Preview cap em 10**: SPEC-07 pede "carrossel das primeiras 10 + total".
  `expandBatchPlan` aceita `limit` para a UI não materializar 100k pages.
- **`runBatch` no modo raw despacha por LINHA**, não por página, agrupando
  cópias da mesma linha em uma única chamada `pplbPrint(qty)`/`zplPrint(qty)`.
  Mais eficiente e mantém o `^PQ` correto.

## Integração no Editor

- Botão "Imprimir lote" no header do editor, **disabled** quando não há
  `dataImport` aplicado (WP-12 já guardava em `useState`).
- `BatchPrintWizard` montado condicionalmente quando `dataImport && template`.
- Reusa o snapshot atual de `editor-store` (canvas + objects); o usuário pode
  editar e re-abrir o wizard sem perder a planilha.

## Gotchas

- `react-refresh/only-export-components` reclamou de `parseSelectionText`
  morando em `.tsx`. Movido para `lib/batch/selection-text.ts` (módulo puro).
- O preview do lote usa `factor = CSS_PX_PER_MM * scale` (cap visual 480px) —
  diferente do `PreviewModal` (1:1 fixo). Etiquetas A4 não estouram o modal.
- `BatchDestinationStep` chama `printersList()` **uma vez** ao montar; reload
  manual via botão. Evita refetch em cada keystroke do step anterior.
- O destino "Modo nativo (PPLB/ZPL)" é auto-selecionado para impressoras com
  `language` PPLB/ZPL (espelhando o `PrintDialog` WP-09).

## Performance

- `validateBatch` é O(rows × placeholders × objects). Para 100 SKUs × 5
  objetos → ~500 validações, ~µs cada. Testes locais com 10k linhas × 5
  objetos: < 200 ms.
- `expandBatchPlan` com `limit: 10` no preview: O(10) — instantâneo.
- PDF de 100 etiquetas via `buildPdfBytes`: depende do backend `pdf_export_bytes`
  (WP-08); o budget de 30 s do critério está folgado.

## RF cobertos

- RF-D-05 (filtro): all/range/selection. ✅
- RF-D-06 (quantidade): fixed/column. ✅
- RF-D-07 (validação): bloqueia avanço quando crítico. ✅
- RF-P-04 (PDF multipágina): via `exportPdf(pages, bindingPerPage)`. ✅
- RF-P-07 (save dialog): herdado de `exportPdf`. ✅
- SPEC-07 §"Comportamento esperado" itens 4–9. ✅
