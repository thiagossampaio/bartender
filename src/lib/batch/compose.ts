/**
 * Composição de páginas físicas multi-coluna (WP-13.5).
 *
 * Os pipelines de impressão (PDF / driver SO / PPLB / ZPL) recebem páginas
 * **físicas** prontas — cada uma representa um "form" do rolo com até
 * `columns × rows` etiquetas trasladadas. O backend Rust e os geradores
 * raw nem sabem que existe multi-coluna: para eles é só um canvas maior.
 *
 * Decisões:
 *  - **Tradução no frontend**: `composePhysicalPages` clona os objetos com
 *    `x`/`y` deslocados por slot. Não exige nenhuma mudança no schema
 *    `canvas_json` nem no backend.
 *  - **Binding materializado por slot**: cada slot pode vir de uma linha
 *    diferente do dataset (multi-up consome as linhas em ordem). Texto e
 *    barcode/qrcode são resolvidos via `applyBinding` no momento da
 *    composição — fica consistente com o caminho PPLB/ZPL (que também
 *    materializa antes de chamar o backend).
 *  - **Background do canvas**: removemos o background na página física
 *    (cada etiqueta mantém o seu próprio se houver fundo "interno"). Evita
 *    pintar o "rolo inteiro" com a cor de fundo da etiqueta.
 *  - **IDs únicos por slot**: para o Konva no preview do wizard a chave
 *    precisa ser estável; sufixamos com `__sN` (slot N).
 */

import { applyBinding } from "@/lib/canvas/barcode";
import type {
  BarcodeObject,
  CanvasDef,
  CanvasObject,
  LayoutConfig,
  QrcodeObject,
  TextObject,
} from "@/lib/canvas/types";
import { DEFAULT_LAYOUT } from "@/lib/canvas/types";
import type { BatchPage } from "@/lib/batch/types";

export interface PhysicalSlot {
  /** Coluna e linha do slot dentro da página física (0-based). */
  column: number;
  row: number;
  /** Linha-fonte do dataset (1-based) — propagada para o `print_history`. */
  rowIndex: number;
}

export interface PhysicalPage {
  /** Canvas físico (rolo inteiro) com `width`/`height` expandidos. */
  canvas: CanvasDef;
  /** Objetos de todos os slots, com `x`/`y` já trasladados. */
  objects: CanvasObject[];
  /** Metadados dos slots — útil para preview, registro de histórico, etc. */
  slots: PhysicalSlot[];
}

/**
 * Composição multi-coluna. Recebe páginas lógicas (1 etiqueta cada) e o
 * `LayoutConfig` do template; devolve páginas físicas onde cada uma comporta
 * `columns × rows` etiquetas trasladadas.
 *
 * Quando `layout` é o default (1×1, sem gap), o resultado é uma página
 * física por página lógica — pipeline equivalente ao pré-WP-13.5. Caller
 * pode pular `compose` nesse caso, mas a versão default-passthrough é
 * barata o suficiente para não precisar de fast-path.
 */
export function composePhysicalPages(
  logicalPages: BatchPage[],
  layout: LayoutConfig | undefined,
): PhysicalPage[] {
  const cfg = normalizeLayout(layout);
  const perPage = cfg.columns * cfg.rows;
  if (logicalPages.length === 0) return [];
  const first = logicalPages[0];
  const labelW = first.canvas.width;
  const labelH = first.canvas.height;
  // Largura/altura do rolo "página": colunas × largura + (colunas-1) × gap.
  const physicalW = labelW * cfg.columns + cfg.gapX * (cfg.columns - 1);
  const physicalH = labelH * cfg.rows + cfg.gapY * (cfg.rows - 1);

  const physicalCanvas: CanvasDef = {
    width: round3(physicalW),
    height: round3(physicalH),
    dpi: first.canvas.dpi,
    // Sem layout aninhado para a página física — ela é uma "etiqueta única".
  };

  const result: PhysicalPage[] = [];
  for (let i = 0; i < logicalPages.length; i += perPage) {
    const chunk = logicalPages.slice(i, i + perPage);
    const objects: CanvasObject[] = [];
    const slots: PhysicalSlot[] = [];
    for (let s = 0; s < chunk.length; s += 1) {
      const col = s % cfg.columns;
      const row = Math.floor(s / cfg.columns);
      const dx = col * (labelW + cfg.gapX);
      const dy = row * (labelH + cfg.gapY);
      const page = chunk[s];
      for (const obj of page.objects) {
        objects.push(translateAndBind(obj, dx, dy, page.bindingContext, s));
      }
      slots.push({ column: col, row, rowIndex: page.rowIndex });
    }
    result.push({ canvas: physicalCanvas, objects, slots });
  }
  return result;
}

/** Coerção defensiva para um `LayoutConfig` válido. */
export function normalizeLayout(
  layout: LayoutConfig | undefined,
): LayoutConfig {
  if (!layout) return DEFAULT_LAYOUT;
  return {
    columns: Math.max(1, Math.round(layout.columns) || 1),
    rows: Math.max(1, Math.round(layout.rows) || 1),
    gapX: Math.max(0, Number.isFinite(layout.gapX) ? layout.gapX : 0),
    gapY: Math.max(0, Number.isFinite(layout.gapY) ? layout.gapY : 0),
  };
}

/** Translada o objeto por (dx, dy) e aplica o binding em campos textuais.
 *  Ids ficam sufixados com `__sN` para preservar unicidade entre slots. */
function translateAndBind(
  obj: CanvasObject,
  dx: number,
  dy: number,
  ctx: Record<string, string>,
  slotIdx: number,
): CanvasObject {
  const id = `${obj.id}__s${slotIdx}`;
  const base = { ...obj, id, x: obj.x + dx, y: obj.y + dy };
  if (obj.type === "text") {
    const t = base as TextObject;
    return { ...t, content: applyBinding(t.content ?? "", ctx) };
  }
  if (obj.type === "barcode") {
    const b = base as BarcodeObject;
    return { ...b, value: applyBinding(b.value ?? "", ctx) };
  }
  if (obj.type === "qrcode") {
    const q = base as QrcodeObject;
    return { ...q, value: applyBinding(q.value ?? "", ctx) };
  }
  return base;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
