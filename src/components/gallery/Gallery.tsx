import * as React from "react";
import { Download, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmModal } from "@/components/gallery/ConfirmModal";
import { ImportConflictModal } from "@/components/gallery/ImportConflictModal";
import { NewTemplateModal } from "@/components/gallery/NewTemplateModal";
import { RenameModal } from "@/components/gallery/RenameModal";
import { TemplateCard } from "@/components/gallery/TemplateCard";
import {
  commitImport,
  exportTemplate,
  findActiveByName,
  pickAndInspectEtlbl,
  type EtlblInspect,
  type ImportConflictResolution,
} from "@/lib/etlbl";
import { extractErrorMessage } from "@/lib/errors";
import { useTemplatesStore } from "@/lib/stores/templates-store";
import type { TemplateRow } from "@/lib/templates";

/**
 * Página `Gallery` (WP-03 / SPEC-03).
 *
 * Tela inicial do app pós-onboarding. Mostra todos os templates ativos com
 * thumbnail (placeholder até WP-05), nome, dimensões e data, com:
 *
 *  - Botão "Novo template" → `NewTemplateModal`.
 *  - Busca por nome (substring case-insensitive, RF-T-06 + R09).
 *  - Menu por card → Duplicar / Renomear / Excluir (soft delete).
 *  - Importar `.etlbl` via picker do SO.
 *
 * Navegação para Histórico / Lixeira e menu Impressora ficam na `AppShell`.
 */
export function Gallery() {
  const view = useTemplatesStore((s) => s.view);
  const active = useTemplatesStore((s) => s.active);
  const searchTerm = useTemplatesStore((s) => s.searchTerm);
  const loading = useTemplatesStore((s) => s.loading);
  const error = useTemplatesStore((s) => s.error);
  const setSearchTerm = useTemplatesStore((s) => s.setSearchTerm);
  const refresh = useTemplatesStore((s) => s.refresh);
  const createTemplate = useTemplatesStore((s) => s.createTemplate);
  const duplicateTemplate = useTemplatesStore((s) => s.duplicateTemplate);
  const renameTemplate = useTemplatesStore((s) => s.renameTemplate);
  const softDeleteTemplate = useTemplatesStore((s) => s.softDeleteTemplate);
  const openEditor = useTemplatesStore((s) => s.openEditor);

  const [newOpen, setNewOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<TemplateRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TemplateRow | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [conflict, setConflict] = React.useState<{
    inspect: EtlblInspect;
    existing: TemplateRow;
  } | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [flashError, setFlashError] = React.useState<string | null>(null);

  // Carrega na primeira renderização da galeria.
  React.useEffect(() => {
    if (view === "gallery") {
      void refresh();
    }
  }, [view, refresh]);

  // Mensagem efêmera de sucesso (export / import): fade em ~4s.
  React.useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const showEmptyState = !loading && !error && active.length === 0;

  async function handleExport(template: TemplateRow) {
    setFlash(null);
    setFlashError(null);
    try {
      const path = await exportTemplate(template.id);
      if (path) {
        setFlash(`Template exportado: ${path}`);
      }
    } catch (e) {
      // Tauri 2.x rejeita com string nua quando o backend serializa o erro
      // como string — `extractErrorMessage` cobre Error/string/objeto e
      // preserva a mensagem real do Rust (`EtlblError::Io(...)`, etc).
      console.error("[gallery] exportTemplate falhou:", e);
      setFlashError(extractErrorMessage(e, "Falha ao exportar template."));
    }
  }

  async function handleImport() {
    if (importing) return;
    setImporting(true);
    setFlash(null);
    setFlashError(null);
    try {
      const inspect = await pickAndInspectEtlbl();
      if (!inspect) return;
      const existing = await findActiveByName(inspect.name);
      if (existing) {
        setConflict({ inspect, existing });
        return;
      }
      const outcome = await commitImport(inspect, "keep-both", null);
      if (outcome.kind === "imported") {
        await refresh();
        setFlash(`Template “${outcome.template.name}” importado.`);
      }
    } catch (e) {
      console.error("[gallery] importTemplate falhou:", e);
      setFlashError(extractErrorMessage(e, "Falha ao importar template."));
    } finally {
      setImporting(false);
    }
  }

  async function handleConflictResolve(resolution: ImportConflictResolution) {
    if (!conflict) return;
    const { inspect, existing } = conflict;
    const outcome = await commitImport(inspect, resolution, existing);
    if (outcome.kind === "imported") {
      await refresh();
      setFlash(
        outcome.replaced
          ? `Template “${outcome.template.name}” substituído.`
          : `Template “${outcome.template.name}” importado.`,
      );
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar templates…"
            aria-label="Buscar templates"
            className="h-9 pl-9"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImport}
                disabled={importing}
                aria-label="Importar template .etlbl"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {importing ? "Importando…" : "Importar"}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Importar template (.etlbl)
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                onClick={() => setNewOpen(true)}
                aria-label="Criar novo template"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Novo template</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Novo template</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <main className="flex-1 overflow-auto px-6 py-6">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        {flashError && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {flashError}
          </div>
        )}
        {flash && (
          <div
            role="status"
            className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
          >
            {flash}
          </div>
        )}
        {loading && active.length === 0 && (
          <p className="text-sm text-muted-foreground">Carregando templates…</p>
        )}
        {showEmptyState && (
          <EmptyState
            searching={searchTerm.trim().length > 0}
            onCreate={() => setNewOpen(true)}
          />
        )}
        {active.length > 0 && (
          <ul
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            }}
          >
            {active.map((t) => (
              <li key={t.id}>
                <TemplateCard
                  template={t}
                  onOpen={(id) => openEditor(id)}
                  onDuplicate={(id) => {
                    void duplicateTemplate(id);
                  }}
                  onRename={(template) => setRenameTarget(template)}
                  onExport={(template) => {
                    void handleExport(template);
                  }}
                  onDelete={(template) => setDeleteTarget(template)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      <NewTemplateModal
        open={newOpen}
        onOpenChange={setNewOpen}
        onSubmit={async (input) => {
          const row = await createTemplate(input);
          // Abre o editor para o template recém-criado — UX esperada do botão
          // "Novo template" (PRD §9.1: criar → editar imediatamente).
          openEditor(row.id);
        }}
      />
      <RenameModal
        open={renameTarget !== null}
        template={renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onSubmit={async (id, newName) => {
          await renameTemplate(id, newName);
        }}
      />
      <ConfirmModal
        open={deleteTarget !== null}
        title={`Excluir "${deleteTarget?.name ?? ""}"?`}
        description="O template será movido para a lixeira. Você poderá restaurá-lo a qualquer momento."
        confirmLabel="Excluir"
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={async () => {
          if (deleteTarget) {
            await softDeleteTemplate(deleteTarget.id);
          }
        }}
      />
      {conflict && (
        <ImportConflictModal
          open={true}
          incomingName={conflict.inspect.name}
          existing={conflict.existing}
          onOpenChange={(open) => {
            if (!open) setConflict(null);
          }}
          onResolve={handleConflictResolve}
        />
      )}
    </div>
  );
}

function EmptyState({
  searching,
  onCreate,
}: {
  searching: boolean;
  onCreate: () => void;
}) {
  if (searching) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum template encontrado para o termo buscado.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <h2 className="text-lg font-medium">Você ainda não tem templates</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Crie seu primeiro template para começar a desenhar etiquetas. Você
        poderá editar dimensões, fontes e códigos de barras depois.
      </p>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Novo template
      </Button>
    </div>
  );
}
