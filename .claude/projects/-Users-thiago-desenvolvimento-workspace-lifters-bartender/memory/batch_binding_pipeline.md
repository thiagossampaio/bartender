---
name: batch-binding-pipeline
description: Onde o wizard de impressão em lote resolve placeholders {{ campo }} — e o caminho que historicamente esqueceu de fazê-lo (PDF/driver).
metadata:
  type: project
---

O Wizard de Impressão em Lote (`BatchPrintWizard`) tem **quatro caminhos** de render, e cada um aplica `applyBinding` num lugar diferente. Quem mexer nesse pipeline precisa lembrar dos quatro:

1. **Preview da etapa 3** (`src/components/batch/BatchPreviewStep.tsx`): aplica no momento do render Konva, linha `applyBinding(o.content, bindingContext)`.
2. **PPLB nativo** (`src/lib/batch/runner.ts` → `materializePageObjects`): clona objetos com `content`/`value` resolvidos antes de mandar pro Rust.
3. **ZPL nativo**: igual ao PPLB.
4. **PDF / driver** (`src/lib/pdf/export.ts:buildPagePayload`): historicamente só passava `bindingContext` para `renderBarcodeSvg`. **Texto e value de barcode/qrcode não eram resolvidos** — gerava PDF com placeholders literais. Corrigido em 2026-05-18: agora aplica `applyBinding` em `text.content` e em `barcode/qrcode.value` antes de serializar o canvas_json para o backend.

**Why:** o backend Rust (`src-tauri/src/pdf.rs`) renderiza literalmente o que vem em `content`. O bwip-js (renderizado no JS) já gera SVG vetorial com placeholders resolvidos, então só barcodes saíam corretos. Diferente do PPLB/ZPL onde o backend também só recebe strings literais — por isso `materializePageObjects` existe.

**How to apply:** Se adicionar um novo destino no wizard (impressão em rede, fila, etc.), o caminho precisa aplicar binding **antes** de chamar o backend. Não confie no Rust para resolver `{{ campo }}` — ele não tem o contexto. Reuse `materializePageObjects` quando der; nos caminhos PDF, o `buildPagePayload` agora segue o mesmo padrão. Se aparecer bug de "placeholder literal no destino X", verifique primeiro se X aplica binding antes do dispatch.
