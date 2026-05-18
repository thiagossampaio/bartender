import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileDown,
  Loader2,
  Printer as PrinterIcon,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { BatchFilterStep } from "@/components/batch/BatchFilterStep";
import { parseSelectionText } from "@/lib/batch/selection-text";
import { BatchValidationStep } from "@/components/batch/BatchValidationStep";
import { BatchPreviewStep } from "@/components/batch/BatchPreviewStep";
import { BatchDestinationStep } from "@/components/batch/BatchDestinationStep";
import type { CanvasDef, CanvasObject } from "@/lib/canvas/types";
import type { ColumnMapping } from "@/lib/data/mapping";
import type { ParsedDataset } from "@/lib/data/parsers";
import type { PlaceholderInfo } from "@/lib/data/placeholders";
import { expandBatchPlan } from "@/lib/batch/expand";
import { composePhysicalPages, normalizeLayout } from "@/lib/batch/compose";
import { runBatch, type RunBatchResult } from "@/lib/batch/runner";
import {
  resolveQuantities,
  resolveRowIndices,
  totalLabels as sumQuantities,
} from "@/lib/batch/selection";
import type {
  BatchDestination,
  BatchPlan,
  RowFilter,
  RowQuantity,
} from "@/lib/batch/types";
import { validateBatch } from "@/lib/batch/validation";
import { translatePrinterError } from "@/lib/printers";
import { cn } from "@/lib/utils";

/**
 * Wizard de Impressão em Lote (WP-13 / SPEC-07 §"Comportamento esperado").
 *
 * Composição:
 *   1. Filtro / Quantidade (`BatchFilterStep`).
 *   2. Validação (`BatchValidationStep`).
 *   3. Preview do lote (`BatchPreviewStep`).
 *   4. Destino (`BatchDestinationStep`).
 *   5. Execução → mensagem de sucesso.
 *
 * Decisões:
 *  - **Estado local com `useReducer`-like via múltiplos `useState`**: o
 *    BatchPlan é simples o suficiente. Quando o WP-15 trouxer histórico,
 *    podemos promover para um Zustand store dedicado.
 *  - **"Avançar" bloqueado por erros críticos** (RF-D-07).
 *  - **CSP-friendly**: sem inline styles; reutiliza primitivas Button/Input.
 *  - **A11y**: `role="dialog"`, `aria-modal="true"`, ESC fecha, foco vai
 *    para o título ao abrir. Stepper acessível com `aria-current`.
 */
export interface BatchPrintWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Snapshot do canvas/objects do template aberto. */
  canvas: CanvasDef;
  objects: readonly CanvasObject[];
  /** Resultado do `DataImportDialog` (WP-12). */
  dataset: ParsedDataset;
  mapping: ColumnMapping;
  placeholders: PlaceholderInfo[];
  /** Nome amigável para feedback e nome de arquivo do PDF. */
  templateName: string;
  /** Id do template aberto — propagado para `print_history`. */
  templateId?: number;
}

type Step = "filter" | "validate" | "preview" | "destination" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "filter", label: "Filtro / Quantidade" },
  { id: "validate", label: "Validação" },
  { id: "preview", label: "Preview do lote" },
  { id: "destination", label: "Destino" },
];

const PREVIEW_LIMIT = 10;

export function BatchPrintWizard({
  open,
  onOpenChange,
  canvas,
  objects,
  dataset,
  mapping,
  placeholders,
  templateName,
  templateId,
}: BatchPrintWizardProps) {
  const [step, setStep] = React.useState<Step>("filter");
  const [filter, setFilter] = React.useState<RowFilter>({ kind: "all" });
  const [selectionText, setSelectionText] = React.useState("");
  const [quantity, setQuantity] = React.useState<RowQuantity>({
    kind: "fixed",
    value: 1,
  });
  const [destination, setDestination] = React.useState<BatchDestination>({
    kind: "pdf",
  });
  const [running, setRunning] = React.useState(false);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [runResult, setRunResult] = React.useState<RunBatchResult | null>(null);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(
    null,
  );

  // Reseta tudo ao reabrir o wizard.
  React.useEffect(() => {
    if (open) {
      setStep("filter");
      setFilter({ kind: "all" });
      setSelectionText("");
      setQuantity({ kind: "fixed", value: 1 });
      setDestination({ kind: "pdf" });
      setRunning(false);
      setRunError(null);
      setRunResult(null);
      setProgress(null);
    }
  }, [open, dataset]);

  // ESC fecha + trava scroll do body.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !running) {
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
  }, [open, running, onOpenChange]);

  // Parse da seleção manual em tempo real (memoizado para evitar re-parse
  // entre re-renders sem mudança).
  const selectionParse = React.useMemo(
    () => parseSelectionText(selectionText, dataset.rows.length),
    [selectionText, dataset.rows.length],
  );

  // Filtro efetivo — quando o usuário escolheu "seleção manual" mas o texto
  // está vazio/erro, devolvemos lista vazia que cai como aviso.
  const effectiveFilter = React.useMemo<RowFilter>(() => {
    if (filter.kind === "selection") {
      return { kind: "selection", rows: selectionParse.rows };
    }
    return filter;
  }, [filter, selectionParse.rows]);

  const rowIndices = React.useMemo(
    () => resolveRowIndices(dataset, effectiveFilter),
    [dataset, effectiveFilter],
  );
  const quantities = React.useMemo(
    () => resolveQuantities(dataset, rowIndices, quantity),
    [dataset, rowIndices, quantity],
  );
  const totalLabels = sumQuantities(quantities);

  const validationSummary = React.useMemo(() => {
    if (step !== "validate" && step !== "preview" && step !== "destination") {
      // Só rodamos quando entramos na step de validação ou subsequentes.
      return null;
    }
    return validateBatch({
      dataset,
      rowIndices,
      quantities,
      mapping,
      objects,
    });
    // `objects` é uma array readonly — comparação por referência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, dataset, rowIndices, quantities, mapping, objects]);

  // Expansão de páginas — só na step de preview, e capa em PREVIEW_LIMIT
  // **etiquetas lógicas**. Depois agrupamos em páginas físicas (multi-up).
  const previewBundle = React.useMemo(() => {
    if (step !== "preview") {
      return { physicalPages: [], totalPhysical: 0 };
    }
    const plan: BatchPlan = {
      dataset,
      mapping,
      placeholders,
      canvas,
      objects: [...objects],
      filter: effectiveFilter,
      quantity,
    };
    const layout = normalizeLayout(canvas.layout);
    const perPage = layout.columns * layout.rows;
    // Expandimos `PREVIEW_LIMIT * perPage` etiquetas lógicas (no máximo) para
    // gerar até `PREVIEW_LIMIT` páginas físicas mesmo em multi-up denso.
    const expandedSample = expandBatchPlan(plan, {
      limit: PREVIEW_LIMIT * perPage,
    }).pages;
    const physicalPages = composePhysicalPages(expandedSample, layout);
    // Total real de páginas físicas: divide total lógico por slots-por-página
    // (com ceil para cobrir a última página parcial).
    const totalLogicalAll = sumQuantities(quantities);
    const totalPhysical = Math.ceil(totalLogicalAll / perPage);
    return {
      physicalPages: physicalPages.slice(0, PREVIEW_LIMIT),
      totalPhysical,
    };
  }, [
    step,
    dataset,
    mapping,
    placeholders,
    canvas,
    objects,
    effectiveFilter,
    quantity,
    quantities,
  ]);
  const previewPages = previewBundle.physicalPages;
  const totalPhysicalPages = previewBundle.totalPhysical;

  const canAdvance = React.useMemo(() => {
    if (step === "filter") {
      if (totalLabels <= 0) return false;
      if (
        filter.kind === "selection" &&
        (selectionParse.error !== null || selectionParse.rows.length === 0)
      ) {
        return false;
      }
      return true;
    }
    if (step === "validate") {
      return !validationSummary || validationSummary.criticalCount === 0;
    }
    if (step === "preview") {
      return previewPages.length > 0;
    }
    if (step === "destination") {
      // Ainda precisa de runBatch para concluir; "Avançar" vira "Imprimir".
      return true;
    }
    return false;
  }, [
    step,
    filter.kind,
    selectionParse,
    totalLabels,
    validationSummary,
    previewPages.length,
  ]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const currentStepLabel = STEPS[stepIndex]?.label ?? "—";

  function goBack() {
    if (step === "validate") setStep("filter");
    else if (step === "preview") setStep("validate");
    else if (step === "destination") setStep("preview");
  }

  function goNext() {
    if (step === "filter") setStep("validate");
    else if (step === "validate") setStep("preview");
    else if (step === "preview") setStep("destination");
  }

  async function execute() {
    if (running) return;
    setRunError(null);
    setRunResult(null);
    setProgress({ done: 0, total: totalLabels });
    setRunning(true);
    try {
      const plan: BatchPlan = {
        dataset,
        mapping,
        placeholders,
        canvas,
        objects: [...objects],
        filter: effectiveFilter,
        quantity,
      };
      const res = await runBatch({
        plan,
        destination,
        templateName,
        templateId,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (res.cancelled) {
        // Usuário cancelou o diálogo de save — não troca de step, só limpa.
        setProgress(null);
        return;
      }
      setRunResult(res);
      setStep("done");
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setRunError(translatePrinterError(raw));
    } finally {
      setRunning(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-wizard-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border bg-background shadow-xl">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <PrinterIcon className="h-4 w-4" aria-hidden="true" />
            <h2 id="batch-wizard-title" className="text-base font-semibold">
              Impressão em lote
            </h2>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              · {templateName} · {dataset.rows.length} linha
              {dataset.rows.length === 1 ? "" : "s"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            disabled={running}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>

        {/* Stepper */}
        <nav
          aria-label="Etapas do wizard"
          className="flex items-center gap-1 border-b bg-muted/30 px-4 py-2 text-xs"
        >
          {STEPS.map((s, i) => {
            const active = s.id === step;
            const done = i < stepIndex || step === "done";
            return (
              <React.Fragment key={s.id}>
                <span
                  className={cn(
                    "rounded-full px-2 py-1 font-medium",
                    active && "bg-primary text-primary-foreground",
                    !active && done && "text-emerald-700",
                    !active && !done && "text-muted-foreground",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  {i + 1}. {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="text-muted-foreground/40" aria-hidden="true">
                    ›
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        <div className="flex-1 overflow-auto p-4">
          {step === "filter" && (
            <BatchFilterStep
              totalRows={dataset.rows.length}
              columns={dataset.headers}
              filter={filter}
              onFilterChange={setFilter}
              selectionText={selectionText}
              onSelectionTextChange={setSelectionText}
              selectionError={selectionParse.error}
              quantity={quantity}
              onQuantityChange={setQuantity}
            />
          )}
          {step === "validate" && validationSummary && (
            <BatchValidationStep
              summary={validationSummary}
              totalLabels={totalLabels}
              selectedRows={rowIndices.length}
            />
          )}
          {step === "preview" && (
            <BatchPreviewStep
              pages={previewPages}
              totalLabels={totalLabels}
              totalPhysicalPages={totalPhysicalPages}
              selectedRows={rowIndices.length}
              previewCount={PREVIEW_LIMIT}
            />
          )}
          {step === "destination" && (
            <BatchDestinationStep
              destination={destination}
              onDestinationChange={setDestination}
              totalLabels={totalLabels}
              templateName={templateName}
            />
          )}
          {step === "done" && runResult && (
            <DoneCard
              result={runResult}
              destination={destination}
              templateName={templateName}
            />
          )}

          {runError && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {runError}
            </p>
          )}
          {progress && running && (
            <div className="mt-4 rounded-md border bg-card p-3">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>
                  Enviando lote… {progress.done} / {progress.total}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{
                    width:
                      progress.total > 0
                        ? `${Math.round((progress.done / progress.total) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          <div
            className="text-xs text-muted-foreground"
            aria-live="polite"
            role="status"
          >
            {step === "done"
              ? `Etapa final — ${currentStepLabel}.`
              : `Etapa ${stepIndex + 1} de ${STEPS.length} — ${currentStepLabel}.`}
            {step !== "done" && (
              <>
                {" · "}
                <strong className="text-foreground">{totalLabels}</strong>{" "}
                etiqueta{totalLabels === 1 ? "" : "s"} no plano atual.
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "done" ? (
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={running}
                >
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  onClick={goBack}
                  disabled={step === "filter" || running}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Voltar
                </Button>
                {step === "destination" ? (
                  <Button onClick={() => void execute()} disabled={running}>
                    {running ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Enviando…
                      </>
                    ) : destination.kind === "pdf" ? (
                      <>
                        <FileDown className="h-4 w-4" aria-hidden="true" />
                        Exportar PDF
                      </>
                    ) : (
                      <>
                        <PrinterIcon className="h-4 w-4" aria-hidden="true" />
                        Imprimir
                      </>
                    )}
                  </Button>
                ) : (
                  <Button onClick={goNext} disabled={!canAdvance || running}>
                    Avançar
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

interface DoneCardProps {
  result: RunBatchResult;
  destination: BatchDestination;
  templateName: string;
}

function DoneCard({ result, destination, templateName }: DoneCardProps) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2
          className="mt-0.5 h-5 w-5 text-emerald-600"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-emerald-900">
            Lote concluído
          </p>
          <p className="text-sm text-emerald-900/90">
            {destination.kind === "pdf"
              ? `${result.printed} página${result.printed === 1 ? "" : "s"} gravada${result.printed === 1 ? "" : "s"} em "${result.pdfPath ?? `${templateName}.pdf`}".`
              : `${result.printed} etiqueta${result.printed === 1 ? "" : "s"} enviada${result.printed === 1 ? "" : "s"} para a impressora.`}
          </p>
          {result.jobId && (
            <p className="text-xs text-emerald-900/80">
              Job-id: <code>{result.jobId}</code>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
