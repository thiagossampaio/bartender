import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TemplateRow } from "@/lib/templates";
import type { ImportConflictResolution } from "@/lib/etlbl";

/**
 * Modal de conflito de nome no import `.etlbl` (WP-14 / SPEC-11).
 *
 * Aparece quando o arquivo `.etlbl` selecionado contém um template com nome
 * que já existe na galeria (ativo, não-deletado). Oferece três opções:
 *
 *  - **Substituir**: sobrescreve o template existente in-place, mantendo o
 *    `id` (preserva `print_history` que referencia este id).
 *  - **Manter ambos**: adiciona sufixo " (N)" ao nome importado para
 *    convivência.
 *  - **Cancelar**: descarta o import.
 */
interface ImportConflictModalProps {
  open: boolean;
  /** Nome no arquivo `.etlbl`. Igual ao do template existente. */
  incomingName: string;
  /** Template ativo já no banco com o mesmo nome. */
  existing: TemplateRow;
  onOpenChange: (open: boolean) => void;
  onResolve: (resolution: ImportConflictResolution) => Promise<void> | void;
}

export function ImportConflictModal({
  open,
  incomingName,
  existing,
  onOpenChange,
  onResolve,
}: ImportConflictModalProps) {
  const [working, setWorking] = React.useState<
    ImportConflictResolution | null
  >(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setWorking(null);
      setErrorMessage(null);
    }
  }, [open]);

  async function handle(resolution: ImportConflictResolution) {
    setWorking(resolution);
    setErrorMessage(null);
    try {
      await onResolve(resolution);
      onOpenChange(false);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Já existe um template com este nome</DialogTitle>
        <DialogDescription>
          O arquivo importado contém um template chamado
          {" "}
          <strong className="font-medium text-foreground">
            “{incomingName}”
          </strong>
          , que já existe na sua galeria.
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <p className="font-medium">Template existente</p>
        <p className="text-muted-foreground">
          {existing.widthMm}×{existing.heightMm} mm · {existing.dpi} dpi ·
          {" atualizado "}
          {formatTimestamp(existing.updatedAt)}
        </p>
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => handle("cancel")}
          disabled={working !== null}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handle("keep-both")}
          disabled={working !== null}
        >
          {working === "keep-both" ? "Importando…" : "Manter ambos"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => handle("replace")}
          disabled={working !== null}
        >
          {working === "replace" ? "Substituindo…" : "Substituir"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function formatTimestamp(raw: string): string {
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
