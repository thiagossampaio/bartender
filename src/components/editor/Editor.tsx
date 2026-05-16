import * as React from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CanvasArea } from "@/components/editor/CanvasArea";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { Toolbar } from "@/components/editor/Toolbar";
import { ZoomControls } from "@/components/editor/ZoomControls";
import { useEditorStore } from "@/lib/stores/editor-store";
import { useTemplatesStore } from "@/lib/stores/templates-store";
import { templatesGet, templatesGetCanvasJson } from "@/lib/templates";

/**
 * Página `Editor` (WP-04 / SPEC-04).
 *
 * Carrega o template selecionado (`templates-store.editingId`) e popula o
 * `editor-store` com o `canvas_json` desserializado. Renderiza o layout
 * em três colunas:
 *
 *   ┌──────────────┬────────────────────────────────┬──────────────┐
 *   │   Toolbar    │         CanvasArea + Rulers    │  Properties  │
 *   └──────────────┴────────────────────────────────┴──────────────┘
 *
 * O save persistido entra em [WP-05](../../../specs/work-plan.md#wp-05--editor-undoredo--atalhos--salvarcarregar--thumbnail).
 * Aqui o botão "Voltar" simplesmente fecha o editor sem persistir — útil para
 * iterar a UI sem efeitos colaterais durante WP-04.
 */
export function Editor() {
  const editingId = useTemplatesStore((s) => s.editingId);
  const closeEditor = useTemplatesStore((s) => s.closeEditor);
  const loadTemplate = useEditorStore((s) => s.loadTemplate);
  const closeTemplate = useEditorStore((s) => s.closeTemplate);
  const template = useEditorStore((s) => s.template);
  const dirty = useEditorStore((s) => s.dirty);

  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (editingId == null) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const row = await templatesGet(editingId);
        if (cancelled) return;
        if (!row) {
          setLoadError("Template não encontrado.");
          return;
        }
        const json = await templatesGetCanvasJson(editingId);
        if (cancelled) return;
        loadTemplate(row, json);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Erro ao abrir template.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId, loadTemplate]);

  // Limpa o editor-store ao desmontar a página, evitando memória residual ao
  // voltar para a galeria.
  React.useEffect(() => {
    return () => {
      closeTemplate();
    };
  }, [closeTemplate]);

  if (editingId == null) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Abrindo template…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background">
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
        <Button variant="outline" onClick={() => closeEditor()}>
          Voltar para a galeria
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b bg-background px-4 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => closeEditor()}
            aria-label="Voltar para a galeria"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <h1
              className="truncate text-sm font-semibold leading-tight"
              title={template?.name ?? ""}
            >
              {dirty ? "• " : ""}
              {template?.name ?? "—"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {template
                ? `${template.widthMm} × ${template.heightMm} mm · ${template.dpi} dpi`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ZoomControls />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <CanvasArea />
        <PropertiesPanel />
      </div>
    </div>
  );
}
