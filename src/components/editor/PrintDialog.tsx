import * as React from "react";
import { Loader2, Printer as PrinterIcon, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { historyRecord } from "@/lib/history";
import {
  languageBadge,
  printersGetStatus,
  printersList,
  printersMarkUsed,
  printersPrintRaster,
  translatePrinterError,
  type PrinterInfo,
  type PrinterStatus,
} from "@/lib/printers";
import { cn } from "@/lib/utils";

/**
 * Wizard de impressão — WP-09 / SPEC-09.
 *
 * Aderente à [SPEC-09 §"Comportamento esperado"]:
 *  1. Lista impressoras detectadas no SO (RF-I-01).
 *  2. Cada item mostra nome amigável + badge Argox/Zebra quando inferido
 *     (RF-I-02). Argox/Zebra ganham o toggle **"Modo nativo (PPLB/ZPL)"**
 *     ligado por padrão (RF-I-03 — o caminho raw entra em WP-10/WP-11; aqui
 *     apenas registramos a intenção do usuário).
 *  3. Para outras impressoras, modo fica fixo "Driver do SO" (RF-I-04).
 *  4. Quantidade total de cópias com input numérico simples (RF-I-05).
 *  5. Erros do spooler (offline, sem papel, etc.) viram mensagem PT-BR via
 *     `translatePrinterError` (RF-I-08).
 *
 * Integração com [WP-10]/[WP-11]: o callback `onPrint` recebe a impressora
 * selecionada + modo escolhido + cópias; o caller decide se chama o pipeline
 * raster (`printersPrintRaster` — modo driver) ou o futuro raw PPLB/ZPL.
 * Hoje (WP-09) só o caminho raster é executado quando `nativeMode === false`;
 * com `nativeMode === true` em impressora Argox/Zebra, o componente delega
 * ao caller via `onNativeIntent` — placeholder até [WP-10]/[WP-11].
 */
export interface PrintRequest {
  printer: PrinterInfo;
  copies: number;
  /** `true` quando o usuário escolheu o modo nativo (PPLB/ZPL). */
  nativeMode: boolean;
}

export interface PrintDialogProps {
  open: boolean;
  /** Bytes do PDF gerado (modo driver). Calculados sob demanda pelo caller. */
  getPdfBytes: () => Promise<Uint8Array>;
  onOpenChange: (open: boolean) => void;
  /**
   * Chamado quando o usuário escolhe imprimir em modo nativo (PPLB/ZPL).
   * O caller é responsável por delegar a `pplbPrint` / `zplPrint`, que já
   * registram em `print_history` ([WP-15] / [SPEC-12]).
   */
  onNativeIntent?: (req: PrintRequest) => Promise<void> | void;
  /** Notificação opcional de sucesso (job id retornado pelo spooler). */
  onPrinted?: (req: PrintRequest, jobId: string) => void;
  /**
   * Id do template aberto — propagado para `print_history` quando o modo
   * driver-do-SO é usado (WP-15 / SPEC-12 critério 1). Sem este id, a
   * impressão sai mas não fica no histórico para reimpressão.
   */
  templateId?: number;
}

export function PrintDialog({
  open,
  getPdfBytes,
  onOpenChange,
  onNativeIntent,
  onPrinted,
  templateId,
}: PrintDialogProps) {
  const [printers, setPrinters] = React.useState<PrinterInfo[]>([]);
  const [statusByName, setStatusByName] = React.useState<Record<string, PrinterStatus>>(
    {},
  );
  const [loading, setLoading] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);
  const [selectedName, setSelectedName] = React.useState<string | null>(null);
  const [copies, setCopies] = React.useState(1);
  const [nativeMode, setNativeMode] = React.useState(false);
  const [printing, setPrinting] = React.useState(false);
  const [printError, setPrintError] = React.useState<string | null>(null);
  const [printResult, setPrintResult] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const list = await printersList();
      setPrinters(list);
      setStatusByName(
        Object.fromEntries(list.map((p) => [p.systemName, p.status])),
      );
      // Auto-select: preferir a default do SO, senão a primeira da lista.
      setSelectedName((prev) => {
        if (prev && list.some((p) => p.systemName === prev)) return prev;
        const def = list.find((p) => p.isDefault);
        return def?.systemName ?? list[0]?.systemName ?? null;
      });
    } catch (e) {
      setListError(
        e instanceof Error ? e.message : "Falha ao listar impressoras.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Carrega ao abrir; reseta estado ao fechar.
  React.useEffect(() => {
    if (open) {
      setPrintError(null);
      setPrintResult(null);
      void reload();
    }
  }, [open, reload]);

  // ESC fecha + trava scroll do body enquanto aberto.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onOpenChange]);

  // Quando o usuário escolhe uma impressora Argox/Zebra, marca modo nativo
  // por padrão (RF-I-03). Em outras, força "driver".
  React.useEffect(() => {
    const p = printers.find((x) => x.systemName === selectedName);
    if (!p) return;
    if (p.language === "PPLB" || p.language === "ZPL") {
      setNativeMode(true);
    } else {
      setNativeMode(false);
    }
  }, [selectedName, printers]);

  const selected = printers.find((p) => p.systemName === selectedName) ?? null;

  const handlePrint = React.useCallback(async () => {
    if (!selected) return;
    const req: PrintRequest = { printer: selected, copies, nativeMode };
    setPrinting(true);
    setPrintError(null);
    setPrintResult(null);
    try {
      // Refresca o status na hora — se a impressora foi para offline entre a
      // listagem e o clique, mostramos mensagem clara antes de tentar.
      const status = await printersGetStatus(selected.systemName);
      setStatusByName((m) => ({ ...m, [selected.systemName]: status }));
      if (status === "paused") {
        throw new Error(translatePrinterError("paused"));
      }

      if (nativeMode && (selected.language === "PPLB" || selected.language === "ZPL")) {
        // Modo nativo (PPLB no WP-10; ZPL no WP-11). Delega ao caller, que
        // chamará o tradutor + envio raw e atualizará `printers.last_used_at`
        // / `print_history`. Em sucesso, mostramos o mesmo feedback do path
        // raster.
        if (onNativeIntent) {
          await onNativeIntent(req);
          setPrintResult(
            `Etiqueta enviada em modo nativo (${selected.language}).`,
          );
        } else {
          throw new Error(
            "Impressão em modo nativo (PPLB/ZPL) ainda não foi conectada nesta tela.",
          );
        }
      } else {
        const bytes = await getPdfBytes();
        const jobId = await printersPrintRaster(
          selected.systemName,
          bytes,
          copies,
        );
        await printersMarkUsed(selected.systemName);
        // WP-15: registra a impressão manual via driver no histórico para
        // habilitar reimpressão posterior. Best-effort (não interrompe a
        // feedback de sucesso se o INSERT falhar).
        if (typeof templateId === "number" && templateId > 0) {
          void historyRecord({
            templateId,
            printerName: selected.systemName,
            mode: "driver",
            quantity: copies,
            dataSource: "manual",
          });
        }
        setPrintResult(`Job enviado: ${jobId}`);
        onPrinted?.(req, jobId);
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setPrintError(translatePrinterError(raw));
    } finally {
      setPrinting(false);
    }
  }, [
    selected,
    copies,
    nativeMode,
    getPdfBytes,
    onPrinted,
    onNativeIntent,
    templateId,
  ]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border bg-background shadow-xl">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <PrinterIcon className="h-4 w-4" aria-hidden="true" />
            <h2 id="print-dialog-title" className="text-base font-semibold">
              Imprimir
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void reload()}
              disabled={loading || printing}
              aria-label="Atualizar lista de impressoras"
              title="Atualizar lista de impressoras"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              disabled={printing}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4">
          {listError && (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {listError}
            </p>
          )}

          {loading && printers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Detectando impressoras…</p>
          ) : printers.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center">
              <p className="text-sm font-medium">Nenhuma impressora detectada</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Verifique se a impressora está conectada e instalada no sistema.
              </p>
            </div>
          ) : (
            <fieldset>
              <legend className="text-sm font-medium">Impressoras detectadas</legend>
              <ul role="radiogroup" aria-label="Impressoras detectadas" className="mt-2 space-y-2">
                {printers.map((p) => {
                  const checked = p.systemName === selectedName;
                  const badge = languageBadge(p.language);
                  const status = statusByName[p.systemName] ?? p.status;
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
                          name="printer"
                          checked={checked}
                          onChange={() => setSelectedName(p.systemName)}
                          className="mt-1"
                          aria-label={`Selecionar ${p.friendlyName}`}
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
                            <StatusBadge status={status} />
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
            </fieldset>
          )}

          {selected && (
            <div className="mt-4 space-y-4">
              {(selected.language === "PPLB" || selected.language === "ZPL") && (
                <div className="flex items-start gap-3 rounded-md border bg-card p-3">
                  <input
                    id="native-mode"
                    type="checkbox"
                    checked={nativeMode}
                    onChange={(e) => setNativeMode(e.target.checked)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="native-mode" className="text-sm font-medium">
                      Modo nativo ({selected.language})
                    </Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Envia comandos {selected.language} diretamente à impressora,
                      garantindo alinhamento preciso. Recomendado para Argox/Zebra.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Label htmlFor="copies" className="text-sm">
                  Cópias
                </Label>
                <Input
                  id="copies"
                  type="number"
                  min={1}
                  max={9999}
                  value={copies}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    setCopies(Number.isFinite(n) && n > 0 ? Math.min(9999, n) : 1);
                  }}
                  className="w-24"
                />
              </div>
            </div>
          )}

          {printError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {printError}
            </p>
          )}
          {printResult && (
            <p role="status" className="mt-3 text-sm text-emerald-700">
              {printResult}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={printing}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void handlePrint()}
            disabled={!selected || printing || loading}
          >
            {printing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Enviando…
              </>
            ) : (
              <>
                <PrinterIcon className="h-4 w-4" aria-hidden="true" />
                Imprimir
              </>
            )}
          </Button>
        </footer>
      </div>
    </div>
  );
}

/** Pílula colorida para o status do spooler. */
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
