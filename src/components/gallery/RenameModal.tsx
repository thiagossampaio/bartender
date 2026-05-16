import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TemplateRow } from "@/lib/templates";

/**
 * Modal "Renomear template" (RF-T-04 / SPEC-03 §"Comportamento esperado" 4).
 *
 * Mantém o estado local independente do store — o store só recebe a confirmação
 * após o submit. Isso evita re-renders na galeria a cada keystroke.
 */
interface RenameModalProps {
  open: boolean;
  template: TemplateRow | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: number, newName: string) => Promise<void>;
}

export function RenameModal({
  open,
  template,
  onOpenChange,
  onSubmit,
}: RenameModalProps) {
  const [name, setName] = React.useState("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open && template) {
      setName(template.name);
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open, template]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!template) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setSubmitError("Nome não pode ser vazio.");
      return;
    }
    if (trimmed === template.name) {
      // Nada a fazer — fecha sem chamar backend para não bagunçar `updated_at`.
      onOpenChange(false);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(template.id, trimmed);
      onOpenChange(false);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Erro ao renomear.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Renomear template</DialogTitle>
          <DialogDescription>
            O novo nome será exibido na galeria e no editor.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rn-name">Nome</Label>
          <Input
            id="rn-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            required
            maxLength={120}
          />
        </div>
        {submitError && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
          >
            {submitError}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Salvando…" : "Renomear"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
