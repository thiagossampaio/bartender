import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Printer as PrinterIcon, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  languageBadge,
  printersList,
  translatePrinterError,
  type PrinterInfo,
} from "@/lib/printers";
import { cn } from "@/lib/utils";

/**
 * Modal compartilhado entre as ações de "Calibrar" e "Imprimir página de
 * teste" do menu Impressora (WP-15 / SPEC-12 §"Comportamento esperado"
 * itens 3 e 4).
 *
 * Lista as impressoras detectadas + badge Argox/Zebra; o botão da ação fica
 * **desabilitado** para impressoras sem linguagem nativa inferida — não há
 * comando portátil de calibração via driver do SO, e o critério SPEC-12 só
 * pede suporte para Argox/Zebra.
 *
 * Reusa as primitivas do `Dialog` (WP-03) — sem portal extra; ESC + click
 * no backdrop fecham.
 */
export type PrinterToolMode = "calibrate" | "test";

interface PrinterToolsModalProps {
  open: boolean;
  mode: PrinterToolMode;
  onOpenChange: (open: boolean) => void;
}

export function PrinterToolsModal({
  open,
  mode,
  onOpenChange,
}: PrinterToolsModalProps) {
  const [printers, setPrinters] = React.useState<PrinterInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionResult, setActionResult] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const list = await printersList();
      setPrinters(list);
      // Auto-select: prefere impressora nativa detectada; cai para default
      // do SO; cai para a primeira da lista.
      setSelected((prev) => {
        if (prev && list.some((p) => p.systemName === prev)) return prev;
        const native = list.find(
          (p) => p.language === "PPLB" || p.language === "ZPL",
        );
        if (native) return native.systemName;
        const def = list.find((p) => p.isDefault);
        return def?.systemName ?? list[0]?.systemName ?? null;
      });
    } catch (e) {
      setListError(translatePrinterError(e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      setActionError(null);
      setActionResult(null);
      void reload();
    }
  }, [open, reload]);

  const sel = printers.find((p) => p.systemName === selected) ?? null;
  const supported = sel?.language === "PPLB" || sel?.language === "ZPL";

  const action = mode === "calibrate" ? "printer_calibrate" : "printer_test_page";
  const title =
    mode === "calibrate" ? "Calibrar impressora" : "Imprimir página de teste";
  const description =
    mode === "calibrate"
      ? "Envia o comando de auto-sense (Argox: U, Zebra: ~JC). Útil quando as etiquetas saem deslocadas."
      : "Imprime uma etiqueta com nome do modelo, linguagem e DPI configurados.";
  const actionLabel =
    mode === "calibrate" ? "Calibrar" : "Imprimir página de teste";

  async function handleAction() {
    if (!sel || !supported) return;
    setWorking(true);
    setActionError(null);
    setActionResult(null);
    try {
      const jobId = await invoke<string>(action, {
        printerName: sel.systemName,
      });
      setActionResult(
        mode === "calibrate"
          ? `Comando de calibração enviado (job ${jobId}).`
          : `Página de teste enviada (job ${jobId}).`,
      );
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setActionError(translatePrinterError(raw));
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

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Impressoras detectadas</h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void reload()}
            disabled={loading || working}
            title="Atualizar lista de impressoras"
          >
            <RefreshCw
              className={cn("h-4 w-4", loading && "animate-spin")}
              aria-hidden="true"
            />
            Atualizar
          </Button>
        </div>

        {listError && (
          <p role="alert" className="text-sm text-destructive">
            {listError}
          </p>
        )}

        {loading && printers.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Detectando impressoras…
          </div>
        ) : printers.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            Nenhuma impressora detectada no sistema.
          </div>
        ) : (
          <ul
            role="radiogroup"
            aria-label="Impressoras detectadas"
            className="space-y-2"
          >
            {printers.map((p) => {
              const checked = p.systemName === selected;
              const native = p.language === "PPLB" || p.language === "ZPL";
              const badge = languageBadge(p.language);
              return (
                <li key={p.systemName}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                      checked
                        ? "border-primary bg-primary/5"
                        : "border-input hover:bg-accent",
                      !native && "opacity-70",
                    )}
                  >
                    <input
                      type="radio"
                      name="printer-tool"
                      className="mt-1"
                      checked={checked}
                      onChange={() => setSelected(p.systemName)}
                      disabled={working}
                    />
                    <PrinterIcon
                      className="mt-0.5 h-4 w-4"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {p.friendlyName}
                        </span>
                        {p.isDefault && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            Padrão
                          </span>
                        )}
                        {badge && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            {badge}
                          </span>
                        )}
                        {!native && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            sem linguagem nativa
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {p.systemName}
                        {p.driver ? ` · ${p.driver}` : ""}
                      </p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {sel && !supported && (
          <p
            className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
            role="status"
          >
            Esta impressora não foi detectada como Argox/Zebra. A ação só está
            disponível para impressoras com linguagem nativa inferida.
          </p>
        )}

        {actionError && (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        )}
        {actionResult && (
          <p
            role="status"
            className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2 text-sm text-emerald-900"
          >
            {actionResult}
          </p>
        )}
      </section>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={working}
        >
          Fechar
        </Button>
        <Button
          type="button"
          onClick={() => void handleAction()}
          disabled={!sel || !supported || working}
        >
          {working ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Enviando…
            </>
          ) : (
            actionLabel
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
