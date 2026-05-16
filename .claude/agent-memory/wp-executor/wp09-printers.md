---
name: wp09-printers
description: Decisões e armadilhas da detecção/impressão via driver do SO (WP-09) — crate `printers` 2.x, auto-detect Argox/Zebra, comando `pdf_export_bytes`.
metadata:
  type: project
---

# WP-09 — Detecção de impressoras + impressão via Driver do SO

## Decisões arquiteturais

- **Crate Rust:** `printers = "2.0"`. Cobre Windows (Win32 Print Spooler) e
  Unix (CUPS via `lp`/`lpr`) com a mesma API. Importamos `Printer` e
  `PrinterState` de `printers::common::base::printer` — o caminho mais
  estável entre patches.
- **Auto-detect Argox/Zebra:** substring matching ASCII lowercase sobre o
  conjunto `system_name + friendly_name + driver_name`. Hints em
  `ARGOX_HINTS` / `ZEBRA_HINTS` (constantes no módulo). Argox tem precedência
  sobre Zebra em empate (improvável, mas determinístico).
- **Pipeline de impressão raster:** o frontend chama `pdf_export_bytes` →
  `printers_print_raster(printer_name, pdf_bytes, copies)`. NÃO usa
  `pdf_export` (file-based) para evitar etapa de save intermediária.
- **Cópias replicadas em N jobs:** porque drivers desktop ignoram `-#N`
  do CUPS / `pCopies` do WinSpool com frequência. Semântica equivalente
  a "imprimir N cópias".
- **Cache em `printers` table:** persistência fica no JS (`@/lib/printers.ts`)
  via `dbExecute` upsert — segue o padrão WP-03 (CRUD no JS). Backend só
  expõe comandos sem estado.

## Comandos Tauri novos

- `printers_list() -> Vec<PrinterInfo>` — DTO camelCase via serde.
- `printers_get_status(printer_name) -> PrinterStatus` — fallback `unknown`.
- `printers_print_raster(printer_name, pdf_bytes, copies) -> String` (job id).
- `pdf_export_bytes(canvas_jsons) -> Vec<u8>` (nova variante in-memory do
  `pdf_export`; reusa o pipeline `build_document` extraído do file-based).

## Schema da tabela `printers` (já existia em WP-02)

```
id INTEGER PK | system_name UNIQUE | friendly_name | model | language
default_dpi | is_default | last_used_at
```

`language` aceita `DRIVER | PPLB | ZPL` (string UPPERCASE). O frontend
faz upsert por `system_name` ao chamar `printersList()`.

## UI

- `PrintDialog` em `src/components/editor/PrintDialog.tsx`:
  - Lista de impressoras com badges Argox/Zebra + status pill.
  - Toggle "Modo nativo (PPLB/ZPL)" ligado por padrão para Argox/Zebra
    (RF-I-03); fixo "Driver do SO" para outras.
  - Input numérico de cópias (1..9999).
  - Callback `onNativeIntent` permite WP-10/WP-11 plugar o caminho raw
    sem mexer no dialog.
- Botão "Imprimir" adicionado ao header do `Editor`.

## Gotchas registradas

- `PrinterState` da crate `printers` 2.x exporta variantes `READY`,
  `PAUSED`, `PRINTING`, `UNKNOWN` (UPPERCASE). Normalizamos via
  `status_from_state(&state)` por referência — não exige `Clone`/`Copy`
  da enum nativa (que muda entre patches).
- `Printer::print(buf, Some(job_name))` retorno varia entre patches.
  Aproveitamos apenas `Ok(_)/Err(_)` e geramos job-id local via
  `Etiquetador-<epoch>-<i>` (suficiente para correlação com `print_history`).
- IPC do Tauri 2.x serializa `Uint8Array` → `Vec<u8>` automaticamente,
  mas o retorno `Vec<u8>` chega no JS como `number[]` (não Uint8Array).
  Use `Array.from()` no envio e `bytes instanceof Uint8Array ? bytes :
  Uint8Array.from(bytes)` na recepção (façade já cuida disso).

## Pendências para próximos WPs

- WP-10/WP-11 (PPLB/ZPL raw): implementar o callback `onNativeIntent`
  no PrintDialog (ou no caller) para gerar o bytecode nativo e enviar
  via `Printer::print` com o payload PPLB/ZPL em vez do PDF.
- WP-15 (histórico): integrar `printers_print_raster` com `print_history`
  table — hoje o job-id é descartado pelo Editor, só persistimos
  `printers.last_used_at`.
