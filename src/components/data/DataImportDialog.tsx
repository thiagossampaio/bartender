import * as React from "react";
import {
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
import { MappingPanel } from "@/components/data/MappingPanel";
import { PreviewTable } from "@/components/data/PreviewTable";
import {
  autoMatchMapping,
  isMappingComplete,
  unmappedPlaceholders,
  type ColumnMapping,
} from "@/lib/data/mapping";
import {
  DataParseError,
  parseDataFile,
  type ParsedDataset,
} from "@/lib/data/parsers";
import {
  extractPlaceholders,
  type PlaceholderInfo,
} from "@/lib/data/placeholders";
import type { CanvasObject } from "@/lib/canvas/types";
import { cn } from "@/lib/utils";

/**
 * Wizard de importação de fonte de dados (WP-12 / SPEC-07).
 *
 * Compõe as três peças da feature:
 *  1. **Escolha do arquivo** (diálogo nativo Tauri).
 *  2. **Preview paginado** (PreviewTable).
 *  3. **Mapeamento de placeholders ↔ colunas** (MappingPanel).
 *
 * Decisões:
 *  - **Estado local + callback externo**: o dialog não persiste nada — quando
 *    o usuário clica "Aplicar", chamamos `onApply({ dataset, mapping })` e o
 *    Editor (WP-12) ou o BatchPrintWizard (WP-13) decide o que fazer. Mantém
 *    o componente reutilizável entre os dois consumidores.
 *  - **Auto-match após cada novo arquivo**: o `autoMatchMapping` casa
 *    placeholder → coluna por nome similar (case + hífen/underscore-insensitive).
 *  - **Validação de mapeamento**: o botão "Aplicar" só habilita quando todos
 *    os placeholders têm coluna OU quando o template não tem placeholders
 *    (importar só para visualizar dados também é válido — RF-D-08 fica para
 *    WP-13).
 *  - **CSP-friendly**: zero estilo inline, zero portal externo.
 *  - **A11y**: ESC fecha; foco vai para botão "Selecionar arquivo" ao abrir;
 *    `aria-modal`, `role="dialog"`, `aria-labelledby` no título.
 */
export interface DataImportResult {
  dataset: ParsedDataset;
  mapping: ColumnMapping;
  placeholders: PlaceholderInfo[];
}

export interface DataImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Objetos do canvas do template aberto — para extrair placeholders. */
  templateObjects: readonly CanvasObject[];
  /**
   * Callback acionado em "Aplicar". O caller decide se guarda em store, se
   * dispara o wizard de lote (WP-13) ou só fecha o dialog.
   */
  onApply?: (result: DataImportResult) => void;
  /**
   * Estado inicial opcional — quando o caller já tem um dataset previamente
   * importado (re-abrindo o wizard), passamos para preservar a UX.
   */
  initial?: {
    dataset: ParsedDataset;
    mapping: ColumnMapping;
  };
}

export function DataImportDialog({
  open,
  onOpenChange,
  templateObjects,
  onApply,
  initial,
}: DataImportDialogProps) {
  const [dataset, setDataset] = React.useState<ParsedDataset | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMapping>({});
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const placeholders = React.useMemo(
    () => extractPlaceholders(templateObjects),
    [templateObjects],
  );

  // Carrega estado inicial ao abrir (se houver). Reseta quando fecha para
  // não vazar dados entre aberturas separadas.
  React.useEffect(() => {
    if (!open) return;
    if (initial) {
      setDataset(initial.dataset);
      setMapping(initial.mapping);
      setError(null);
      setPage(1);
    } else {
      setDataset(null);
      setMapping(
        Object.fromEntries(placeholders.map((p) => [p.field, null])) as ColumnMapping,
      );
      setError(null);
      setPage(1);
    }
  }, [open, initial, placeholders]);

  // ESC fecha + trava scroll do body enquanto aberto.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) {
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
  }, [open, loading, onOpenChange]);

  const pickFile = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const selected = await openDialog({
        title: "Selecionar planilha",
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Planilha (CSV, XLSX)",
            extensions: ["csv", "txt", "xlsx", "xlsm"],
          },
          { name: "CSV", extensions: ["csv", "txt"] },
          { name: "Excel", extensions: ["xlsx", "xlsm"] },
        ],
      });
      if (!selected || typeof selected !== "string") {
        setLoading(false);
        return;
      }
      const parsed = await parseDataFile(selected);
      setDataset(parsed);
      setMapping(autoMatchMapping(placeholders, parsed.headers));
      setPage(1);
    } catch (e) {
      if (e instanceof DataParseError) {
        setError(e.message);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Não foi possível abrir o arquivo.");
      }
      setDataset(null);
    } finally {
      setLoading(false);
    }
  }, [placeholders]);

  const handleMappingChange = React.useCallback(
    (field: string, column: string | null) => {
      setMapping((m) => ({ ...m, [field]: column }));
    },
    [],
  );

  const handleApply = React.useCallback(() => {
    if (!dataset) return;
    onApply?.({ dataset, mapping, placeholders });
    onOpenChange(false);
  }, [dataset, mapping, placeholders, onApply, onOpenChange]);

  const mappingComplete = isMappingComplete(mapping, placeholders);
  const unmapped = unmappedPlaceholders(mapping, placeholders);
  const mappedColumns = React.useMemo(
    () => Object.values(mapping).filter((c): c is string => Boolean(c)),
    [mapping],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="data-import-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border bg-background shadow-xl">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            <h2 id="data-import-title" className="text-base font-semibold">
              Importar dados (CSV / XLSX)
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>

        <div className="flex-1 space-y-4 overflow-auto p-4">
          {/* Bloco 1: escolha de arquivo */}
          <section
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-md border bg-card p-3",
              !dataset && "border-dashed",
            )}
          >
            <div className="flex flex-1 items-center gap-3">
              {dataset?.source === "xlsx" ? (
                <FileSpreadsheet
                  className="h-5 w-5 text-emerald-600"
                  aria-hidden="true"
                />
              ) : dataset?.source === "csv" ? (
                <FileText className="h-5 w-5 text-sky-600" aria-hidden="true" />
              ) : (
                <FolderOpen
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1">
                {dataset ? (
                  <>
                    <p className="truncate text-sm font-medium">
                      {dataset.fileName ?? "Planilha importada"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dataset.source.toUpperCase()}
                      {dataset.csvDelimiter
                        ? ` · separador "${dataset.csvDelimiter}"`
                        : ""}{" "}
                      · {dataset.headers.length} coluna
                      {dataset.headers.length === 1 ? "" : "s"} ·{" "}
                      {dataset.rows.length} linha
                      {dataset.rows.length === 1 ? "" : "s"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">Nenhum arquivo selecionado</p>
                    <p className="text-xs text-muted-foreground">
                      Importe um CSV (UTF-8, separador <code>,</code> ou <code>;</code>) ou um XLSX
                      (1ª planilha, 1ª linha = cabeçalho).
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {dataset && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void pickFile()}
                  disabled={loading}
                  title="Substituir arquivo"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Trocar
                </Button>
              )}
              <Button onClick={() => void pickFile()} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Lendo…
                  </>
                ) : (
                  <>
                    <FolderOpen className="h-4 w-4" aria-hidden="true" />
                    {dataset ? "Selecionar outro" : "Selecionar arquivo"}
                  </>
                )}
              </Button>
            </div>
          </section>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          {dataset && (
            <>
              {/* Bloco 2: mapeamento */}
              <MappingPanel
                placeholders={placeholders}
                columns={dataset.headers}
                mapping={mapping}
                onMappingChange={handleMappingChange}
                disabled={loading}
              />

              {/* Bloco 3: preview paginado */}
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Preview dos dados</h3>
                  {placeholders.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Colunas mapeadas aparecem destacadas.
                    </span>
                  )}
                </div>
                <PreviewTable
                  headers={dataset.headers}
                  rows={dataset.rows}
                  page={page}
                  onPageChange={setPage}
                  highlightColumns={mappedColumns}
                />
              </section>
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          <div className="text-xs text-muted-foreground" aria-live="polite">
            {dataset
              ? placeholders.length === 0
                ? "O template não usa placeholders — você pode aplicar para visualizar os dados."
                : mappingComplete
                  ? "Todos os placeholders estão mapeados."
                  : `Pendentes: ${unmapped
                      .map((f) => `{{ ${f} }}`)
                      .join(", ")}`
              : "Selecione um arquivo para começar."}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleApply}
              disabled={
                !dataset ||
                loading ||
                (placeholders.length > 0 && !mappingComplete)
              }
            >
              Aplicar
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
