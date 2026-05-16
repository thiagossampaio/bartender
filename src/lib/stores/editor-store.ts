/**
 * Editor store (WP-04 / SPEC-04 + WP-05).
 *
 * Estado do editor de layout. Concentra:
 *  - `template` em edição (linha de `templates` carregada do banco).
 *  - `canvas` (dimensões/dpi/background) + `objects[]`.
 *  - Seleção (multi).
 *  - Zoom (níveis fixos, RF-E-04).
 *  - Grid (1 ou 5 mm) + snap on/off (RF-E-03).
 *  - Flag `dirty` para o indicador `•` no título (RF-E-19).
 *  - **Histórico undo/redo** (WP-05 / RF-E-17): ring buffer de até 50 estados
 *    com snapshots de `{canvas, objects, selectedIds}`. Pilhas `past[]` e
 *    `future[]`; mutações commitam um snapshot ANTES de mudar o estado, e
 *    limpam `future`. O save NÃO altera o histórico (só zera `dirty`).
 *  - **Clipboard interno** (WP-05): cópia/colagem dentro do app (não usa
 *    `navigator.clipboard` pois não trafega texto formatado — guarda os objetos
 *    no próprio store, suficiente para copy/cut/paste entre templates abertos
 *    na mesma sessão).
 *
 * Decisões:
 *  - Operação `commit*` define o invariant: toda mutação que altera o conteúdo
 *    do canvas marca `dirty = true` E empilha um snapshot em `past`. Mudanças
 *    de visualização (zoom, grid) NÃO marcam `dirty` nem alteram histórico.
 *  - O store NÃO chama o banco. O wrapper UI (página `Editor`) é quem decide
 *    quando persistir. Assim o store fica fácil de testar / reusar no preview.
 *  - O snapshot é raso (spread) — objetos imutáveis são compartilhados entre
 *    snapshots, então o custo de memória cresce com mutações, não com tamanho
 *    do canvas. 50 estados × ~poucos KB cada = sub-MB típico.
 */

import { create } from "zustand";

import type { CanvasDef, CanvasObject } from "@/lib/canvas/types";
import { roundMm } from "@/lib/canvas/units";
import {
  canvasToJsonString,
  generateId,
  jsonToCanvas,
} from "@/lib/canvas/serializer";
import type { TemplateRow } from "@/lib/templates";

export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4] as const;

/** Tamanho máximo do histórico undo/redo (RF-E-17 exige ≥ 50). */
export const HISTORY_LIMIT = 50;

export type GridSize = 1 | 5;

export type AlignDirection =
  | "left"
  | "center-horizontal"
  | "right"
  | "top"
  | "middle-vertical"
  | "bottom";

export type DistributeDirection = "horizontal" | "vertical";

/** Snapshot mínimo persistido no histórico. */
interface HistorySnapshot {
  canvas: CanvasDef;
  objects: CanvasObject[];
  selectedIds: string[];
}

interface EditorState {
  /** Template carregado (do banco). `null` quando nenhum editor está aberto. */
  template: TemplateRow | null;
  canvas: CanvasDef;
  objects: CanvasObject[];
  /** IDs selecionados (multi-select). Ordem reflete a ordem de clique. */
  selectedIds: string[];
  /** Nível de zoom (multiplicador). */
  zoom: number;
  grid: GridSize;
  snapEnabled: boolean;
  /** True quando houve mutação desde o último `markSaved()`. */
  dirty: boolean;

  /** Pilha de estados anteriores (mais recente na cauda). */
  past: HistorySnapshot[];
  /** Pilha de estados refeitos (para Ctrl/⌘+Shift+Z). */
  future: HistorySnapshot[];

  /** Buffer de objetos copiados/cortados (sessão atual). */
  clipboard: CanvasObject[];

  // --- Lifecycle ---
  loadTemplate: (template: TemplateRow, canvasJson: string | null) => void;
  closeTemplate: () => void;
  markSaved: () => void;

  // --- Histórico (WP-05) ---
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // --- Clipboard (WP-05) ---
  copySelected: () => void;
  cutSelected: () => void;
  pasteFromClipboard: () => void;

  // --- Viewport ---
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setGrid: (grid: GridSize) => void;
  toggleSnap: () => void;

  // --- Canvas ---
  setBackgroundColor: (color: string) => void;

  // --- Objetos ---
  addObject: (object: CanvasObject) => void;
  updateObject: (id: string, patch: Partial<CanvasObject>) => void;
  updateSelectedObjects: (patch: Partial<CanvasObject>) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  bringToFront: () => void;
  sendToBack: () => void;

  // --- Seleção ---
  selectOnly: (id: string | null) => void;
  toggleSelect: (id: string) => void;
  selectMany: (ids: string[]) => void;
  clearSelection: () => void;

  // --- Movimento por teclado ---
  nudgeSelected: (dx: number, dy: number) => void;

  // --- Alinhar / Distribuir ---
  alignSelected: (direction: AlignDirection) => void;
  distributeSelected: (direction: DistributeDirection) => void;

  // --- Serialização ---
  toJsonString: () => string;
}

/** Canvas vazio quando nenhum template está aberto (não usado, apenas defaultes seguros). */
const EMPTY_CANVAS: CanvasDef = {
  width: 50,
  height: 30,
  dpi: 203,
  background: "#FFFFFF",
};

function bboxOf(obj: CanvasObject): { x: number; y: number; w: number; h: number } {
  // Largura/altura podem ser indefinidos para line; usamos 0 como fallback —
  // alinhar/distribuir só faz sentido para objetos com bounding box conhecido.
  const w = obj.width ?? 0;
  const h = obj.height ?? 0;
  return { x: obj.x, y: obj.y, w, h };
}

/** Tira um snapshot raso do estado relevante para o histórico. */
function snapshotOf(state: {
  canvas: CanvasDef;
  objects: CanvasObject[];
  selectedIds: string[];
}): HistorySnapshot {
  return {
    canvas: { ...state.canvas },
    objects: state.objects,
    selectedIds: state.selectedIds,
  };
}

/**
 * Empilha o estado atual no histórico antes de uma mutação. Limita a pilha em
 * `HISTORY_LIMIT` descartando o mais antigo (cabeça). Limpa `future` porque
 * qualquer nova mutação invalida o caminho de redo.
 */
function pushHistory(state: {
  past: HistorySnapshot[];
  canvas: CanvasDef;
  objects: CanvasObject[];
  selectedIds: string[];
}): HistorySnapshot[] {
  const next = [...state.past, snapshotOf(state)];
  if (next.length > HISTORY_LIMIT) next.shift();
  return next;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  template: null,
  canvas: EMPTY_CANVAS,
  objects: [],
  selectedIds: [],
  zoom: 1,
  grid: 1,
  snapEnabled: true,
  dirty: false,
  past: [],
  future: [],
  clipboard: [],

  loadTemplate: (template, canvasJson) => {
    const fallback: CanvasDef = {
      width: template.widthMm,
      height: template.heightMm,
      dpi: template.dpi,
      background: template.backgroundColor ?? "#FFFFFF",
    };
    const { canvas, objects } = jsonToCanvas(canvasJson, fallback);
    set({
      template,
      canvas,
      objects,
      selectedIds: [],
      zoom: 1,
      grid: 1,
      snapEnabled: true,
      dirty: false,
      past: [],
      future: [],
      // O clipboard sobrevive entre templates da mesma sessão (UX comum).
    });
  },

  closeTemplate: () => {
    set({
      template: null,
      canvas: EMPTY_CANVAS,
      objects: [],
      selectedIds: [],
      dirty: false,
      past: [],
      future: [],
    });
  },

  markSaved: () => set({ dirty: false }),

  // --- Histórico ---

  undo: () => {
    const { past, future, canvas, objects, selectedIds } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    const newPast = past.slice(0, -1);
    const current = snapshotOf({ canvas, objects, selectedIds });
    const newFuture = [...future, current];
    // Limita o histórico de redo no mesmo tamanho do undo.
    if (newFuture.length > HISTORY_LIMIT) newFuture.shift();
    set({
      past: newPast,
      future: newFuture,
      canvas: prev.canvas,
      objects: prev.objects,
      selectedIds: prev.selectedIds,
      dirty: true,
    });
  },

  redo: () => {
    const { past, future, canvas, objects, selectedIds } = get();
    if (future.length === 0) return;
    const next = future[future.length - 1];
    const newFuture = future.slice(0, -1);
    const current = snapshotOf({ canvas, objects, selectedIds });
    const newPast = [...past, current];
    if (newPast.length > HISTORY_LIMIT) newPast.shift();
    set({
      past: newPast,
      future: newFuture,
      canvas: next.canvas,
      objects: next.objects,
      selectedIds: next.selectedIds,
      dirty: true,
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  // --- Clipboard ---

  copySelected: () => {
    const { objects, selectedIds } = get();
    if (selectedIds.length === 0) return;
    const picked = objects.filter((o) => selectedIds.includes(o.id));
    if (picked.length === 0) return;
    // Snapshot raso: como CanvasObject é imutável no fluxo, podemos referenciar
    // direto; o paste sempre clona com novo id antes de inserir.
    set({ clipboard: picked });
  },

  cutSelected: () => {
    const { objects, selectedIds } = get();
    if (selectedIds.length === 0) return;
    const picked = objects.filter((o) => selectedIds.includes(o.id));
    if (picked.length === 0) return;
    set((s) => ({
      past: pushHistory(s),
      future: [],
      clipboard: picked,
      objects: s.objects.filter((o) => !s.selectedIds.includes(o.id)),
      selectedIds: [],
      dirty: true,
    }));
  },

  pasteFromClipboard: () => {
    const { clipboard } = get();
    if (clipboard.length === 0) return;
    set((s) => {
      const clones: CanvasObject[] = clipboard.map(
        (src) =>
          ({
            ...src,
            id: generateId(src.type),
            x: roundMm(src.x + 2),
            y: roundMm(src.y + 2),
          }) as CanvasObject,
      );
      return {
        past: pushHistory(s),
        future: [],
        objects: [...s.objects, ...clones],
        selectedIds: clones.map((c) => c.id),
        dirty: true,
      };
    });
  },

  setZoom: (zoom) => {
    const clamped = ZOOM_LEVELS.reduce(
      (best, level) => (Math.abs(level - zoom) < Math.abs(best - zoom) ? level : best),
      ZOOM_LEVELS[0],
    );
    set({ zoom: clamped });
  },

  zoomIn: () => {
    const { zoom } = get();
    const next = ZOOM_LEVELS.find((z) => z > zoom);
    if (next !== undefined) set({ zoom: next });
  },

  zoomOut: () => {
    const { zoom } = get();
    const previous = [...ZOOM_LEVELS].reverse().find((z) => z < zoom);
    if (previous !== undefined) set({ zoom: previous });
  },

  setGrid: (grid) => set({ grid }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

  setBackgroundColor: (color) => {
    set((s) => ({
      past: pushHistory(s),
      future: [],
      canvas: { ...s.canvas, background: color },
      dirty: true,
    }));
  },

  addObject: (object) => {
    set((s) => ({
      past: pushHistory(s),
      future: [],
      objects: [...s.objects, object],
      selectedIds: [object.id],
      dirty: true,
    }));
  },

  updateObject: (id, patch) => {
    set((s) => ({
      past: pushHistory(s),
      future: [],
      objects: s.objects.map((o) =>
        o.id === id ? ({ ...o, ...patch } as CanvasObject) : o,
      ),
      dirty: true,
    }));
  },

  updateSelectedObjects: (patch) => {
    set((s) => ({
      past: pushHistory(s),
      future: [],
      objects: s.objects.map((o) =>
        s.selectedIds.includes(o.id) ? ({ ...o, ...patch } as CanvasObject) : o,
      ),
      dirty: true,
    }));
  },

  removeSelected: () => {
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      return {
        past: pushHistory(s),
        future: [],
        objects: s.objects.filter((o) => !s.selectedIds.includes(o.id)),
        selectedIds: [],
        dirty: true,
      };
    });
  },

  duplicateSelected: () => {
    const { objects, selectedIds } = get();
    if (selectedIds.length === 0) return;
    const clones: CanvasObject[] = [];
    const newIds: string[] = [];
    for (const id of selectedIds) {
      const src = objects.find((o) => o.id === id);
      if (!src) continue;
      const clone = {
        ...src,
        id: generateId(src.type),
        x: roundMm(src.x + 2),
        y: roundMm(src.y + 2),
      } as CanvasObject;
      clones.push(clone);
      newIds.push(clone.id);
    }
    if (clones.length === 0) return;
    set((s) => ({
      past: pushHistory(s),
      future: [],
      objects: [...objects, ...clones],
      selectedIds: newIds,
      dirty: true,
    }));
  },

  bringForward: () => {
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const arr = [...s.objects];
      for (let i = arr.length - 2; i >= 0; i -= 1) {
        if (s.selectedIds.includes(arr[i].id) && !s.selectedIds.includes(arr[i + 1].id)) {
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        }
      }
      return { past: pushHistory(s), future: [], objects: arr, dirty: true };
    });
  },

  sendBackward: () => {
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const arr = [...s.objects];
      for (let i = 1; i < arr.length; i += 1) {
        if (s.selectedIds.includes(arr[i].id) && !s.selectedIds.includes(arr[i - 1].id)) {
          [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        }
      }
      return { past: pushHistory(s), future: [], objects: arr, dirty: true };
    });
  },

  bringToFront: () => {
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const stayed = s.objects.filter((o) => !s.selectedIds.includes(o.id));
      const promoted = s.objects.filter((o) => s.selectedIds.includes(o.id));
      return {
        past: pushHistory(s),
        future: [],
        objects: [...stayed, ...promoted],
        dirty: true,
      };
    });
  },

  sendToBack: () => {
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      const demoted = s.objects.filter((o) => s.selectedIds.includes(o.id));
      const stayed = s.objects.filter((o) => !s.selectedIds.includes(o.id));
      return {
        past: pushHistory(s),
        future: [],
        objects: [...demoted, ...stayed],
        dirty: true,
      };
    });
  },

  selectOnly: (id) => {
    set({ selectedIds: id ? [id] : [] });
  },

  toggleSelect: (id) => {
    set((s) =>
      s.selectedIds.includes(id)
        ? { selectedIds: s.selectedIds.filter((x) => x !== id) }
        : { selectedIds: [...s.selectedIds, id] },
    );
  },

  selectMany: (ids) => set({ selectedIds: ids }),

  clearSelection: () => set({ selectedIds: [] }),

  nudgeSelected: (dx, dy) => {
    set((s) => {
      if (s.selectedIds.length === 0) return {};
      return {
        past: pushHistory(s),
        future: [],
        objects: s.objects.map((o) =>
          s.selectedIds.includes(o.id)
            ? { ...o, x: roundMm(o.x + dx), y: roundMm(o.y + dy) }
            : o,
        ),
        dirty: true,
      };
    });
  },

  alignSelected: (direction) => {
    const { objects, selectedIds } = get();
    if (selectedIds.length < 2) return;
    const selected = objects.filter((o) => selectedIds.includes(o.id));
    const boxes = selected.map((o) => ({ obj: o, ...bboxOf(o) }));
    let getX: (b: (typeof boxes)[number]) => number;
    let getY: (b: (typeof boxes)[number]) => number;

    switch (direction) {
      case "left": {
        const minX = Math.min(...boxes.map((b) => b.x));
        getX = () => minX;
        getY = (b) => b.y;
        break;
      }
      case "right": {
        const maxRight = Math.max(...boxes.map((b) => b.x + b.w));
        getX = (b) => maxRight - b.w;
        getY = (b) => b.y;
        break;
      }
      case "center-horizontal": {
        const avgCenter =
          boxes.reduce((s, b) => s + (b.x + b.w / 2), 0) / boxes.length;
        getX = (b) => avgCenter - b.w / 2;
        getY = (b) => b.y;
        break;
      }
      case "top": {
        const minY = Math.min(...boxes.map((b) => b.y));
        getX = (b) => b.x;
        getY = () => minY;
        break;
      }
      case "bottom": {
        const maxBottom = Math.max(...boxes.map((b) => b.y + b.h));
        getX = (b) => b.x;
        getY = (b) => maxBottom - b.h;
        break;
      }
      case "middle-vertical": {
        const avgMiddle =
          boxes.reduce((s, b) => s + (b.y + b.h / 2), 0) / boxes.length;
        getX = (b) => b.x;
        getY = (b) => avgMiddle - b.h / 2;
        break;
      }
    }

    set((s) => ({
      past: pushHistory(s),
      future: [],
      objects: objects.map((o) => {
        const box = boxes.find((b) => b.obj.id === o.id);
        if (!box) return o;
        return { ...o, x: roundMm(getX(box)), y: roundMm(getY(box)) };
      }),
      dirty: true,
    }));
  },

  distributeSelected: (direction) => {
    const { objects, selectedIds } = get();
    if (selectedIds.length < 3) return;
    const selected = objects.filter((o) => selectedIds.includes(o.id));
    const boxes = selected.map((o) => ({ obj: o, ...bboxOf(o) }));

    if (direction === "horizontal") {
      boxes.sort((a, b) => a.x - b.x);
      const first = boxes[0];
      const last = boxes[boxes.length - 1];
      const span = last.x + last.w - first.x;
      const totalW = boxes.reduce((s, b) => s + b.w, 0);
      const gap = (span - totalW) / (boxes.length - 1);
      let cursor = first.x;
      const positions = new Map<string, number>();
      for (const b of boxes) {
        positions.set(b.obj.id, cursor);
        cursor += b.w + gap;
      }
      set((s) => ({
        past: pushHistory(s),
        future: [],
        objects: objects.map((o) =>
          positions.has(o.id) ? { ...o, x: roundMm(positions.get(o.id)!) } : o,
        ),
        dirty: true,
      }));
    } else {
      boxes.sort((a, b) => a.y - b.y);
      const first = boxes[0];
      const last = boxes[boxes.length - 1];
      const span = last.y + last.h - first.y;
      const totalH = boxes.reduce((s, b) => s + b.h, 0);
      const gap = (span - totalH) / (boxes.length - 1);
      let cursor = first.y;
      const positions = new Map<string, number>();
      for (const b of boxes) {
        positions.set(b.obj.id, cursor);
        cursor += b.h + gap;
      }
      set((s) => ({
        past: pushHistory(s),
        future: [],
        objects: objects.map((o) =>
          positions.has(o.id) ? { ...o, y: roundMm(positions.get(o.id)!) } : o,
        ),
        dirty: true,
      }));
    }
  },

  toJsonString: () => {
    const { canvas, objects } = get();
    return canvasToJsonString(canvas, objects);
  },
}));
