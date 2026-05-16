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

import { dbExecute } from "@/lib/db";
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

/**
 * Pipeline completo: `canvas_json` → ZPL → envio raw para a impressora.
 * Atualiza `last_used_at` em sucesso e (opcionalmente) registra o evento em
 * `print_history` quando `templateId` é fornecido. Pensado para ser chamado
 * pelo callback `onNativeIntent` do [`PrintDialog`] quando a impressora
 * selecionada é Zebra (`language === "ZPL"`).
 *
 * O insert em `print_history` é best-effort — o histórico completo
 * (consolidação, paginação, telemetria) entra em [WP-15]. Aqui apenas
 * cobrimos o critério "DEVE registrar impressão em `print_history` com
 * `mode = 'raw_zpl'`" do [SPEC-10] sem bloquear o pipeline de impressão.
 */
export async function zplPrint(
  systemName: string,
  canvasJson: string,
  copies: number,
  templateId?: number,
): Promise<{ jobId: string; zpl: string }> {
  const zpl = await zplGenerate(canvasJson, copies);
  // ZPL é ASCII puro (escapamos não-ASCII no Rust antes de chegar aqui).
  // TextEncoder produz UTF-8, equivalente para o subset ASCII.
  const bytes = new TextEncoder().encode(zpl);
  const jobId = await printersPrintRaw(systemName, bytes, copies);
  await printersMarkUsed(systemName);
  if (typeof templateId === "number" && templateId > 0) {
    try {
      await dbExecute(
        `INSERT INTO print_history
           (template_id, printer_name, mode, quantity, data_source)
         VALUES ($1, $2, 'raw_zpl', $3, 'manual')`,
        [templateId, systemName, copies],
      );
    } catch (e) {
      // Best-effort; WP-15 owns o histórico completo.
      // eslint-disable-next-line no-console
      console.warn("print_history insert falhou", e);
    }
  }
  return { jobId, zpl };
}
