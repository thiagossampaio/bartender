/**
 * Autosave / Recovery (WP-16 / SPEC-13).
 *
 * Façade fina sobre os comandos Rust `autosave_save` / `autosave_load` /
 * `autosave_clear`. Mantemos a serialização do canvas e a comparação de
 * timestamp aqui no frontend porque o editor já trabalha com
 * `canvas_json` em memória e com `TemplateRow.updatedAt` vindo do
 * `templatesGet`.
 *
 * O timer de 30 s é orquestrado em `useAutosave` (hook) — este módulo só
 * expõe as primitivas síncronas de I/O.
 */

import { invoke } from "@tauri-apps/api/core";

import { log } from "@/lib/logger";

const logger = log.scope("editor::autosave");

export interface AutosaveSnapshot {
  /** String JSON do template (formato igual ao da coluna `templates.canvas_json`). */
  json: string;
  /** Modificação (ms desde epoch, UTC). */
  mtimeMs: number;
}

interface RawAutosaveSnapshot {
  json: string;
  mtime_ms: number;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Persiste um snapshot do `canvas_json` em `<cache>/autosave/autosave_<id>.json`.
 * Não lança em browser puro (no-op) — útil em testes/Storybook.
 */
export async function autosaveSave(
  templateId: number,
  canvasJson: string,
): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke("autosave_save", {
      templateId,
      canvasJson,
    });
    logger.debug(`snapshot persistido (id=${templateId}, bytes=${canvasJson.length})`);
  } catch (err) {
    logger.warn(`falha ao salvar autosave (id=${templateId})`, err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** Lê o último snapshot conhecido (ou `null` se não há). */
export async function autosaveLoad(
  templateId: number,
): Promise<AutosaveSnapshot | null> {
  if (!isTauriRuntime()) return null;
  try {
    const raw = await invoke<RawAutosaveSnapshot | null>("autosave_load", {
      templateId,
    });
    if (!raw) return null;
    return { json: raw.json, mtimeMs: raw.mtime_ms };
  } catch (err) {
    logger.warn(`falha ao ler autosave (id=${templateId})`, err);
    return null;
  }
}

/** Apaga o snapshot. Usado após save bem-sucedido ou ao "Descartar" no modal. */
export async function autosaveClear(templateId: number): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke("autosave_clear", { templateId });
    logger.debug(`snapshot apagado (id=${templateId})`);
  } catch (err) {
    logger.warn(`falha ao apagar autosave (id=${templateId})`, err);
  }
}

/**
 * Converte um timestamp do banco (`YYYY-MM-DD HH:MM:SS`, UTC) para epoch ms.
 * Mesma lógica que já era usada para formatação em `Trash.tsx` e `History.tsx`,
 * deduplicada aqui para o recovery comparar com `mtimeMs` do snapshot.
 *
 * Aceita `null/undefined` devolvendo `0` — qualquer autosave válido vence.
 */
export function dbTimestampToEpochMs(raw: string | null | undefined): number {
  if (!raw) return 0;
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Decisão de recovery: o snapshot é mais novo que o último save persistido?
 *
 * Toleramos drift de relógio de até `TOLERANCE_MS` para evitar falso-positivo
 * quando o autosave roda imediatamente após o save (o `updated_at` do save é
 * gravado pelo SQLite via `datetime('now')` com precisão de segundo, então o
 * autosave do segundo seguinte com mtime em milissegundos parece "mais novo"
 * por alguns ms).
 */
const TOLERANCE_MS = 1500;

export function shouldOfferRecovery(
  snapshotMtimeMs: number,
  templateUpdatedAt: string | null | undefined,
): boolean {
  if (snapshotMtimeMs <= 0) return false;
  const dbMs = dbTimestampToEpochMs(templateUpdatedAt);
  return snapshotMtimeMs > dbMs + TOLERANCE_MS;
}
