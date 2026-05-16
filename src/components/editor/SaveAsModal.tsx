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

/**
 * Modal "Salvar como" do editor (WP-05 / RF-E-20).
 *
 * Pede um nome para o novo template. O estado em memória do editor é
 * persistido como **novo registro** mantendo dimensões/dpi/orientação do
 * original. O caller (página `Editor`) chama `templatesSaveAs` quando o
 * usuário confirma.
 */
interface SaveAsModalProps {
  open: boolean;
  defaultName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (newName: string) => Promise<void>;
}

export function SaveAsModal({
  open,
  defaultName,
  onOpenChange,
  onSubmit,
}: SaveAsModalProps) {
  const [name, setName] = React.useState("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(defaultName);
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open, defaultName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setSubmitError("Nome não pode ser vazio.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Erro ao salvar como.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Salvar como</DialogTitle>
          <DialogDescription>
            Cria um novo template a partir do estado atual, mantendo dimensões e
            DPI do original. O template original permanece inalterado.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sa-name">Nome do novo template</Label>
          <Input
            id="sa-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            required
            maxLength={120}
            autoFocus
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
            {submitting ? "Salvando…" : "Salvar como"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
