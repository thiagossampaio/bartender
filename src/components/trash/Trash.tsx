import * as React from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmModal } from "@/components/gallery/ConfirmModal";
import { useTemplatesStore } from "@/lib/stores/templates-store";
import type { TemplateRow } from "@/lib/templates";

/**
 * Página `Trash` (WP-03 / SPEC-03 §"Comportamento esperado" item 6).
 *
 * Lista templates com `deleted_at != NULL` e oferece:
 *  - Restaurar (zera `deleted_at`).
 *  - Excluir definitivamente (hard delete, com confirmação dupla — alinhado
 *    a [SPEC-13](../../../specs/specs.md#spec-13--confiabilidade-autosave-recovery-logs-lixeira)
 *    §"Mudanças necessárias").
 *
 * A lixeira NÃO purga automaticamente; só ações manuais do usuário removem.
 */
export function Trash() {
  const trashed = useTemplatesStore((s) => s.trashed);
  const loading = useTemplatesStore((s) => s.loading);
  const error = useTemplatesStore((s) => s.error);
  const refresh = useTemplatesStore((s) => s.refresh);
  const restoreTemplate = useTemplatesStore((s) => s.restoreTemplate);
  const hardDeleteTemplate = useTemplatesStore((s) => s.hardDeleteTemplate);

  const [hardDeleteTarget, setHardDeleteTarget] = React.useState<TemplateRow | null>(null);

  // Garante refresh ao abrir a página (mesmo que store já tenha sido populado).
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight">Lixeira</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Templates excluídos. Restaure ou apague em definitivo. Itens
            permanecem aqui indefinidamente — não há purga automática.
          </p>
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
        {loading && trashed.length === 0 && (
          <p className="text-sm text-muted-foreground">Carregando lixeira…</p>
        )}
        {!loading && trashed.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">
              A lixeira está vazia.
            </p>
          </div>
        )}
        {trashed.length > 0 && (
          <ul className="flex flex-col gap-3">
            {trashed.map((t) => (
              <li key={t.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate" title={t.name}>
                          {t.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {t.widthMm}×{t.heightMm} mm · {t.dpi} dpi · excluído em{" "}
                          {formatTimestamp(t.deletedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void restoreTemplate(t.id);
                          }}
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          Restaurar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setHardDeleteTarget(t)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Excluir definitivamente
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground">
                      Criado em {formatTimestamp(t.createdAt)} · última edição{" "}
                      {formatTimestamp(t.updatedAt)}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>

      <ConfirmModal
        open={hardDeleteTarget !== null}
        title={`Excluir definitivamente "${hardDeleteTarget?.name ?? ""}"?`}
        description="O template será removido permanentemente do banco, junto com seu histórico de impressões. Esta ação não pode ser desfeita."
        confirmLabel="Excluir definitivamente"
        requireDoubleConfirm
        onOpenChange={(open) => {
          if (!open) setHardDeleteTarget(null);
        }}
        onConfirm={async () => {
          if (hardDeleteTarget) {
            await hardDeleteTemplate(hardDeleteTarget.id);
          }
        }}
      />
    </div>
  );
}

function formatTimestamp(raw: string | null): string {
  if (!raw) return "—";
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
