import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Tabela paginada de preview dos dados importados (WP-12 / SPEC-07 RF-D-03).
 *
 * Decisões:
 *  - **Paginação client-side**: arquivos típicos do MVP têm < 5 mil linhas;
 *    paginar 50 por vez na tela é confortável e mantém o DOM enxuto. Quando
 *    o WP-13 precisar de janela virtual (>10 mil linhas), trocaremos por
 *    `react-window`.
 *  - **Layout**: container com scroll horizontal interno (`overflow-x-auto`)
 *    + colunas de largura mínima. Tab numérica.
 *  - **A11y**: `<table>` semântico + `scope="col"`/`scope="row"`; o footer da
 *    paginação usa `aria-label` em cada botão.
 *  - **Estado externo**: o `currentPage` é controlado pelo caller para que o
 *    `DataImportDialog` possa resetar quando o arquivo for trocado.
 */
export interface PreviewTableProps {
  headers: readonly string[];
  rows: readonly Record<string, string>[];
  pageSize?: number;
  /** Índice 1-based da página atual. */
  page: number;
  onPageChange: (page: number) => void;
  /** Colunas destacadas (geralmente as mapeadas a placeholders). */
  highlightColumns?: readonly string[];
}

const DEFAULT_PAGE_SIZE = 50;

export function PreviewTable({
  headers,
  rows,
  pageSize = DEFAULT_PAGE_SIZE,
  page,
  onPageChange,
  highlightColumns,
}: PreviewTableProps) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, rows.length);
  const visible = rows.slice(startIndex, endIndex);

  const highlightSet = React.useMemo(
    () => new Set(highlightColumns ?? []),
    [highlightColumns],
  );

  if (headers.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhuma coluna detectada.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-muted/60">
            <tr>
              <th
                scope="col"
                className="border-r border-b px-2 py-2 text-right text-xs font-medium text-muted-foreground"
              >
                #
              </th>
              {headers.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className={
                    "border-b border-r px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide last:border-r-0" +
                    (highlightSet.has(h)
                      ? " bg-primary/10 text-primary"
                      : " text-muted-foreground")
                  }
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length + 1}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  Sem linhas para exibir.
                </td>
              </tr>
            ) : (
              visible.map((row, idx) => (
                <tr
                  key={startIndex + idx}
                  className="even:bg-muted/30"
                >
                  <th
                    scope="row"
                    className="border-r px-2 py-1.5 text-right text-xs text-muted-foreground"
                  >
                    {startIndex + idx + 1}
                  </th>
                  {headers.map((h) => (
                    <td
                      key={h}
                      className={
                        "max-w-[280px] truncate border-r px-3 py-1.5 last:border-r-0" +
                        (highlightSet.has(h) ? " bg-primary/5" : "")
                      }
                      title={row[h] ?? ""}
                    >
                      {row[h] ?? ""}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {rows.length === 0
            ? "0 linhas"
            : `Exibindo ${startIndex + 1}–${endIndex} de ${rows.length} linha${rows.length === 1 ? "" : "s"}`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Primeira página"
            disabled={safePage <= 1}
            onClick={() => onPageChange(1)}
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Página anterior"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="min-w-[5rem] text-center" aria-live="polite">
            {safePage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Próxima página"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Última página"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(totalPages)}
          >
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
