/**
 * Serviço ZPL (WP-11 / SPEC-10).
 *
 * Façade entre o frontend e o backend Rust (`zpl_generate`,
 * `printers_print_raw`). Encapsula o pipeline "Modo nativo" para impressoras
 * Zebra (RF-I-03): gera o bytecode ZPL a partir do `canvas_json`, envia raw
 * via spooler do SO e atualiza `printers.last_used_at`.
 *
 * Espelha o módulo `@/lib/pplb` (WP-10) — único ponto de envio raw é
 * `printersPrintRaw`, compartilhado com PPLB.
 */

import { invoke } from "@tauri-apps/api/core";

import { historyRecord, type PrintDataSource } from "@/lib/history";
import { printersPrintRaw } from "@/lib/pplb";
import { printersMarkUsed } from "@/lib/printers";

/**
 * Gera o código ZPL para um único `canvas_json`. Devolve string ASCII pronta
 * para inspeção ou envio raw.
 */
export async function zplGenerate(
  canvasJson: string,
  copies: number,
): Promise<string> {
  if (!Number.isFinite(copies) || copies < 1) {
    throw new Error("Quantidade de cópias deve ser ≥ 1.");
  }
  return invoke<string>("zpl_generate", {
    canvasJson,
    copies,
  });
}

/** Opções para o registro no histórico (WP-15). Defaults preservam o
 * comportamento manual single-label do PrintDialog. */
export interface ZplPrintOptions {
  /** Origem dos dados — `manual` quando vem do editor sem dataset; `csv`/`xlsx`
   * quando o caller veio do wizard de lote (WP-13). */
  dataSource?: PrintDataSource;
  /** Caminho do arquivo de origem (quando `dataSource` ∈ {csv,xlsx}). */
  sourcePath?: string | null;
}

/**
 * Pipeline completo: `canvas_json` → ZPL → envio raw para a impressora.
 * Atualiza `last_used_at` em sucesso e (opcionalmente) registra o evento em
 * `print_history` quando `templateId` é fornecido. Pensado para ser chamado
 * pelo callback `onNativeIntent` do [`PrintDialog`] quando a impressora
 * selecionada é Zebra (`language === "ZPL"`) e pelo runner do
 * BatchPrintWizard (WP-13).
 */
export async function zplPrint(
  systemName: string,
  canvasJson: string,
  copies: number,
  templateId?: number,
  options: ZplPrintOptions = {},
): Promise<{ jobId: string; zpl: string }> {
  const zpl = await zplGenerate(canvasJson, copies);
  // ZPL é ASCII puro (escapamos não-ASCII no Rust antes de chegar aqui).
  // TextEncoder produz UTF-8, equivalente para o subset ASCII.
  const bytes = new TextEncoder().encode(zpl);
  const jobId = await printersPrintRaw(systemName, bytes, copies);
  await printersMarkUsed(systemName);
  if (typeof templateId === "number" && templateId > 0) {
    await historyRecord({
      templateId,
      printerName: systemName,
      mode: "raw_zpl",
      quantity: copies,
      dataSource: options.dataSource ?? "manual",
      sourcePath: options.sourcePath ?? null,
    });
  }
  return { jobId, zpl };
}
