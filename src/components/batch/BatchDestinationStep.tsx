import * as React from "react";
import { FileDown, Loader2, Printer as PrinterIcon, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  languageBadge,
  printersList,
  translatePrinterError,
  type PrinterInfo,
  type PrinterStatus,
} from "@/lib/printers";
import { cn } from "@/lib/utils";
import type { BatchDestination } from "@/lib/batch/types";

/**
 * Step "Destino" do BatchPrintWizard (WP-13 / SPEC-07 §"Comportamento esperado" item 7).
 *
 * Compõe duas decisões em uma única tela:
 *  1. **Destino**: PDF (exporta arquivo) **ou** impressora detectada.
 *  2. **Modo** (somente impressoras Argox/Zebra): "Modo nativo (PPLB/ZPL)"
 *     toggle ON por padrão, conforme RF-I-03.
 *
 * Mantém o mesmo padrão visual do `PrintDialog` (WP-09) para evitar dois
 * "looks" diferentes de seleção de impressora no app.
 */
export interface BatchDestinationStepProps {
  destination: BatchDestination;
  onDestinationChange: (d: BatchDestination) => void;
  /** Total de etiquetas que serão impressas (informativo). */
  totalLabels: number;
  /** Nome do template — só usado para o card "Exportar PDF". */
  templateName: string;
}

export function BatchDestinationStep({
  destination,
  onDestinationChange,
  totalLabels,
  templateName,
}: BatchDestinationStepProps) {
  const [printers, setPrinters] = React.useState<PrinterInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const list = await printersList();
      setPrinters(list);
      // Se o destino atual é uma impressora que sumiu, devolvemos para PDF.
      if (destination.kind !== "pdf") {
        const stillThere = list.some(
          (p) => p.systemName === destination.printerName,
        );
        if (!stillThere) {
          onDestinationChange({ kind: "pdf" });
        }
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setListError(translatePrinterError(raw));
    } finally {
      setLoading(false);
    }
  }, [destination, onDestinationChange]);

  React.useEffect(() => {
    void reload();
    // intencional: só queremos carregar uma vez ao montar; mudanças no
    // destination não devem disparar reload (o checkbox/radios chamam
    // diretamente).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentName =
    destination.kind === "pdf" ? null : destination.printerName;

  function pickPdf() {
    onDestinationChange({ kind: "pdf" });
  }

  function pickPrinter(p: PrinterInfo) {
    if (p.language === "PPLB" || p.language === "ZPL") {
      onDestinationChange({
        kind: "native",
        printerName: p.systemName,
        language: p.language,
      });
    } else {
      onDestinationChange({ kind: "driver", printerName: p.systemName });
    }
  }

  function toggleNative(p: PrinterInfo, on: boolean) {
    if (on && (p.language === "PPLB" || p.language === "ZPL")) {
      onDestinationChange({
        kind: "native",
        printerName: p.systemName,
        language: p.language,
      });
    } else {
      onDestinationChange({ kind: "driver", printerName: p.systemName });
    }
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold">Para onde enviar o lote?</h3>
        <p className="text-xs text-muted-foreground">
          {totalLabels} etiqueta{totalLabels === 1 ? "" : "s"} pronta
          {totalLabels === 1 ? "" : "s"} para o destino selecionado.
        </p>
      </header>

      {/* PDF */}
      <label
        className={cn(
          "block cursor-pointer rounded-md border p-3 transition-colors",
          destination.kind === "pdf"
            ? "border-primary bg-primary/5"
            : "border-input hover:bg-accent",
        )}
      >
        <div className="flex items-start gap-3">
          <input
            type="radio"
            name="batch-dest"
            className="mt-1"
            checked={destination.kind === "pdf"}
            onChange={pickPdf}
          />
          <FileDown className="mt-0.5 h-4 w-4" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Exportar como PDF</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Gera <code>{templateName}_AAAA-MM-DD_HHmm.pdf</code> com{" "}
              {totalLabels} página{totalLabels === 1 ? "" : "s"} vetorial
              {totalLabels === 1 ? "" : "is"}.
            </p>
          </div>
        </div>
      </label>

      {/* Impressoras */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-medium">Impressoras detectadas</h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void reload()}
            disabled={loading}
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
          <p role="alert" className="mb-2 text-sm text-destructive">
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
            Nenhuma impressora detectada. Você ainda pode exportar como PDF.
          </div>
        ) : (
          <ul className="space-y-2" role="radiogroup" aria-label="Impressoras detectadas">
            {printers.map((p) => {
              const checked = p.systemName === currentName;
              const native =
                checked &&
                destination.kind === "native" &&
                destination.printerName === p.systemName;
              const badge = languageBadge(p.language);
              return (
                <li key={p.systemName}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                      checked
                        ? "border-primary bg-primary/5"
                        : "border-input hover:bg-accent",
                    )}
                  >
                    <input
                      type="radio"
                      name="batch-dest"
                      className="mt-1"
                      checked={checked}
                      onChange={() => pickPrinter(p)}
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
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {p.systemName}
                        {p.driver ? ` · ${p.driver}` : ""}
                      </p>

                      {checked &&
                        (p.language === "PPLB" || p.language === "ZPL") && (
                          <div className="mt-2 flex items-start gap-2 rounded-md border bg-card p-2">
                            <input
                              id={`native-${p.systemName}`}
                              type="checkbox"
                              className="mt-1"
                              checked={native}
                              onChange={(e) => toggleNative(p, e.target.checked)}
                            />
                            <div className="min-w-0 flex-1">
                              <label
                                htmlFor={`native-${p.systemName}`}
                                className="text-sm font-medium"
                              >
                                Modo nativo ({p.language})
                              </label>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Envia comandos {p.language} diretamente à
                                impressora — recomendado para Argox/Zebra.
                              </p>
                            </div>
                          </div>
                        )}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: PrinterStatus }) {
  const label =
    status === "ready"
      ? "Pronta"
      : status === "printing"
        ? "Imprimindo"
        : status === "paused"
          ? "Pausada"
          : status === "offline"
            ? "Offline"
            : "Desconhecido";
  const tone =
    status === "ready"
      ? "bg-emerald-100 text-emerald-800"
      : status === "printing"
        ? "bg-sky-100 text-sky-800"
        : status === "paused"
          ? "bg-amber-100 text-amber-800"
          : status === "offline"
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        tone,
      )}
    >
      {label}
    </span>
  );
}
