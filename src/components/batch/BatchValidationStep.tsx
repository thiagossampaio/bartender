import * as React from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

import type { BatchValidationSummary } from "@/lib/batch/types";
import { cn } from "@/lib/utils";

/**
 * Step "Validação" do BatchPrintWizard (WP-13 / SPEC-07 RF-D-07).
 *
 * Mostra:
 *  - Resumo agregado (críticos + avisos).
 *  - Lista de erros agrupada por linha. Linhas com crítico recebem
 *    borda vermelha; só avisos → âmbar; sem nada → verde.
 *  - Botão "Avançar" do wizard fica desabilitado pelo caller quando
 *    `criticalCount > 0` (este componente apenas mostra; não bloqueia).
 *
 * Mantemos a lista virtualizada apenas se passar de 200 linhas (corte
 * arbitrário pequeno e suficiente para o MVP; usamos slice + indicador).
 */
export interface BatchValidationStepProps {
  summary: BatchValidationSummary;
  /** Total de etiquetas que serão impressas (informativo). */
  totalLabels: number;
  /** Total de linhas selecionadas (informativo). */
  selectedRows: number;
}

const MAX_ERRORS_SHOWN = 200;

export function BatchValidationStep({
  summary,
  totalLabels,
  selectedRows,
}: BatchValidationStepProps) {
  const { criticalCount, warningCount, errors } = summary;

  const truncated = errors.length > MAX_ERRORS_SHOWN;
  const shown = truncated ? errors.slice(0, MAX_ERRORS_SHOWN) : errors;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold">Validação dos valores</h3>
        <p className="text-xs text-muted-foreground">
          Verificamos placeholders mapeados e simbologias de código de barras
          em cada linha selecionada.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          tone="ok"
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          label="Linhas selecionadas"
          value={selectedRows}
          hint={`${totalLabels} etiqueta${totalLabels === 1 ? "" : "s"} serão impressas`}
        />
        <SummaryTile
          tone={warningCount > 0 ? "warn" : "ok"}
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          label="Avisos"
          value={warningCount}
          hint="Linhas serão puladas, lote continua"
        />
        <SummaryTile
          tone={criticalCount > 0 ? "critical" : "ok"}
          icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
          label="Erros críticos"
          value={criticalCount}
          hint={
            criticalCount > 0
              ? "Corrija antes de avançar"
              : "Tudo certo para imprimir"
          }
        />
      </div>

      {errors.length === 0 ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-emerald-900">
          Nenhum problema encontrado — o lote está pronto para o destino.
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Linha
                </th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Objeto
                </th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Problema
                </th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Severidade
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((err, idx) => (
                <tr key={`${err.rowIndex}-${err.objectId}-${idx}`}>
                  <td className="border-b px-3 py-1.5 align-top text-xs font-mono">
                    {err.rowIndex}
                  </td>
                  <td className="border-b px-3 py-1.5 align-top text-xs">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                      {err.objectType}
                    </span>
                  </td>
                  <td className="border-b px-3 py-1.5 align-top">
                    <p>{err.message}</p>
                    {err.resolvedValue && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Valor: <code>{err.resolvedValue}</code>
                      </p>
                    )}
                  </td>
                  <td className="border-b px-3 py-1.5 align-top">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        err.critical
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-100 text-amber-800",
                      )}
                    >
                      {err.critical ? "Crítico" : "Aviso"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {truncated && (
            <div className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Mostrando os primeiros {MAX_ERRORS_SHOWN} problemas de{" "}
              {errors.length}. Corrija e revalide.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SummaryTileProps {
  tone: "ok" | "warn" | "critical";
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
}

function SummaryTile({ tone, icon, label, value, hint }: SummaryTileProps) {
  return (
    <div
      className={cn(
        "rounded-md border bg-card p-3",
        tone === "critical" && "border-destructive/40 bg-destructive/5",
        tone === "warn" && "border-amber-200 bg-amber-50/50",
        tone === "ok" && "border-emerald-200 bg-emerald-50/40",
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold leading-tight">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
