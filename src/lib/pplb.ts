/**
 * Serviço PPLB (WP-10 / SPEC-10).
 *
 * Façade entre o frontend e o backend Rust (`pplb_generate`,
 * `printers_print_raw`). Encapsula o pipeline "Modo nativo" para impressoras
 * Argox (RF-I-03): gera o bytecode PPLB a partir do `canvas_json`, envia raw
 * via spooler do SO e atualiza `printers.last_used_at`.
 *
 * O caminho ZPL (Zebra) tem a mesma forma e entra em [WP-11] reusando
 * `printers_print_raw` — único ponto de envio raw em comum.
 */

import { invoke } from "@tauri-apps/api/core";

import { dbExecute } from "@/lib/db";
import { printersMarkUsed } from "@/lib/printers";

/**
 * Gera o código PPLB para um único `canvas_json`. Devolve string ASCII pronta
 * para inspeção ou envio raw.
 */
export async function pplbGenerate(
  canvasJson: string,
  copies: number,
): Promise<string> {
  if (!Number.isFinite(copies) || copies < 1) {
    throw new Error("Quantidade de cópias deve ser ≥ 1.");
  }
  return invoke<string>("pplb_generate", {
    canvasJson,
    copies,
  });
}

/**
 * Envia bytes raw (PPLB/ZPL) à impressora selecionada via driver do SO em
 * modo raw (`RawPrintJob` no Win / `lp -o raw` no macOS). Devolve o job-id
 * retornado pelo spooler.
 *
 * `copies` é validado mas **não é replicado** — o PPLB já carrega `P<n>` no
 * envelope. O ZPL análogo embarca `^PQ<n>`.
 */
export async function printersPrintRaw(
  systemName: string,
  rawBytes: Uint8Array,
  copies: number,
): Promise<string> {
  if (copies < 1) throw new Error("Quantidade de cópias deve ser ≥ 1.");
  return invoke<string>("printers_print_raw", {
    printerName: systemName,
    rawBytes: Array.from(rawBytes),
    copies,
  });
}

/**
 * Pipeline completo: `canvas_json` → PPLB → envio raw para a impressora.
 * Atualiza `last_used_at` em sucesso e (opcionalmente) registra o evento em
 * `print_history` quando `templateId` é fornecido. Pensado para ser chamado
 * pelo callback `onNativeIntent` do [`PrintDialog`].
 *
 * O insert em `print_history` é best-effort — o histórico completo
 * (consolidação, paginação, telemetria) entra em [WP-15]. Aqui apenas
 * cobrimos o critério "DEVE registrar impressão em `print_history` com
 * `mode = 'raw_pplb'`" do [SPEC-10] sem bloquear o pipeline de impressão.
 */
export async function pplbPrint(
  systemName: string,
  canvasJson: string,
  copies: number,
  templateId?: number,
): Promise<{ jobId: string; pplb: string }> {
  const pplb = await pplbGenerate(canvasJson, copies);
  // Encoda como ASCII (PPLB é ASCII puro; `TextEncoder` produz UTF-8, que é
  // equivalente para ASCII; escapamos não-ASCII no Rust antes de chegar aqui).
  const bytes = new TextEncoder().encode(pplb);
  const jobId = await printersPrintRaw(systemName, bytes, copies);
  await printersMarkUsed(systemName);
  if (typeof templateId === "number" && templateId > 0) {
    try {
      await dbExecute(
        `INSERT INTO print_history
           (template_id, printer_name, mode, quantity, data_source)
         VALUES ($1, $2, 'raw_pplb', $3, 'manual')`,
        [templateId, systemName, copies],
      );
    } catch (e) {
      // Best-effort; WP-15 owns o histórico completo.
      // eslint-disable-next-line no-console
      console.warn("print_history insert falhou", e);
    }
  }
  return { jobId, pplb };
}
