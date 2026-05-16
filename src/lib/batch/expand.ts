/**
 * Expansão do plano de lote em páginas (WP-13 / SPEC-07).
 *
 * Converte `{filter, quantity, dataset, mapping, canvas, objects}` em uma
 * lista plana de `BatchPage`. Páginas são consumidas por:
 *  - **Preview do lote** (carrossel das primeiras N).
 *  - **PDF** — `buildPdfBytes(pages, bindingPerPage)`.
 *  - **Driver do SO** — mesmo PDF que o caso preview/PDF.
 *  - **Raw PPLB/ZPL** — `pplbPrint`/`zplPrint` recebe `canvasJson` com os
 *    placeholders **já substituídos** pelo binding (o backend Rust não
 *    aplica binding; cabe à UI passar valores literais).
 *
 * Decisões:
 *  - **Substituição apenas no `text.content` / `barcode.value` / `qrcode.value`**:
 *    binding declarativo (`obj.binding.field`) é resolvido como
 *    `content/value = ctx[field]` quando `content/value` for vazio — atende
 *    RF-B-08.
 *  - **`bindingContext` mantido no `BatchPage`**: para o preview e PDF, que
 *    aplicam binding via `applyBinding` nos seus próprios renderers (não
 *    pré-substituem). Para PPLB/ZPL, geramos um clone com strings
 *    literais via `materializePageObjects`.
 *  - **Truncamento opcional** (`limit`): preview do wizard mostra só as
 *    primeiras 10 etiquetas (PRD §9.2). O caller passa `limit: 10` para
 *    economizar memória; PDF/raw passam `undefined` para expandir tudo.
 */

import { applyBinding } from "@/lib/canvas/barcode";
import type {
  BarcodeObject,
  CanvasObject,
  QrcodeObject,
  TextObject,
} from "@/lib/canvas/types";
import type { BatchPage, BatchPlan } from "@/lib/batch/types";
import {
  resolveQuantities,
  resolveRowIndices,
} from "@/lib/batch/selection";
import { buildBindingContext } from "@/lib/data/placeholders";

/** Limite máximo de páginas geradas (defesa contra plano inválido). */
const HARD_LIMIT = 50_000;

/**
 * Expande o plano em páginas. Retorna também os índices de linha e
 * quantidades resolvidos para a UI poder mostrar contagens consistentes.
 */
export function expandBatchPlan(
  plan: BatchPlan,
  options?: { limit?: number },
): {
  pages: BatchPage[];
  rowIndices: number[];
  quantities: number[];
  total: number;
} {
  const rowIndices = resolveRowIndices(plan.dataset, plan.filter);
  const quantities = resolveQuantities(plan.dataset, rowIndices, plan.quantity);

  let total = 0;
  for (const q of quantities) total += q;

  const cap = Math.min(
    options?.limit ?? HARD_LIMIT,
    HARD_LIMIT,
  );

  const pages: BatchPage[] = [];
  outer: for (let i = 0; i < rowIndices.length; i += 1) {
    const idx = rowIndices[i];
    const qty = quantities[i] ?? 0;
    if (qty <= 0) continue;
    const row = plan.dataset.rows[idx - 1];
    if (!row) continue;
    const ctx = buildBindingContext(row, plan.mapping);
    for (let c = 0; c < qty; c += 1) {
      pages.push({
        canvas: plan.canvas,
        objects: plan.objects,
        bindingContext: ctx,
        rowIndex: idx,
      });
      if (pages.length >= cap) break outer;
    }
  }

  return { pages, rowIndices, quantities, total };
}

/**
 * Aplica o binding e devolve um clone dos objetos com strings literais —
 * usado pelo pipeline PPLB/ZPL, que **não** roda `applyBinding` no backend.
 * Texto, barcode e qrcode trocam `content`/`value` pelo valor resolvido.
 * Demais tipos passam por referência.
 */
export function materializePageObjects(page: BatchPage): CanvasObject[] {
  return page.objects.map((obj): CanvasObject => {
    if (obj.type === "text") {
      const t = obj as TextObject;
      const content = applyBinding(t.content ?? "", page.bindingContext);
      return { ...t, content };
    }
    if (obj.type === "barcode") {
      const b = obj as BarcodeObject;
      const value = applyBinding(b.value ?? "", page.bindingContext);
      return { ...b, value };
    }
    if (obj.type === "qrcode") {
      const q = obj as QrcodeObject;
      const value = applyBinding(q.value ?? "", page.bindingContext);
      return { ...q, value };
    }
    return obj;
  });
}
