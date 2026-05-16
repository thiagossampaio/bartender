import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Modal genérico de confirmação destrutiva (SPEC-03 §"Comportamento esperado"
 * item 5 — confirmação ao excluir; também usado pela lixeira para "Excluir
 * definitivamente").
 *
 * Em ações irreversíveis (hard delete), exigimos confirmação dupla
 * (SPEC-13 §"Mudanças necessárias" — "hard delete de templates exige
 * confirmação dupla"). Modelado aqui como prop `requireDoubleConfirm`.
 */
interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  /** Quando `true`, exige clicar duas vezes no botão de confirmação. */
  requireDoubleConfirm?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  requireDoubleConfirm,
  onOpenChange,
  onConfirm,
}: ConfirmModalProps) {
  const [armed, setArmed] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setArmed(false);
      setWorking(false);
      setErrorMessage(null);
    }
  }, [open]);

  async function handleClick() {
    if (requireDoubleConfirm && !armed) {
      setArmed(true);
      return;
    }
    setWorking(true);
    setErrorMessage(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Erro inesperado.");
      setArmed(false);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {requireDoubleConfirm && armed && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Clique novamente para confirmar — esta ação é irreversível.
        </p>
      )}
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
          onClick={() => onOpenChange(false)}
          disabled={working}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleClick}
          disabled={working}
        >
          {working
            ? "Processando…"
            : requireDoubleConfirm && armed
              ? "Confirmar definitivamente"
              : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
