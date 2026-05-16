/**
 * Serviço de Histórico de Impressões (WP-15 / SPEC-12).
 *
 * Façade tipada sobre a tabela `print_history` ([SPEC-02]). Mantém o padrão
 * estabelecido em WP-03: CRUD vive no frontend via `@/lib/db`, sem ponte
 * Rust dedicada — só calibração/teste de impressora exigem Rust (WP-15
 * `printer_calibrate` / `printer_test_page`).
 *
 * Responsabilidades:
 *  - `historyList(page, limit)`: lê o histórico paginado, JOIN com `templates`
 *    para devolver o nome atual do template (ou `null` quando hard-deleted).
 *  - `historyCount()`: total de entradas — para a UI mostrar paginação.
 *  - `historyCanReprint(entry)`: valida invariantes de reimpressão exigidas
 *    pelo SPEC-12 (template ainda existe E, se data_source ∈ {csv,xlsx},
 *    source_path ainda existe no disco). Devolve `{ ok, reason }` com PT-BR.
 *  - `historyDelete(id)`: remoção opcional de uma entrada (útil em diagnóstico
 *    manual; UI atual não expõe).
 */

import { invoke } from "@tauri-apps/api/core";

import { dbExecute, dbQuery } from "@/lib/db";

/** Modo registrado pela impressão. Espelha `print_history.mode`. */
export type PrintMode = "driver" | "raw_pplb" | "raw_zpl";

/** Fonte de dados registrada pela impressão. Espelha `print_history.data_source`. */
export type PrintDataSource = "manual" | "csv" | "xlsx";

/** Linha como vem do JOIN com `templates` (snake_case + nullables). */
interface HistoryRowRaw {
  id: number;
  template_id: number;
  template_name: string | null;
  template_deleted_at: string | null;
  printer_name: string;
  mode: string;
  quantity: number;
  data_source: string | null;
  source_path: string | null;
  printed_at: string;
}

/** Domínio camelCase usado pela UI. */
export interface HistoryEntry {
  id: number;
  templateId: number;
  /**
   * Nome do template no momento da query. `null` quando o template foi
   * hard-deleted (RF: reimpressão indisponível com tooltip).
   */
  templateName: string | null;
  /**
   * `true` quando o template está soft-deleted (na lixeira). UI mostra o
   * nome riscado e oferece "Restaurar para reimprimir".
   */
  templateInTrash: boolean;
  printerName: string;
  mode: PrintMode;
  quantity: number;
  dataSource: PrintDataSource;
  /** Path do arquivo CSV/XLSX original; `null` quando `dataSource === "manual"`. */
  sourcePath: string | null;
  /** Timestamp ISO-ish (SQLite `datetime('now')`). */
  printedAt: string;
}

function pickMode(raw: string | null): PrintMode {
  if (raw === "raw_pplb" || raw === "raw_zpl" || raw === "driver") return raw;
  // Tolerância defensiva: linhas mais antigas/corrompidas viram "driver".
  return "driver";
}

function pickDataSource(raw: string | null): PrintDataSource {
  if (raw === "csv" || raw === "xlsx" || raw === "manual") return raw;
  return "manual";
}

function mapRow(r: HistoryRowRaw): HistoryEntry {
  return {
    id: r.id,
    templateId: r.template_id,
    templateName: r.template_name,
    templateInTrash: r.template_deleted_at !== null,
    printerName: r.printer_name,
    mode: pickMode(r.mode),
    quantity: r.quantity,
    dataSource: pickDataSource(r.data_source),
    sourcePath: r.source_path,
    printedAt: r.printed_at,
  };
}

/**
 * Lê o histórico paginado, ordenado por `printed_at` decrescente
 * (SPEC-12 §"Comportamento esperado" item 1).
 *
 * @param page 1-based. Página 1 = primeira fatia (top `limit` mais recentes).
 * @param limit linhas por página. Default 50 — equilibra responsividade da UI
 *   com chamadas reduzidas ao plugin-sql.
 */
export async function historyList(
  page = 1,
  limit = 50,
): Promise<HistoryEntry[]> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;
  const rows = await dbQuery<HistoryRowRaw>(
    `SELECT
        h.id              AS id,
        h.template_id     AS template_id,
        t.name            AS template_name,
        t.deleted_at      AS template_deleted_at,
        h.printer_name    AS printer_name,
        h.mode            AS mode,
        h.quantity        AS quantity,
        h.data_source     AS data_source,
        h.source_path     AS source_path,
        h.printed_at      AS printed_at
       FROM print_history h
       LEFT JOIN templates t ON t.id = h.template_id
      ORDER BY h.printed_at DESC, h.id DESC
      LIMIT $1 OFFSET $2`,
    [safeLimit, offset],
  );
  return rows.map(mapRow);
}

/** Conta o total de registros do histórico — usado pela paginação. */
export async function historyCount(): Promise<number> {
  const rows = await dbQuery<{ c: number }>(
    "SELECT COUNT(*) AS c FROM print_history",
  );
  return rows.length > 0 ? Number(rows[0].c) : 0;
}

/**
 * Decisão de "Reimprimir": valida que o template existe E, quando a impressão
 * usou uma planilha como fonte, o arquivo continua no disco
 * (SPEC-12 §"Regras de negócio").
 *
 * Devolve `{ ok: true }` em verde, ou `{ ok: false, reason }` com mensagem
 * PT-BR pronta para o tooltip do botão desabilitado.
 *
 * Para conferir o disco usamos o comando Rust `path_exists` (defesa em
 * profundidade — não exigimos scope amplo de `tauri-plugin-fs` para
 * checagem de existência).
 */
export async function historyCanReprint(
  entry: HistoryEntry,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (entry.templateName === null) {
    return {
      ok: false,
      reason: "Template foi removido permanentemente.",
    };
  }
  if (entry.templateInTrash) {
    return {
      ok: false,
      reason: "Template está na lixeira. Restaure-o para reimprimir.",
    };
  }
  if (entry.dataSource === "csv" || entry.dataSource === "xlsx") {
    if (!entry.sourcePath) {
      return {
        ok: false,
        reason: "Fonte original indisponível: caminho do arquivo não registrado.",
      };
    }
    try {
      const exists = await invoke<boolean>("path_exists", {
        path: entry.sourcePath,
      });
      if (!exists) {
        return {
          ok: false,
          reason: "Fonte original indisponível — o arquivo foi movido ou apagado.",
        };
      }
    } catch {
      // Defesa: se o comando Rust falhar, assumimos pessimisticamente que a
      // fonte sumiu — melhor desabilitar o botão do que enviar um lote vazio.
      return {
        ok: false,
        reason: "Não foi possível verificar a fonte original.",
      };
    }
  }
  return { ok: true };
}

/**
 * Remove uma entrada específica do histórico. Não exposta pela UI atual,
 * mas útil para diagnóstico manual e tests.
 */
export async function historyDelete(id: number): Promise<void> {
  await dbExecute("DELETE FROM print_history WHERE id = $1", [id]);
}

/**
 * Insere uma entrada no histórico. Centralizamos aqui o INSERT para que
 * todos os pipelines de impressão (manual single via PrintDialog, lote via
 * `runBatch`, raw PPLB/ZPL) sigam o mesmo formato.
 *
 * Best-effort: erros do banco são logados mas não derrubam a impressão (a
 * etiqueta já saiu na impressora).
 */
export async function historyRecord(input: {
  templateId: number;
  printerName: string;
  mode: PrintMode;
  quantity: number;
  dataSource?: PrintDataSource;
  sourcePath?: string | null;
}): Promise<void> {
  if (!Number.isFinite(input.templateId) || input.templateId <= 0) return;
  try {
    await dbExecute(
      `INSERT INTO print_history
         (template_id, printer_name, mode, quantity, data_source, source_path)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.templateId,
        input.printerName,
        input.mode,
        Math.max(1, Math.floor(input.quantity)),
        input.dataSource ?? "manual",
        input.sourcePath ?? null,
      ],
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("print_history insert falhou", e);
  }
}

/** Lê a tela atual + total para paginação em uma única chamada. */
export async function historyPage(
  page = 1,
  limit = 50,
): Promise<{ entries: HistoryEntry[]; total: number }> {
  const [entries, total] = await Promise.all([
    historyList(page, limit),
    historyCount(),
  ]);
  return { entries, total };
}
