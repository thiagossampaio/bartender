import * as React from "react";
import { Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/gallery/ConfirmModal";
import { NewTemplateModal } from "@/components/gallery/NewTemplateModal";
import { RenameModal } from "@/components/gallery/RenameModal";
import { TemplateCard } from "@/components/gallery/TemplateCard";
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
 *  - Botão "Importar" desabilitado com tooltip (deferido para WP-14).
 *  - Acesso à Lixeira via header.
 */
export function Gallery() {
  const view = useTemplatesStore((s) => s.view);
  const active = useTemplatesStore((s) => s.active);
  const searchTerm = useTemplatesStore((s) => s.searchTerm);
  const loading = useTemplatesStore((s) => s.loading);
  const error = useTemplatesStore((s) => s.error);
  const setView = useTemplatesStore((s) => s.setView);
  const setSearchTerm = useTemplatesStore((s) => s.setSearchTerm);
  const refresh = useTemplatesStore((s) => s.refresh);
  const createTemplate = useTemplatesStore((s) => s.createTemplate);
  const duplicateTemplate = useTemplatesStore((s) => s.duplicateTemplate);
  const renameTemplate = useTemplatesStore((s) => s.renameTemplate);
  const softDeleteTemplate = useTemplatesStore((s) => s.softDeleteTemplate);

  const [newOpen, setNewOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<TemplateRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TemplateRow | null>(null);

  // Carrega na primeira renderização da galeria.
  React.useEffect(() => {
    if (view === "gallery") {
      void refresh();
    }
  }, [view, refresh]);

  const showEmptyState = !loading && !error && active.length === 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
            <p className="text-sm text-muted-foreground">
              Crie, organize e edite suas etiquetas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setView("trash")}
              aria-label="Abrir lixeira"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Lixeira
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Disponível em WP-14"
            >
              Importar
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo template
            </Button>
          </div>
        </div>
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome…"
            aria-label="Buscar templates"
            className="pl-9"
          />
        </div>
      </header>

      <main className="flex-1 overflow-auto px-6 py-6">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
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
                  onDuplicate={(id) => {
                    void duplicateTemplate(id);
                  }}
                  onRename={(template) => setRenameTarget(template)}
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
          await createTemplate(input);
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
