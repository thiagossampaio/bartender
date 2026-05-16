import { CheckCircle2, AlertCircle, Link2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import type { ColumnMapping } from "@/lib/data/mapping";
import type { PlaceholderInfo } from "@/lib/data/placeholders";
import { cn } from "@/lib/utils";

/**
 * Painel de mapeamento placeholders → colunas (WP-12 / SPEC-07 RF-D-04).
 *
 * UX:
 *  - Cada placeholder vira uma linha com:
 *      1. Nome do campo (em código).
 *      2. Contagem de objetos do template que o referenciam.
 *      3. `<select>` nativo com as colunas detectadas + "Não mapeado".
 *  - Linha não mapeada recebe ícone de alerta + borda âmbar; mapeada, check
 *    verde. Feedback imediato sem precisar scrollar para o final.
 *  - O `<select>` nativo é deliberado: dropdown customizado teria que lidar
 *    com posicionamento e teclado por ~50 itens em planilhas largas, e o
 *    nativo entrega a11y AA de graça (sem `aria-activedescendant`, sem
 *    arrow-key handler manual).
 */
export interface MappingPanelProps {
  placeholders: readonly PlaceholderInfo[];
  columns: readonly string[];
  mapping: ColumnMapping;
  onMappingChange: (field: string, column: string | null) => void;
  disabled?: boolean;
}

export function MappingPanel({
  placeholders,
  columns,
  mapping,
  onMappingChange,
  disabled,
}: MappingPanelProps) {
  if (placeholders.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          Nenhum placeholder detectado no template.
        </p>
        <p className="mt-1">
          Inclua campos do tipo <code className="rounded bg-muted px-1 text-xs">{`{{ campo }}`}</code> em textos
          ou códigos de barras para usar dados da planilha.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Link2 className="h-4 w-4" aria-hidden="true" />
        <span>Mapeamento de placeholders</span>
        <span className="text-xs font-normal text-muted-foreground">
          ({placeholders.length} encontrado{placeholders.length === 1 ? "" : "s"})
        </span>
      </div>
      <ul className="space-y-2">
        {placeholders.map((p) => {
          const selected = mapping[p.field] ?? "";
          const mapped = selected.length > 0;
          return (
            <li
              key={p.field}
              className={cn(
                "rounded-md border p-3 transition-colors",
                mapped
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-amber-200 bg-amber-50/40",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  {mapped ? (
                    <CheckCircle2
                      className="h-4 w-4 text-emerald-600"
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertCircle
                      className="h-4 w-4 text-amber-600"
                      aria-hidden="true"
                    />
                  )}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">
                    {`{{ ${p.field} }}`}
                  </code>
                </div>
                <span className="text-xs text-muted-foreground">
                  Usado em {p.usages.length} objeto{p.usages.length === 1 ? "" : "s"}
                  {summarizeSources(p)}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Label
                    htmlFor={`mapping-${p.field}`}
                    className="text-xs text-muted-foreground"
                  >
                    Coluna
                  </Label>
                  <select
                    id={`mapping-${p.field}`}
                    className="h-9 min-w-[180px] rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={selected}
                    onChange={(e) =>
                      onMappingChange(
                        p.field,
                        e.target.value === "" ? null : e.target.value,
                      )
                    }
                    disabled={disabled || columns.length === 0}
                    aria-label={`Coluna mapeada para ${p.field}`}
                    aria-invalid={!mapped}
                  >
                    <option value="">Não mapeado</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function summarizeSources(p: PlaceholderInfo): string {
  const kinds = new Set(p.usages.map((u) => u.objectType));
  if (kinds.size === 0) return "";
  const labels = Array.from(kinds).map((k) =>
    k === "text" ? "texto" : k === "barcode" ? "barcode" : "QR",
  );
  return ` · ${labels.join(", ")}`;
}
