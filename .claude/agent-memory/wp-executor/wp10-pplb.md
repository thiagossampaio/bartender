---
name: wp10-pplb
description: Decisões e armadilhas do tradutor canvas_json → PPLB (WP-10) — comandos PPLB, mm→dots, rotação 0/90/180/270, envio raw via printers_print_raw.
metadata:
  type: project
---

# WP-10 — Tradutor canvas_json → PPLB (Argox) + envio raw

## Decisões arquiteturais

- **Módulo único `src-tauri/src/pplb.rs`:** gerador puro (string-based)
  + comando Tauri `pplb_generate(canvas_json, copies)`. Sem dependências
  novas no `Cargo.toml` — só `serde`/`serde_json`/`thiserror` que já
  existem. O `fontdue` registrado no WP-06 fica disponível para o pipeline
  raster futuro (WP-17) — não usado no MVP, fontes custom caem em fonte
  interna como fallback graceful.
- **Envio raw:** comando novo `printers::printers_print_raw` em paralelo
  ao `printers_print_raster`. Usa o mesmo `Printer::print` da crate
  `printers` 2.x — ela já envia raw no Win32 (`RawPrintJob`) e CUPS
  (`lp -o raw`). Diferença: NÃO replica o payload por cópia, porque o
  PPLB já carrega `P<n>`. ZPL análogo embarcará `^PQ<n>` (WP-11 reusa
  o mesmo comando).
- **`print_history`:** insert best-effort em `pplbPrint` quando
  `templateId` é fornecido — `mode='raw_pplb'`. WP-15 dona o histórico
  completo; aqui só atendemos o critério do SPEC-10.

## Comandos PPLB suportados

| Tipo canvas | Comando PPLB | Notas |
|---|---|---|
| `text` | `A x,y,rot,font,h,v,N/R,"data"` | Fontes 1..5 escolhidas por `fontSize` (pt → bucket). Fonte 5 ganha multiplicador h/v ≥ 1 para sizes ≥ 30 pt. |
| `rectangle` (fill) | `LO x,y,w,h` | Preenchimento sólido. |
| `rectangle` (stroke only) | `X x,y,t,xend,yend` | Contorno. `t` em dots, mínimo 1. |
| `line` | `LO x,y,w,h` | Linha grossa horizontal/vertical (diagonal = raster futuro). |
| `barcode` (1D) | `B x,y,rot,code,narrow,wide,height,B/N,"data"` | Códigos: CODE128=`1`, CODE39=`3`, EAN13=`E30`, EAN8=`E20`, UPCA=`E80`, UPCE=`E60`, ITF=`2`, CODABAR=`K`. |
| `barcode` (QRCODE/qrcode) | `b x,y,Q,m<rot>,s<scale>,e<eclevel>,"data"` | scale = clamp(moduleWidth_mm * dpi / 25.4, 1..8). eclevel default M. |
| `barcode` (DATAMATRIX/PDF417) | `; comentário` | Placeholder (raster fica para WP-17). |
| `ellipse` | `; comentário` | Idem — PPLB não tem elipse. |
| `image` | `; comentário` | Idem — `GW` (Binary Raster) fica para WP-17. |
| Tipo desconhecido | `Unknown` (serde `#[serde(other)]`) | Tolerância graceful. |

## Envelope padrão

```
N
q<width_dots>
Q<height_dots>,24    ; gap 24 dots (3 mm) — calibração entra em WP-15
S2                   ; speed 2 ips
D8                   ; darkness padrão
... objetos ...
P<copies>
```

CRLF ao fim de cada linha (compatibilidade com firmwares Argox).

## Gotchas registradas

- **mm→dots:** `(mm * dpi / 25.4).round()`. Para 203 dpi (Argox padrão)
  isso dá 8 dots/mm exato (50 mm → 400 dots, 30 mm → 240 dots — bate
  com o exemplo do PRD §7.2).
- **Rotação:** snap por quadrante mais próximo via
  `((d + 45) / 90).floor() % 4`. Aceita negativos (normaliza para
  `[0, 360)` antes). Códigos PPLB: 0=0°, 1=90°, 2=180°, 3=270°.
- **Não-ASCII em texto:** PPLB usa CP437; UTF-8 multi-byte é
  corrompido pelo firmware. Substituímos por `?` no `escape_pplb`. O
  pipeline raster (WP-17) resolverá acentos pesados.
- **Quoting:** aspas duplas dentro do conteúdo viram `\"`; backslash
  vira `\\`. Padrão Eltron/EPL.
- **`P<n>` vs replicação no spooler:** ao chamar
  `printers_print_raw(..., copies)`, NÃO replicamos o buffer. O PPLB
  já carrega `P<copies>`. Isso é diferente do raster
  (`printers_print_raster`) que dispara N jobs porque o driver pode
  ignorar `-#N`/`pCopies`.
- **Fontes custom (fontFamily ≠ Argox):** MVP cai na fonte interna
  mais próxima e ignora a família. Pipeline raster real (`fontdue` →
  `GW`) está documentado mas fica para WP-17 sem bloquear o MVP.

## Frontend

- `src/lib/pplb.ts` — façade `pplbGenerate`, `printersPrintRaw`,
  `pplbPrint` (pipeline completo + insert em `print_history`).
- `Editor.tsx` agora passa `onNativeIntent={handleNativeIntent}` ao
  `PrintDialog`. O handler verifica `printer.language === "PPLB"` e
  chama `pplbPrint(systemName, canvasJson, copies, templateId)`. Para
  Zebra (`ZPL`) lança erro PT-BR explicativo até WP-11.
- `PrintDialog.tsx` ganhou feedback de sucesso no caminho nativo
  ("Etiqueta enviada em modo nativo (PPLB)").

## Testes

- 21 testes unitários em `pplb.rs::tests`. Cobrem: conversão mm→dots
  a 203 e 300 dpi; rotação 0/90/180/270 + negativos; escape
  (quotes/backslash/non-ASCII); envelope (q/Q/S/D/P); text com posição
  + rotação; rect filled (LO) vs stroke (X); line; CODE128 / EAN-13
  / QRCODE / `barcode` com `symbology=QRCODE`; showText=false →
  HRT N; ellipse/image → placeholder; tipo desconhecido → skip;
  cópias 0/10_000 rejeitadas; JSON inválido rejeitado; end-to-end
  com etiqueta de roupa do PRD §7.2.
- 1 teste novo em `printers.rs::tests`:
  `raw_print_rejects_empty_payload_and_invalid_copies`.

## Caminho USB direto (R01)

Documentado no header do `pplb.rs`. Se driver Argox falhar em Apple
Silicon: substituir `Printer::print` por `rusb::open(vid, pid) →
write_bulk(endpoint, bytes)`. Vendor ID Argox típico: 0x0680.
Bytecode PPLB gerado é idêntico — só muda o transporte.
