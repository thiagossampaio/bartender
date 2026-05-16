import * as React from "react";
import { Hash, ListFilter } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RowFilter, RowQuantity } from "@/lib/batch/types";
import { cn } from "@/lib/utils";

/**
 * Step "Filtro / Quantidade" do BatchPrintWizard (WP-13 / SPEC-07 RF-D-05 + RF-D-06).
 *
 * UX:
 *  - Filtro de linhas com 3 modos: "Todas", "Range (de-até)", "Seleção manual".
 *  - Quantidade por linha com 2 modos: "Fixa" e "Coluna do dataset".
 *  - Cada modo aparece como um radio que expõe os campos auxiliares.
 *
 * Decisões:
 *  - **Seleção manual** aceita uma lista textual ("1, 5, 7-10") parseada
 *    no caller; aqui só guardamos o texto e expomos os índices via
 *    `onSelectionTextChange` para evitar acoplar parsing à UI.
 *  - **Coluna numérica**: dropdown carrega TODAS as colunas (não tentamos
 *    "adivinhar" qual é numérica) — o validador da próxima step lista linhas
 *    com valor inválido.
 *  - Sem inline styles; segue padrão Tailwind dos demais wizards.
 */
export interface BatchFilterStepProps {
  totalRows: number;
  columns: readonly string[];

  filter: RowFilter;
  onFilterChange: (filter: RowFilter) => void;

  /** Texto bruto da seleção manual (ex.: "1, 3, 5-9"). Caller faz parse. */
  selectionText: string;
  onSelectionTextChange: (text: string) => void;
  /** Erro de parsing da seleção (vindo do caller). */
  selectionError?: string | null;

  quantity: RowQuantity;
  onQuantityChange: (q: RowQuantity) => void;
}

export function BatchFilterStep({
  totalRows,
  columns,
  filter,
  onFilterChange,
  selectionText,
  onSelectionTextChange,
  selectionError,
  quantity,
  onQuantityChange,
}: BatchFilterStepProps) {
  return (
    <div className="space-y-6">
      {/* Filtro de linhas */}
      <section>
        <header className="mb-2 flex items-center gap-2">
          <ListFilter className="h-4 w-4" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Quais linhas imprimir?</h3>
          <span className="text-xs text-muted-foreground">
            {totalRows} linha{totalRows === 1 ? "" : "s"} disponível
            {totalRows === 1 ? "" : "is"} na planilha.
          </span>
        </header>

        <div className="space-y-2">
          <FilterOption
            id="filter-all"
            checked={filter.kind === "all"}
            onSelect={() => onFilterChange({ kind: "all" })}
            label="Todas as linhas"
            description="Imprime todas as linhas mapeadas da planilha."
          />

          <FilterOption
            id="filter-range"
            checked={filter.kind === "range"}
            onSelect={() =>
              onFilterChange({
                kind: "range",
                from: filter.kind === "range" ? filter.from : 1,
                to: filter.kind === "range" ? filter.to : Math.max(1, totalRows),
              })
            }
            label="Faixa de linhas (de–até)"
            description='Ex.: "de 10 até 50" imprime as linhas 10 a 50.'
          >
            {filter.kind === "range" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Label htmlFor="range-from" className="text-xs">
                  De
                </Label>
                <Input
                  id="range-from"
                  type="number"
                  min={1}
                  max={totalRows}
                  value={filter.from}
                  onChange={(e) =>
                    onFilterChange({
                      kind: "range",
                      from: clampInt(e.target.value, 1, totalRows),
                      to: filter.to,
                    })
                  }
                  className="h-8 w-24"
                />
                <Label htmlFor="range-to" className="text-xs">
                  até
                </Label>
                <Input
                  id="range-to"
                  type="number"
                  min={1}
                  max={totalRows}
                  value={filter.to}
                  onChange={(e) =>
                    onFilterChange({
                      kind: "range",
                      from: filter.from,
                      to: clampInt(e.target.value, 1, totalRows),
                    })
                  }
                  className="h-8 w-24"
                />
              </div>
            )}
          </FilterOption>

          <FilterOption
            id="filter-selection"
            checked={filter.kind === "selection"}
            onSelect={() =>
              onFilterChange({
                kind: "selection",
                rows: filter.kind === "selection" ? filter.rows : [],
              })
            }
            label="Seleção manual"
            description='Liste linhas separadas por vírgula. Use "-" para faixas. Ex.: "1, 3, 5-9".'
          >
            {filter.kind === "selection" && (
              <div className="mt-2">
                <Label htmlFor="selection-text" className="sr-only">
                  Linhas selecionadas
                </Label>
                <Input
                  id="selection-text"
                  value={selectionText}
                  onChange={(e) => onSelectionTextChange(e.target.value)}
                  placeholder="1, 3, 5-9"
                  className="h-8 w-full max-w-md"
                  aria-invalid={Boolean(selectionError)}
                />
                {selectionError && (
                  <p
                    role="alert"
                    className="mt-1 text-xs text-destructive"
                  >
                    {selectionError}
                  </p>
                )}
              </div>
            )}
          </FilterOption>
        </div>
      </section>

      {/* Quantidade por linha */}
      <section>
        <header className="mb-2 flex items-center gap-2">
          <Hash className="h-4 w-4" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Quantas etiquetas por linha?</h3>
        </header>

        <div className="space-y-2">
          <FilterOption
            id="qty-fixed"
            checked={quantity.kind === "fixed"}
            onSelect={() =>
              onQuantityChange({
                kind: "fixed",
                value: quantity.kind === "fixed" ? quantity.value : 1,
              })
            }
            label="Quantidade fixa"
            description="O mesmo número de cópias para cada linha selecionada."
          >
            {quantity.kind === "fixed" && (
              <div className="mt-2 flex items-center gap-2">
                <Label htmlFor="qty-value" className="text-xs">
                  Cópias por linha
                </Label>
                <Input
                  id="qty-value"
                  type="number"
                  min={1}
                  max={9999}
                  value={quantity.value}
                  onChange={(e) =>
                    onQuantityChange({
                      kind: "fixed",
                      value: clampInt(e.target.value, 1, 9999),
                    })
                  }
                  className="h-8 w-24"
                />
              </div>
            )}
          </FilterOption>

          <FilterOption
            id="qty-column"
            checked={quantity.kind === "column"}
            onSelect={() =>
              onQuantityChange({
                kind: "column",
                column:
                  quantity.kind === "column"
                    ? quantity.column
                    : (columns[0] ?? ""),
              })
            }
            label="Coluna da planilha"
            description="Lê a quantidade de uma coluna numérica (ex.: coluna 'qtd')."
          >
            {quantity.kind === "column" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Label htmlFor="qty-column" className="text-xs">
                  Coluna
                </Label>
                <select
                  id="qty-column"
                  className="h-8 min-w-[180px] rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={quantity.column}
                  onChange={(e) =>
                    onQuantityChange({
                      kind: "column",
                      column: e.target.value,
                    })
                  }
                >
                  {columns.length === 0 && (
                    <option value="">— sem colunas —</option>
                  )}
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className="ml-2 text-xs text-muted-foreground">
                  Valores não numéricos ou ≤ 0 viram aviso e a linha é pulada.
                </p>
              </div>
            )}
          </FilterOption>
        </div>
      </section>
    </div>
  );
}

interface FilterOptionProps {
  id: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
  description: string;
  children?: React.ReactNode;
}

function FilterOption({
  id,
  checked,
  onSelect,
  label,
  description,
  children,
}: FilterOptionProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "block cursor-pointer rounded-md border p-3 transition-colors",
        checked
          ? "border-primary bg-primary/5"
          : "border-input hover:bg-accent",
      )}
    >
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="radio"
          className="mt-1"
          checked={checked}
          onChange={onSelect}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{label}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          {children}
        </div>
      </div>
    </label>
  );
}

function clampInt(raw: string, min: number, max: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}
