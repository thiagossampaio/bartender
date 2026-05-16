/**
 * Serviço de Impressoras (WP-09 / SPEC-09).
 *
 * Façade entre o frontend e o backend Rust (`printers_list`,
 * `printers_get_status`, `printers_print_raster`). Concentra também a
 * persistência em cache da tabela `printers` ([SPEC-02]), seguindo o padrão
 * estabelecido no WP-03: SQL fica no JS via `@/lib/db`; Rust só expõe
 * comandos sem estado.
 *
 * Responsabilidades:
 *  - `printersList()`: descobre impressoras instaladas no SO atual e
 *    sincroniza com a tabela `printers` (upsert por `system_name`).
 *  - `printersGetStatus(name)`: lê status atual do spooler (ready/paused/
 *    printing/unknown/offline) — fallback `unknown` quando a impressora
 *    sumiu entre dois polls.
 *  - `printersPrintRaster(...)`: dispara N jobs idênticos via driver do SO
 *    (modo A do PRD §3.4).
 *  - `printersListCached()`: lê a tabela `printers` sem tocar no SO — útil
 *    para o auto-complete da escolha "última impressora usada" (WP-12).
 */

import { invoke } from "@tauri-apps/api/core";

import { dbExecute, dbQuery } from "@/lib/db";

/** Linguagem nativa inferida. Mantém schema da tabela `printers.language`. */
export type PrinterLanguage = "DRIVER" | "PPLB" | "ZPL";

/** Status normalizado pelo backend (superset estável). */
export type PrinterStatus =
  | "ready"
  | "paused"
  | "printing"
  | "unknown"
  | "offline";

/**
 * Informações de impressora detectada no SO. Espelha o DTO `PrinterInfo`
 * declarado em `src-tauri/src/printers.rs` (camelCase via serde).
 */
export interface PrinterInfo {
  systemName: string;
  friendlyName: string;
  driver: string | null;
  language: PrinterLanguage;
  status: PrinterStatus;
  isDefault: boolean;
  defaultDpi: number;
}

/** Linha como vem da tabela `printers` (snake_case). */
interface PrinterRowRaw {
  id: number;
  system_name: string;
  friendly_name: string | null;
  model: string | null;
  language: string | null;
  default_dpi: number | null;
  is_default: number;
  last_used_at: string | null;
}

/** Linha após mapping camelCase + tipos de domínio. */
export interface CachedPrinter {
  id: number;
  systemName: string;
  friendlyName: string | null;
  model: string | null;
  language: PrinterLanguage | null;
  defaultDpi: number | null;
  isDefault: boolean;
  lastUsedAt: string | null;
}

function isPrinterLanguage(value: unknown): value is PrinterLanguage {
  return value === "DRIVER" || value === "PPLB" || value === "ZPL";
}

function mapCachedRow(r: PrinterRowRaw): CachedPrinter {
  return {
    id: r.id,
    systemName: r.system_name,
    friendlyName: r.friendly_name,
    model: r.model,
    language: isPrinterLanguage(r.language) ? r.language : null,
    defaultDpi: r.default_dpi,
    isDefault: Boolean(r.is_default),
    lastUsedAt: r.last_used_at,
  };
}

/**
 * Lista impressoras detectadas no SO e sincroniza a tabela `printers`
 * (upsert por `system_name`). Idempotente — pode ser chamado a cada abertura
 * do wizard sem efeito colateral.
 *
 * Persistência usa o padrão WP-03 (SQL no JS). O backend não toca no banco
 * para não duplicar a ponte SQL.
 */
export async function printersList(): Promise<PrinterInfo[]> {
  const list = await invoke<PrinterInfo[]>("printers_list");
  // Upsert em paralelo é seguro porque cada impressora tem `system_name`
  // único (constraint UNIQUE no schema). Falha em uma não impede as outras.
  await Promise.all(
    list.map(async (p) => {
      try {
        await dbExecute(
          `INSERT INTO printers
             (system_name, friendly_name, model, language, default_dpi, is_default)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT(system_name) DO UPDATE SET
             friendly_name = excluded.friendly_name,
             model = excluded.model,
             language = excluded.language,
             default_dpi = excluded.default_dpi,
             is_default = excluded.is_default`,
          [
            p.systemName,
            p.friendlyName,
            p.driver,
            p.language,
            p.defaultDpi,
            p.isDefault ? 1 : 0,
          ],
        );
      } catch (e) {
        // Cache é best-effort — não bloqueia o wizard se o banco estiver
        // ocupado. O erro é silenciado para não derrubar a listagem.
        console.warn("printers cache upsert falhou", p.systemName, e);
      }
    }),
  );
  return list;
}

/**
 * Lê o status atual da impressora pedida. Mapeia exceções para `unknown`
 * (impressora pode ter sumido entre a listagem e a chamada).
 */
export async function printersGetStatus(systemName: string): Promise<PrinterStatus> {
  try {
    return await invoke<PrinterStatus>("printers_get_status", {
      printerName: systemName,
    });
  } catch {
    return "unknown";
  }
}

/**
 * Envia bytes (PDF) à impressora via driver do SO. Devolve um identificador
 * de job retornado pelo spooler (string). `copies` é replicado em N jobs
 * idênticos para garantir compatibilidade entre drivers que aceitam ou
 * ignoram a flag de cópias nativa.
 */
export async function printersPrintRaster(
  systemName: string,
  pdfBytes: Uint8Array,
  copies: number,
): Promise<string> {
  if (copies < 1) throw new Error("Quantidade de cópias deve ser ≥ 1.");
  // Tauri 2.x serializa `Uint8Array` → `Vec<u8>` automaticamente.
  return invoke<string>("printers_print_raster", {
    printerName: systemName,
    pdfBytes: Array.from(pdfBytes),
    copies,
  });
}

/**
 * Marca a impressora como "usada agora" — atualiza `last_used_at`. Chamado
 * imediatamente após `printersPrintRaster` ter sucesso, para alimentar o
 * histórico ([SPEC-12]) e o auto-select de "última impressora usada" no
 * wizard ([WP-13]).
 */
export async function printersMarkUsed(systemName: string): Promise<void> {
  try {
    await dbExecute(
      "UPDATE printers SET last_used_at = datetime('now') WHERE system_name = $1",
      [systemName],
    );
  } catch (e) {
    console.warn("printersMarkUsed falhou", systemName, e);
  }
}

/**
 * Lê a tabela `printers` sem tocar no SO. Usado para hidratação rápida da
 * UI antes de o `printers_list` retornar (snap-back).
 */
export async function printersListCached(): Promise<CachedPrinter[]> {
  const rows = await dbQuery<PrinterRowRaw>(
    `SELECT id, system_name, friendly_name, model, language, default_dpi,
            is_default, last_used_at
       FROM printers
       ORDER BY last_used_at DESC NULLS LAST, system_name ASC`,
  );
  return rows.map(mapCachedRow);
}

/**
 * Mensagens PT-BR para erros do spooler. O backend devolve a string original
 * do driver — aqui traduzimos os casos comuns para feedback claro no modal
 * (RF-I-08 / SPEC-09 §"Critérios de aceite").
 */
export function translatePrinterError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("not found")) return "Impressora não encontrada.";
  if (m.includes("offline")) return "Impressora está offline.";
  if (m.includes("out of paper") || m.includes("no paper"))
    return "Sem papel na impressora.";
  if (m.includes("paused")) return "Fila de impressão pausada.";
  if (m.includes("access") && m.includes("denied"))
    return "Acesso negado pelo SO ao spooler.";
  if (m.includes("door open")) return "Tampa da impressora aberta.";
  return raw;
}

/** Badge label exibido ao lado do nome da impressora. */
export function languageBadge(lang: PrinterLanguage): string | null {
  if (lang === "PPLB") return "Argox";
  if (lang === "ZPL") return "Zebra";
  return null;
}
