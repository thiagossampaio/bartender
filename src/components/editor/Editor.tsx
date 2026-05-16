import * as React from "react";
import {
  ArrowLeft,
  Database,
  Eye,
  FileDown,
  Layers,
  Printer as PrinterIcon,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CanvasArea } from "@/components/editor/CanvasArea";
import { PreviewModal, type PreviewPage } from "@/components/editor/PreviewModal";
import { PrintDialog } from "@/components/editor/PrintDialog";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { SaveAsModal } from "@/components/editor/SaveAsModal";
import { Toolbar } from "@/components/editor/Toolbar";
import { ZoomControls } from "@/components/editor/ZoomControls";
import { useEditorShortcuts } from "@/components/editor/useEditorShortcuts";
import {
  DataImportDialog,
  type DataImportResult,
} from "@/components/data/DataImportDialog";
import { BatchPrintWizard } from "@/components/batch/BatchPrintWizard";
import { registerBundleFonts } from "@/lib/canvas/font-loader";
import { generateThumbnailPng } from "@/lib/canvas/thumbnail";
import { canvasToJsonString } from "@/lib/canvas/serializer";
import { buildPdfBytes, exportPdf, suggestPdfFileName } from "@/lib/pdf/export";
import { pplbPrint } from "@/lib/pplb";
import { zplPrint } from "@/lib/zpl";
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
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [printOpen, setPrintOpen] = React.useState(false);
  const [dataImportOpen, setDataImportOpen] = React.useState(false);
  // Estado da última importação — preservado dentro da sessão do editor para
  // re-abrir o wizard sem perder o arquivo escolhido. WP-13 vai mover para
  // store global quando o BatchPrintWizard for cabeado.
  const [dataImport, setDataImport] = React.useState<DataImportResult | null>(
    null,
  );
  const [dataImportFeedback, setDataImportFeedback] = React.useState<
    string | null
  >(null);
  // Estado do BatchPrintWizard (WP-13). Só pode abrir quando há um dataset
  // importado com todos os placeholders mapeados.
  const [batchWizardOpen, setBatchWizardOpen] = React.useState(false);
  const objects = useEditorStore((s) => s.objects);
  const canvasDef = useEditorStore((s) => s.canvas);

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

  /**
   * Coleta a "página única" atualmente editada para o PreviewModal/Exportação.
   * Construído sob demanda (`useCallback`) porque a serialização do estado
   * é barata; manter como state derivado em React.useMemo poderia confundir
   * (o store muda a cada drag/transform).
   */
  const collectCurrentPage = React.useCallback((): PreviewPage | null => {
    const state = useEditorStore.getState();
    if (!state.template) return null;
    return { canvas: state.canvas, objects: state.objects };
  }, []);

  /**
   * Abre o modal de pré-visualização. Sempre captura o estado **atual** do
   * editor — sem snapshot stale.
   */
  const handlePreview = React.useCallback(() => {
    setPreviewOpen(true);
  }, []);

  /**
   * Exporta o PDF via diálogo de save nativo. Compartilhado entre o botão
   * "Exportar PDF" do header e o botão dentro do PreviewModal — ambos pulam
   * o save automático e geram o PDF a partir do estado em memória (o usuário
   * pode exportar mesmo um template ainda não salvo).
   */
  const handleExportPdf = React.useCallback(async () => {
    const page = collectCurrentPage();
    if (!page) return;
    setExporting(true);
    setExportError(null);
    try {
      const state = useEditorStore.getState();
      const name = state.template?.name ?? "etiqueta";
      await exportPdf({
        pages: [page],
        suggestedFileName: suggestPdfFileName(name),
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Erro ao exportar PDF.");
    } finally {
      setExporting(false);
    }
  }, [collectCurrentPage]);

  /**
   * Abre o wizard de impressão (WP-09). Cria os bytes do PDF sob demanda
   * — `getPdfBytes` é chamado pelo PrintDialog só quando o usuário
   * confirma "Imprimir", evitando custo de geração se ele cancelar.
   */
  const handleOpenPrint = React.useCallback(() => {
    setPrintOpen(true);
  }, []);

  const collectPdfBytes = React.useCallback(async (): Promise<Uint8Array> => {
    const page = collectCurrentPage();
    if (!page) throw new Error("Nenhuma página para imprimir.");
    return buildPdfBytes([page]);
  }, [collectCurrentPage]);

  /**
   * Callback do PrintDialog quando o usuário escolhe "Modo nativo (PPLB/ZPL)"
   * para uma impressora Argox/Zebra. Roteia pelo `language` da impressora:
   *  - `PPLB` → `pplbPrint` (WP-10)
   *  - `ZPL`  → `zplPrint`  (WP-11)
   */
  const handleNativeIntent = React.useCallback(
    async (req: {
      printer: { systemName: string; language: "DRIVER" | "PPLB" | "ZPL" };
      copies: number;
    }) => {
      const state = useEditorStore.getState();
      if (!state.template) {
        throw new Error("Nenhum template aberto.");
      }
      const canvasJson = canvasToJsonString(state.canvas, state.objects);
      if (req.printer.language === "PPLB") {
        await pplbPrint(
          req.printer.systemName,
          canvasJson,
          req.copies,
          state.template.id,
        );
      } else if (req.printer.language === "ZPL") {
        await zplPrint(
          req.printer.systemName,
          canvasJson,
          req.copies,
          state.template.id,
        );
      } else {
        throw new Error(
          'Impressora não suporta modo nativo — desmarque "Modo nativo" para usar o driver do SO.',
        );
      }
    },
    [],
  );

  /**
   * Abre o wizard de importação de fonte de dados (WP-12 / SPEC-07).
   * Mantém o último dataset/mapping em memória para o usuário poder reabrir
   * sem refazer o pick. WP-13 promoverá isso a um store dedicado quando o
   * BatchPrintWizard precisar consumir o resultado.
   */
  const handleOpenDataImport = React.useCallback(() => {
    setDataImportFeedback(null);
    setDataImportOpen(true);
  }, []);

  const handleDataImportApply = React.useCallback(
    (result: DataImportResult) => {
      setDataImport(result);
      const totalPlaceholders = result.placeholders.length;
      const mappedCount = Object.values(result.mapping).filter(Boolean).length;
      setDataImportFeedback(
        totalPlaceholders === 0
          ? `Planilha "${result.dataset.fileName ?? "(sem nome)"}" carregada: ${result.dataset.rows.length} linha(s).`
          : `Planilha "${result.dataset.fileName ?? "(sem nome)"}" carregada com ${result.dataset.rows.length} linha(s) e ${mappedCount}/${totalPlaceholders} placeholder(s) mapeado(s).`,
      );
    },
    [],
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
            onClick={handleOpenDataImport}
            disabled={!template}
            title="Importar dados (CSV/XLSX)"
          >
            <Database className="h-4 w-4" aria-hidden="true" />
            {dataImport ? "Dados…" : "Importar dados"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBatchWizardOpen(true)}
            disabled={!template || !dataImport}
            title={
              dataImport
                ? "Imprimir em lote a partir da planilha importada"
                : "Importe uma planilha para imprimir em lote"
            }
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
            Imprimir lote
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={!template}
            title="Pré-visualizar a etiqueta"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            Pré-visualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExportPdf()}
            disabled={!template || exporting}
            title="Exportar PDF"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            {exporting ? "Exportando…" : "Exportar PDF"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenPrint}
            disabled={!template}
            title="Imprimir"
          >
            <PrinterIcon className="h-4 w-4" aria-hidden="true" />
            Imprimir
          </Button>
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
      {exportError && (
        <div
          role="alert"
          className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive"
        >
          {exportError}
        </div>
      )}
      {dataImportFeedback && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b bg-emerald-50/60 px-4 py-2 text-xs text-emerald-900"
        >
          <span>{dataImportFeedback}</span>
          <button
            type="button"
            onClick={() => setDataImportFeedback(null)}
            className="rounded text-emerald-900/70 hover:text-emerald-900"
            aria-label="Ocultar mensagem"
          >
            ×
          </button>
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

      <PreviewModal
        open={previewOpen}
        pages={
          previewOpen && collectCurrentPage()
            ? [collectCurrentPage() as PreviewPage]
            : []
        }
        templateName={template?.name}
        onOpenChange={setPreviewOpen}
        onExportPdf={handleExportPdf}
        exporting={exporting}
      />

      <PrintDialog
        open={printOpen}
        getPdfBytes={collectPdfBytes}
        onOpenChange={setPrintOpen}
        onNativeIntent={handleNativeIntent}
        templateId={template?.id}
      />

      <DataImportDialog
        open={dataImportOpen}
        onOpenChange={setDataImportOpen}
        templateObjects={objects}
        onApply={handleDataImportApply}
        initial={
          dataImport
            ? { dataset: dataImport.dataset, mapping: dataImport.mapping }
            : undefined
        }
      />

      {dataImport && template && (
        <BatchPrintWizard
          open={batchWizardOpen}
          onOpenChange={setBatchWizardOpen}
          canvas={canvasDef}
          objects={objects}
          dataset={dataImport.dataset}
          mapping={dataImport.mapping}
          placeholders={dataImport.placeholders}
          templateName={template.name}
          templateId={template.id}
        />
      )}

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
