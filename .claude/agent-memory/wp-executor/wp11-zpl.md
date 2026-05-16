---
name: wp11-zpl
description: Decisões e armadilhas do tradutor canvas_json → ZPL (WP-11) — comandos ZPL II Link-OS, escape de ^ e ~, rotação NRIB, envio raw compartilhado com PPLB.
metadata:
  type: project
---

# WP-11 — Tradutor canvas_json → ZPL (Zebra) + envio raw

## Decisões arquiteturais

- **Módulo único `src-tauri/src/zpl.rs`:** estrutura espelhada do
  `pplb.rs` (WP-10) — gerador puro string-based + comando Tauri
  `zpl_generate(canvas_json, copies)`. **Sem `zpl-rs`** apesar da
  sugestão do work-plan: escrever manualmente garante controle total
  sobre escape (`^`/`~`) e mantém o pacote offline-first sem
  introduzir dependência opaca. O work-plan diz "quando aplicável"
  — não aplicou.
- **Envio raw reaproveitado:** `printersPrintRaw` (importado de
  `@/lib/pplb`) é a façade compartilhada. ZPL embarca `^PQ<n>` no
  rodapé, igual ao PPLB com `P<n>`, então o `copies` NÃO é replicado
  no spooler.
- **`print_history`:** insert best-effort em `zplPrint` quando
  `templateId` é fornecido — `mode='raw_zpl'`. Mesma forma do PPLB
  (WP-15 dona o histórico completo).
- **Roteamento no `Editor.tsx`:** `handleNativeIntent` agora roteia
  por `printer.language`: `PPLB` → `pplbPrint`, `ZPL` → `zplPrint`,
  outros lançam erro PT-BR.

## Comandos ZPL suportados

| Tipo canvas | Comando ZPL | Notas |
|---|---|---|
| `text` | `^FO x,y ^A0<rot>,h,w ^FD<data>^FS` | Fonte `A0` escalável; h = `round(pt * dpi / 72)`, clamp 10..2000. Fontes custom caem em `A0` (raster fica para WP-17). |
| `rectangle` (fill) | `^FO x,y ^GB w,h,min(w,h),B,0^FS` | thickness = min(w,h) → caixa sólida. |
| `rectangle` (stroke) | `^FO x,y ^GB w,h,t,B,0^FS` | `t` = strokeWidth em dots, mínimo 1. |
| `line` | `^FO x,y ^GB w,h,t,B,0^FS` | Mesmo `^GB`; diagonal não é suportada (raster futuro). |
| `ellipse` (w==h) | `^FO x,y ^GC<d>,<t>,B^FS` | Círculo. |
| `ellipse` (w≠h) | `^FO x,y ^GE<w>,<h>,<t>,B^FS` | Elipse Zebra Link-OS §GE. |
| `barcode` (1D) | `^BY<narrow>\n^FO x,y ^B<cmd><rot>,h,Y/N,N^FD<data>^FS` | Códigos: CODE128=`BC`, CODE39=`B3`*, EAN-13=`BE`, EAN-8=`B8`, UPC-A=`BU`, UPC-E=`B9`, ITF=`BI`, Codabar=`BK`*. *CODE39/Codabar têm posição de `check` no comando: `^B3<rot>,N,h,Y,N`. |
| `barcode` QRCODE / `qrcode` | `^FO x,y ^BQ<rot>,2,<scale>,<ecl>,7^FD<ecl>A,<data>^FS` | Modelo 2 padrão. ecl repetido no FD + `A` (auto) é a forma recomendada do Programming Guide. |
| `barcode` DATAMATRIX | `^FO x,y ^BX<rot>,<module>,200^FD<data>^FS` | Quality 200 (ECC default). |
| `barcode` PDF417 | `^FO x,y ^B7<rot>,<row_h>,<sec>,,,N^FD<data>^FS` | Security 1/3/5/8 ↔ L/M/Q/H. |
| `image` | `^FX comentário ^FS` | Placeholder; `^GF` raster fica para WP-17. |
| Tipo desconhecido | (skip) | Tolerância graceful — paridade com PPLB. |

## Envelope padrão

```
^XA
^CI28          ; UTF-8 em firmwares modernos (ignorado em legacy)
^LH0,0         ; label home alinhado ao canvas_json
^PW<width_dots>
^LL<height_dots>
... objetos ...
^PQ<copies>
^XZ
```

LF puro como separador (Programming Guide §1.3 — alguns firmwares
aceitam CRLF mas LF é o padrão).

## Gotchas registradas

- **Escape obrigatório de `^` e `~`:** são caracteres de comando do
  parser ZPL. `escape_zpl` substitui ambos por `_`. **Não** existe
  escape oficial via backslash — alternativa robusta seria
  `^FH^_HH` (hex), fica para WP-17 quando o raster ganhar UTF-8
  nativo.
- **Não-ASCII:** substituído por `?`. `^CI28` está no envelope mas
  firmwares ZD220 antigos ignoram — ser conservador (paridade PPLB).
- **CODE39 / Codabar têm ordem de argumentos diferente:** `^B3` e
  `^BK` posicionam o `check digit` ANTES da altura (`^B3<rot>,<chk>,
  <h>,<interp>,<above>`). Os demais (`BC`, `BE`, `B8`, `BU`, `B9`,
  `BI`) seguem `<rot>,<h>,<interp>,<above>,[<chk>]`. Tratado por
  `match cmd { "B3" | "BK" => ... }`.
- **`^GC` aceita só diâmetro:** quando `width ≈ height` usamos
  círculo (`^GC<d>,<t>,B`); senão `^GE<w>,<h>,<t>,B`.
- **`^BY<n>` precede o `^B*`:** define largura do módulo em dots
  para barcodes 1D. Emitido antes de cada barcode quando o usuário
  define `moduleWidth`.
- **Rotação:** snap por quadrante (mesma fórmula do PPLB) →
  N/R/I/B. Códigos: 0°=N, 90°=R, 180°=I, 270°=B.
- **QR Code FD payload:** ZPL exige `^FD<ecl>A,<data>` (ex.:
  `^FDHA,https://...`). O `<ecl>` aparece DUAS vezes (no `^BQ` e no
  `^FD`) — não é redundância, é a sintaxe oficial §BQ.
- **`^FO` é absoluto (não relativo a label home):** `^LH0,0` no
  envelope garante coordenadas idênticas às do canvas_json (origem
  no canto superior esquerdo).

## Frontend

- `src/lib/zpl.ts` — façade `zplGenerate` e `zplPrint` (pipeline
  completo + insert em `print_history` com `mode='raw_zpl'`).
  Reusa `printersPrintRaw` exportado de `@/lib/pplb`.
- `Editor.tsx` — `handleNativeIntent` roteia por `language`. O
  `PrintDialog.tsx` já mostrava mensagem genérica "Modo nativo
  (PPLB/ZPL)" — funcionou sem alteração porque o feedback de
  sucesso usa `selected.language` dinamicamente.

## Testes

- 30 testes unitários em `zpl.rs::tests`. Cobrem: mm→dots a 203 e
  300 dpi; rotação N/R/I/B + negativos + snap; escape (caret/tilde/
  non-ASCII); envelope (^XA/^PW/^LL/^PQ/^XZ + ^CI28 + ^LH0,0);
  text com posição + rotação (N/R/I/B); rect filled vs stroke;
  line; ellipse círculo (^GC) vs elipse (^GE); CODE128 (^BC),
  EAN-13 (^BE) com altura 80, CODE39 (^B3 ordem invertida),
  QRCODE (^BQ via `qrcode` e via `barcode` com symbology=QRCODE),
  DATAMATRIX (^BX), PDF417 (^B7 com security mapeada); showText=false
  → HRT N; image → placeholder ^FX; tipo desconhecido → skip;
  cópias 0/10_000 rejeitadas; JSON inválido rejeitado;
  `font_height_dots` clamp 10..2000; `qr_scale` clamp 1..10;
  `map_zpl_1d_cmd` sanity check todas as simbologias; caret no
  conteúdo de texto vira `_`; end-to-end com etiqueta de roupa do
  PRD §7.2 (versão ZPL).

## Validações executadas

- `npm run typecheck` ✓
- `npm run lint` ✓ (apenas warning pré-existente em `button.tsx`)
- `npm run build` ✓ (vite 2.0s)
- `cargo test` SKIP — cargo não instalado no host (documentado em
  `validation.md`). Testes Rust validados por inspeção manual de
  cada assertion contra a saída esperada do generator.

## Caminho USB direto (R01)

Idem PPLB — bytecode ZPL gerado é ASCII puro, então o transporte
pode ser substituído por `rusb::open(vid, pid) → write_bulk(...)`
sem mexer no gerador. Zebra USB Vendor ID típico: 0x0A5F.
