import * as React from "react";
import { ArrowLeft, Redo2, Save, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CanvasArea } from "@/components/editor/CanvasArea";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { SaveAsModal } from "@/components/editor/SaveAsModal";
import { Toolbar } from "@/components/editor/Toolbar";
import { ZoomControls } from "@/components/editor/ZoomControls";
import { useEditorShortcuts } from "@/components/editor/useEditorShortcuts";
import { registerBundleFonts } from "@/lib/canvas/font-loader";
import { generateThumbnailPng } from "@/lib/canvas/thumbnail";
import { useEditorStore } from "@/lib/stores/editor-store";
import { useTemplatesStore } from "@/lib/stores/templates-store";
import { templatesGet, templatesGetCanvasJson } from "@/lib/templates";

/**
 * Página `Editor` (WP-04 + WP-05 / SPEC-04).
 *
 * Carrega o template selecionado (`templates-store.editingId`) e popula o
 * `editor-store` com o `canvas_json` desserializado. Renderiza o layout
 * em três colunas:
 *
 *   ┌──────────────┬────────────────────────────────┬──────────────┐
 *   │   Toolbar    │         CanvasArea + Rulers    │  Properties  │
 *   └──────────────┴────────────────────────────────┴──────────────┘
 *
 * Em WP-05 acrescentamos:
 *  - Header: botões **Salvar** + **Salvar como** + **Undo/Redo**.
 *  - Atalhos globais (`useEditorShortcuts`): Ctrl/⌘+S, +Shift+S, +Z, +Shift+Z,
 *    +C/X/V/D/A, +/−/0, Delete, setas, Esc.
 *  - Geração de thumbnail PNG ao salvar (Konva off-screen → BLOB).
 *  - Confirmação ao voltar para a galeria com mudanças não salvas.
 */
export function Editor() {
  const editingId = useTemplatesStore((s) => s.editingId);
  const closeEditor = useTemplatesStore((s) => s.closeEditor);
  const saveTemplate = useTemplatesStore((s) => s.saveTemplate);
  const saveTemplateAs = useTemplatesStore((s) => s.saveTemplateAs);

  const loadTemplate = useEditorStore((s) => s.loadTemplate);
  const closeTemplate = useEditorStore((s) => s.closeTemplate);
  const template = useEditorStore((s) => s.template);
  const dirty = useEditorStore((s) => s.dirty);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const markSaved = useEditorStore((s) => s.markSaved);

  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveAsOpen, setSaveAsOpen] = React.useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = React.useState(false);

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

  // Registra os @font-face do bundle (WP-06 / SPEC-05). Idempotente — só
  // toca o `document.fonts` uma vez por sessão; faz aqui (e não em `App.tsx`)
  // para evitar custo na galeria, onde fontes do bundle não importam.
  React.useEffect(() => {
    void registerBundleFonts();
  }, []);

  /**
   * Salva o estado atual do canvas no template aberto. Gera thumbnail
   * off-screen antes de persistir (RF-E-19 e SPEC-04 §"Mudanças necessárias").
   */
  const handleSave = React.useCallback(async () => {
    const state = useEditorStore.getState();
    if (!state.template) return;
    setSaving(true);
    setSaveError(null);
    try {
      const json = state.toJsonString();
      const thumbnail = await generateThumbnailPng(state.canvas, state.objects);
      const updated = await saveTemplate(
        state.template.id,
        json,
        thumbnail ?? undefined,
      );
      // Atualiza a row no store (updated_at/version refletem o save).
      useEditorStore.setState({ template: updated });
      markSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }, [saveTemplate, markSaved]);

  /** Abre o modal "Salvar como" (RF-E-20). */
  const handleSaveAs = React.useCallback(() => {
    setSaveAsOpen(true);
  }, []);

  /** Persiste como novo template a partir do modal. */
  const handleSaveAsConfirm = React.useCallback(
    async (newName: string) => {
      const state = useEditorStore.getState();
      if (!state.template) return;
      const json = state.toJsonString();
      const thumbnail = await generateThumbnailPng(state.canvas, state.objects);
      const created = await saveTemplateAs(
        state.template.id,
        newName,
        json,
        thumbnail ?? undefined,
      );
      // "Salvar como" muda o template "ativo" do editor para o novo registro,
      // mirroring o comportamento de editores de imagem (após Salvar como, a
      // janela passa a editar o arquivo novo). Limpa o dirty também.
      useEditorStore.setState({ template: created });
      markSaved();
    },
    [saveTemplateAs, markSaved],
  );

  useEditorShortcuts({ onSave: handleSave, onSaveAs: handleSaveAs });

  /**
   * Intenção de voltar para a galeria — bloqueia quando há mudanças não
   * salvas e oferece confirmação simples (RF-E-19 implícita: mudanças não
   * salvas não podem ser perdidas silenciosamente).
   */
  const requestClose = React.useCallback(() => {
    if (dirty) {
      setShowCloseConfirm(true);
    } else {
      closeEditor();
    }
  }, [dirty, closeEditor]);

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
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={requestClose}
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
          <div className="flex items-center gap-1 rounded-md border bg-card px-1">
            <button
              type="button"
              onClick={() => undo()}
              disabled={!canUndo}
              aria-label="Desfazer"
              title="Desfazer (Ctrl/⌘+Z)"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => redo()}
              disabled={!canRedo}
              aria-label="Refazer"
              title="Refazer (Ctrl/⌘+Shift+Z)"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Redo2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ZoomControls />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveAs}
            disabled={saving}
            title="Salvar como (Ctrl/⌘+Shift+S)"
          >
            Salvar como
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
            title="Salvar (Ctrl/⌘+S)"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </header>

      {saveError && (
        <div
          role="alert"
          className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive"
        >
          {saveError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <CanvasArea />
        <PropertiesPanel />
      </div>

      <SaveAsModal
        open={saveAsOpen}
        defaultName={template ? `${template.name} (cópia)` : ""}
        onOpenChange={setSaveAsOpen}
        onSubmit={handleSaveAsConfirm}
      />

      <CloseConfirmDialog
        open={showCloseConfirm}
        saving={saving}
        onCancel={() => setShowCloseConfirm(false)}
        onDiscard={() => {
          setShowCloseConfirm(false);
          closeEditor();
        }}
        onSave={async () => {
          await handleSave();
          setShowCloseConfirm(false);
          // Só fecha se o save terminou sem erro — caso contrário o usuário
          // permanece na tela e vê a mensagem de erro.
          if (!useEditorStore.getState().dirty) {
            closeEditor();
          }
        }}
      />
    </div>
  );
}

/**
 * Dialogo de confirmação ao tentar fechar com mudanças não salvas.
 * Reutiliza o primitivo `Dialog` simplificadamente — apresenta três caminhos:
 * salvar, descartar, ou cancelar (manter editando).
 */
function CloseConfirmDialog({
  open,
  saving,
  onCancel,
  onDiscard,
  onSave,
}: {
  open: boolean;
  saving: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => Promise<void>;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-confirm-title"
    >
      <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-lg">
        <h2 id="close-confirm-title" className="text-base font-semibold">
          Mudanças não salvas
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Você tem alterações não salvas. O que deseja fazer?
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={onDiscard} disabled={saving}>
            Descartar
          </Button>
          <Button onClick={() => void onSave()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar e sair"}
          </Button>
        </div>
      </div>
    </div>
  );
}
