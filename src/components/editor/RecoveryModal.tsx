import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Modal "Recuperar trabalho não salvo?" (WP-16 / SPEC-13 §"Comportamento
 * esperado" item 2).
 *
 * Aparece ao abrir um template quando há um autosave mais recente que o
 * último save persistido (`updated_at`). Três caminhos:
 *
 *  - **Recuperar:** descarta o canvas vindo do banco e adota o snapshot do
 *    autosave; o editor abre como "dirty" (a recuperação ainda não foi
 *    persistida — o usuário decide quando salvar).
 *  - **Descartar:** apaga o autosave e segue com a versão do banco.
 *  - **Cancelar:** fecha o modal sem decidir (próximo timer reabre o
 *    fluxo na próxima vez que o editor for aberto).
 */
export interface RecoveryModalProps {
  open: boolean;
  /** Carimbo do snapshot do autosave (formatado em pt-BR). */
  snapshotAt: string;
  /** Carimbo do último save persistido (formatado em pt-BR). */
  lastSavedAt: string;
  onOpenChange: (open: boolean) => void;
  onRecover: () => void;
  onDiscard: () => void;
}

export function RecoveryModal({
  open,
  snapshotAt,
  lastSavedAt,
  onOpenChange,
  onRecover,
  onDiscard,
}: RecoveryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Recuperar trabalho não salvo?</DialogTitle>
        <DialogDescription>
          Encontramos um snapshot automático mais recente que o último salvamento
          deste template. Você pode recuperar esse trabalho ou descartá-lo.
        </DialogDescription>
      </DialogHeader>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Snapshot automático:</dt>
        <dd>{snapshotAt}</dd>
        <dt className="text-muted-foreground">Último salvamento:</dt>
        <dd>{lastSavedAt}</dd>
      </dl>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Decidir depois
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onDiscard();
            onOpenChange(false);
          }}
        >
          Descartar
        </Button>
        <Button
          type="button"
          onClick={() => {
            onRecover();
            onOpenChange(false);
          }}
        >
          Recuperar
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
