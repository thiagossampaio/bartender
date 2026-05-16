/**
 * Hook global de atalhos do editor (WP-05 / SPEC-04 RF-E-18 + RF-E-19 + RF-E-20).
 *
 * Concentra todos os atalhos cross-platform descritos na SPEC-04:
 *
 *   Ctrl/⌘+C   Copiar selecionados
 *   Ctrl/⌘+X   Cortar selecionados
 *   Ctrl/⌘+V   Colar
 *   Ctrl/⌘+D   Duplicar selecionados
 *   Ctrl/⌘+Z   Undo
 *   Ctrl/⌘+Shift+Z (ou Ctrl/⌘+Y)  Redo
 *   Ctrl/⌘+S   Salvar
 *   Ctrl/⌘+Shift+S  Salvar como
 *   Ctrl/⌘+A   Selecionar todos
 *   Ctrl/⌘ +/− Zoom in/out
 *   Ctrl/⌘+0   Zoom 100 %
 *   Delete/Backspace  Excluir selecionados
 *   Esc        Limpar seleção
 *   Setas      Move 1 mm (Shift = 10 mm)
 *
 * Decisões:
 *  - Detecção de plataforma é via `navigator.platform` na primeira chamada.
 *    Em macOS aceitamos ⌘ (Meta); em Win/Linux aceitamos Ctrl. Mantemos ambos
 *    aceitos em todas as plataformas para conveniência em ambiente híbrido
 *    (teclado externo trocado).
 *  - Ignoramos eventos vindos de `input`/`textarea`/`select`/`contenteditable`
 *    para não roubar o foco de campos do painel de propriedades.
 *  - Os atalhos de save são async; quando o caller passa `onSave`, retornamos
 *    a promise para permitir feedback (toast, loading) sem o store importar
 *    o serviço de templates.
 */

import * as React from "react";

import { useEditorStore } from "@/lib/stores/editor-store";

export interface EditorShortcutsHandlers {
  /** Disparado por Ctrl/⌘+S. Implementador decide salvar (UI). */
  onSave?: () => void | Promise<void>;
  /** Disparado por Ctrl/⌘+Shift+S. */
  onSaveAs?: () => void | Promise<void>;
}

/** True quando o evento veio de um campo de texto e atalhos devem ser ignorados. */
function isEditingField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Modifier "comando" agnóstico de plataforma: ⌘ no Mac, Ctrl no resto. */
function hasCmdOrCtrl(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

export function useEditorShortcuts(handlers: EditorShortcutsHandlers): void {
  // Mantém os handlers em ref para o effect não re-bindar a cada render do
  // chamador (que muda referência das closures `onSave`/`onSaveAs`).
  const ref = React.useRef(handlers);
  React.useEffect(() => {
    ref.current = handlers;
  }, [handlers]);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditingField(e.target)) {
        // Permite Ctrl/⌘+S funcionar mesmo em inputs — UX comum em editores.
        if (hasCmdOrCtrl(e) && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          if (e.shiftKey) {
            void ref.current.onSaveAs?.();
          } else {
            void ref.current.onSave?.();
          }
        }
        return;
      }

      const store = useEditorStore.getState();
      const hasSelection = store.selectedIds.length > 0;

      // Atalhos com Ctrl/⌘.
      if (hasCmdOrCtrl(e)) {
        const key = e.key.toLowerCase();
        switch (key) {
          case "z":
            e.preventDefault();
            if (e.shiftKey) store.redo();
            else store.undo();
            return;
          case "y":
            // Alguns teclados / Windows convencionalmente usam Ctrl+Y para redo.
            e.preventDefault();
            store.redo();
            return;
          case "c":
            if (hasSelection) {
              e.preventDefault();
              store.copySelected();
            }
            return;
          case "x":
            if (hasSelection) {
              e.preventDefault();
              store.cutSelected();
            }
            return;
          case "v":
            e.preventDefault();
            store.pasteFromClipboard();
            return;
          case "d":
            if (hasSelection) {
              e.preventDefault();
              store.duplicateSelected();
            }
            return;
          case "a":
            e.preventDefault();
            store.selectMany(store.objects.map((o) => o.id));
            return;
          case "s":
            e.preventDefault();
            if (e.shiftKey) {
              void ref.current.onSaveAs?.();
            } else {
              void ref.current.onSave?.();
            }
            return;
          case "=":
          case "+":
            e.preventDefault();
            store.zoomIn();
            return;
          case "-":
          case "_":
            e.preventDefault();
            store.zoomOut();
            return;
          case "0":
            e.preventDefault();
            store.setZoom(1);
            return;
        }
      }

      // Atalhos sem Ctrl/⌘.
      if (e.key === "Delete" || e.key === "Backspace") {
        if (hasSelection) {
          e.preventDefault();
          store.removeSelected();
        }
        return;
      }
      if (e.key === "Escape") {
        store.clearSelection();
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      if (dx !== 0 || dy !== 0) {
        if (hasSelection) {
          e.preventDefault();
          store.nudgeSelected(dx, dy);
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
