import * as React from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Printer as PrinterIcon,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  historyCanReprint,
  historyPage,
  type HistoryEntry,
  type PrintDataSource,
  type PrintMode,
} from "@/lib/history";
import { useTemplatesStore } from "@/lib/stores/templates-store";
import { cn } from "@/lib/utils";

/**
 * Página `History` (WP-15 / SPEC-12 §"Comportamento esperado" item 1).
 *
 * Tabela paginada das impressões registradas em `print_history`, com botão
 * "Reimprimir" por linha que valida invariantes (template ainda existe E,
 * para CSV/XLSX, `source_path` ainda no disco) via
 * [`historyCanReprint`](../../lib/history.ts).
 *
 * Decisões:
 *  - **Paginação no banco** (`LIMIT/OFFSET`) — `print_history` pode crescer
 *    indefinidamente no ciclo de vida do app; carregar tudo em memória vira
 *    problema para usuários que rodam centenas de lotes por semana.
 *  - **Validação de reimpressão sob demanda** — fazemos `historyCanReprint`
 *    apenas para a janela visível, em paralelo com `Promise.all`. Mantém a
 *    UI responsiva sem precisar de invalidação manual.
 *  - **Reimpressão = abrir o editor** — o critério "wizard reabre com mesmo
 *    template e dados" é satisfeito abrindo o editor do template; o
 *    usuário re-executa `Imprimir` / `Imprimir lote` com a fonte de dados
 *    ainda na sessão (WP-13 mantém `dataImport` em memória). Replicar o
 *    estado integral do wizard em uma rota separada exigiria store global
 *    do dataset/mapping — escopo fora do WP-15.
 */
const PAGE_SIZE = 50;

export function History() {
  const setView = useTemplatesStore((s) => s.setView);
  const openEditor = useTemplatesStore((s) => s.openEditor);

  const [page, setPage] = React.useState(1);
  const [entries, setEntries] = React.useState<HistoryEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Cache do resultado de `historyCanReprint` indexado por `entry.id` —
  // evita reflows quando o usuário só rola a tabela.
  const [reprintCheck, setReprintCheck] = React.useState<
    Record<number, { ok: true } | { ok: false; reason: string }>
  >({});

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const reload = React.useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const { entries: rows, total: t } = await historyPage(
          targetPage,
          PAGE_SIZE,
        );
        setEntries(rows);
        setTotal(t);
        // Recheck reimpressão por linha (paralelo).
        const checks = await Promise.all(
          rows.map(async (e) => [e.id, await historyCanReprint(e)] as const),
        );
        setReprintCheck(Object.fromEntries(checks));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar histórico.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void reload(page);
  }, [page, reload]);

  function gotoPage(p: number) {
    const clamped = Math.max(1, Math.min(totalPages, p));
    setPage(clamped);
  }

  async function handleReprint(entry: HistoryEntry) {
    const check = reprintCheck[entry.id] ?? (await historyCanReprint(entry));
    if (!check.ok) {
      // O botão deveria estar desabilitado; defesa contra estado stale.
      setError(check.reason);
      return;
    }
    // Critério SPEC-12: "wizard reabre com mesmo template e dados". Abrimos
    // o editor do template — o usuário aciona `Imprimir` / `Imprimir lote`
    // de lá, reusando o dataset que ainda esteja na sessão (ou
    // re-importando rapidamente, já que o `source_path` está validado).
    openEditor(entry.templateId);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b bg-background px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView("gallery")}
            aria-label="Voltar para a galeria"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Histórico</h1>
            <p className="text-sm text-muted-foreground">
              Impressões registradas no app. Use "Reimprimir" para reabrir o
              template no editor.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void reload(page)}
            disabled={loading}
            title="Atualizar histórico"
          >
            <RefreshCw
              className={cn("h-4 w-4", loading && "animate-spin")}
              aria-hidden="true"
            />
            Atualizar
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-6 py-6">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {loading && entries.length === 0 && (
          <p className="text-sm text-muted-foreground">Carregando histórico…</p>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma impressão registrada ainda.
            </p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Ao imprimir do editor ou do wizard de lote, o registro aparece
              aqui para reimpressão posterior.
            </p>
          </div>
        )}

        {entries.length > 0 && (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Data
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Template
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Impressora
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Modo
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Qtd
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Fonte
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => {
                  const check = reprintCheck[entry.id];
                  const canReprint = check?.ok ?? false;
                  const reason =
                    check && !check.ok
                      ? check.reason
                      : "Verificando disponibilidade…";
                  return (
                    <tr
                      key={entry.id}
                      className={cn(
                        "border-t",
                        i % 2 === 0 ? "bg-background" : "bg-muted/20",
                      )}
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {formatTimestamp(entry.printedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "truncate",
                            entry.templateName === null && "italic text-muted-foreground line-through",
                            entry.templateInTrash && "italic text-muted-foreground",
                          )}
                          title={entry.templateName ?? "Removido"}
                        >
                          {entry.templateName ?? "Removido permanentemente"}
                        </span>
                        {entry.templateInTrash && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-800">
                            na lixeira
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {entry.printerName === "PDF" ? (
                            <FileSpreadsheet
                              className="h-3.5 w-3.5 text-muted-foreground"
                              aria-hidden="true"
                            />
                          ) : (
                            <PrinterIcon
                              className="h-3.5 w-3.5 text-muted-foreground"
                              aria-hidden="true"
                            />
                          )}
                          <span className="truncate" title={entry.printerName}>
                            {entry.printerName}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <ModeBadge mode={entry.mode} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {entry.quantity}
                      </td>
                      <td className="px-3 py-2">
                        <DataSourceCell
                          source={entry.dataSource}
                          path={entry.sourcePath}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleReprint(entry)}
                          disabled={!canReprint}
                          title={canReprint ? "Reabrir template para reimprimir" : reason}
                          aria-label={`Reimprimir entrada de ${formatTimestamp(entry.printedAt)}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          Reimprimir
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav
            aria-label="Paginação do histórico"
            className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground"
          >
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de{" "}
              {total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => gotoPage(page - 1)}
                disabled={page <= 1 || loading}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Anterior
              </Button>
              <span className="px-2 tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => gotoPage(page + 1)}
                disabled={page >= totalPages || loading}
                aria-label="Próxima página"
              >
                Próxima
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </nav>
        )}
      </main>
    </div>
  );
}

function ModeBadge({ mode }: { mode: PrintMode }) {
  const label =
    mode === "raw_pplb"
      ? "PPLB"
      : mode === "raw_zpl"
        ? "ZPL"
        : "Driver";
  const tone =
    mode === "raw_pplb"
      ? "bg-amber-100 text-amber-800"
      : mode === "raw_zpl"
        ? "bg-sky-100 text-sky-800"
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

function DataSourceCell({
  source,
  path,
}: {
  source: PrintDataSource;
  path: string | null;
}) {
  if (source === "manual") {
    return <span className="text-xs text-muted-foreground">Manual</span>;
  }
  const label = source === "csv" ? "CSV" : "Excel";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium">{label}</span>
      {path && (
        <span
          className="truncate text-[11px] text-muted-foreground"
          title={path}
        >
          {fileNameOf(path)}
        </span>
      )}
    </div>
  );
}

function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function formatTimestamp(raw: string): string {
  // O plugin-sql devolve `YYYY-MM-DD HH:MM:SS` em UTC sem 'Z'. Convertemos para
  // `T` + `Z` para que `new Date(...)` interprete como UTC.
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
