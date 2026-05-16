/**
 * Runner do Wizard de Impressão em Lote (WP-13 / SPEC-07).
 *
 * Centraliza a execução do passo final do wizard: tomar um `BatchPlan` +
 * `BatchDestination` e despachar para o pipeline certo:
 *
 *  - `pdf`     → `exportPdf(pages, bindingPerPage)` com diálogo de save nativo.
 *  - `driver`  → gera bytes do PDF (`buildPdfBytes`) e envia via
 *                `printersPrintRaster` (1 cópia, pois o lote já é multipágina).
 *  - `native`  → para cada página, materializa o canvas com strings literais
 *                e dispara `pplbPrint`/`zplPrint` (1 cópia por página).
 *
 * Decisões:
 *  - **Driver com 1 cópia, página por etiqueta**: o spooler interpreta o PDF
 *    multipágina; replicar `copies` aqui produziria N PDFs idênticos.
 *  - **Raw em loop por linha**: PPLB/ZPL não suportam multi-template no mesmo
 *    payload de forma trivial. O loop usa o `copies` da própria linha; um
 *    `P<n>`/`^PQ<n>` no envelope já replica os N rótulos daquela linha sem
 *    re-enviar bytes.
 *  - **Telemetria de progresso**: o caller pode passar `onProgress(done,
 *    total)` para mostrar barra; a fonte da verdade do total é a soma das
 *    quantidades resolvidas (não o length de pages, que pode ter sido capado
 *    no expand para o preview).
 */

import { suggestPdfFileName, exportPdf, buildPdfBytes } from "@/lib/pdf/export";
import { canvasToJsonString } from "@/lib/canvas/serializer";
import { historyRecord, type PrintDataSource } from "@/lib/history";
import { pplbPrint } from "@/lib/pplb";
import { printersMarkUsed, printersPrintRaster } from "@/lib/printers";
import { zplPrint } from "@/lib/zpl";
import { expandBatchPlan, materializePageObjects } from "@/lib/batch/expand";
import type { BatchDestination, BatchPlan } from "@/lib/batch/types";

export interface RunBatchOptions {
  plan: BatchPlan;
  destination: BatchDestination;
  /** Nome base sugerido para o PDF (sem extensão). */
  templateName: string;
  /** Id do template aberto — propagado para `print_history` (raw). */
  templateId?: number;
  /** Notificação de progresso (1-indexado). */
  onProgress?: (done: number, total: number) => void;
}

export interface RunBatchResult {
  /** Total de etiquetas efetivamente despachadas. */
  printed: number;
  /** Caminho do PDF gravado (quando `kind = "pdf"`). */
  pdfPath?: string;
  /** Job-id retornado pelo spooler quando aplicável (driver / single raw). */
  jobId?: string;
  /** `true` se o usuário cancelou o diálogo de save do PDF. */
  cancelled?: boolean;
}

export async function runBatch(opts: RunBatchOptions): Promise<RunBatchResult> {
  const { plan, destination, templateName, templateId, onProgress } = opts;
  const expanded = expandBatchPlan(plan);
  const total = expanded.pages.length;

  if (total === 0) {
    throw new Error(
      "Nenhuma etiqueta para imprimir. Verifique a seleção e a quantidade.",
    );
  }

  // Mapa de `bindingPerPage` aceito pelo `exportPdf`/`buildPdfBytes`. Aqui o
  // contexto é `{string → string}`; o tipo da export aceita
  // string | number | null | undefined — coerção implícita.
  const bindingPerPage = expanded.pages.map((p) => p.bindingContext);
  const pages = expanded.pages.map((p) => ({
    canvas: p.canvas,
    objects: p.objects,
  }));

  // Origem dos dados — propagada para `print_history` ([SPEC-12]).
  // Quando o usuário usou uma planilha, registramos o tipo + caminho para a
  // tela `History` (WP-15) poder validar reimpressão.
  const dataSource: PrintDataSource =
    plan.dataset.source === "csv"
      ? "csv"
      : plan.dataset.source === "xlsx"
        ? "xlsx"
        : "manual";
  const sourcePath = plan.dataset.filePath ?? null;

  if (destination.kind === "pdf") {
    const result = await exportPdf({
      pages,
      suggestedFileName: suggestPdfFileName(templateName),
      bindingPerPage,
    });
    if (!result) {
      return { printed: 0, cancelled: true };
    }
    onProgress?.(total, total);
    // PDF não é "impressão" stricto sensu, mas o SPEC-12 critério 1 trata
    // qualquer despacho do wizard como entrada do histórico. Registramos com
    // `mode = "driver"` (não há linguagem nativa envolvida) e
    // `printer_name = "PDF"` para distinção visual na tela `History`.
    if (templateId) {
      void historyRecord({
        templateId,
        printerName: "PDF",
        mode: "driver",
        quantity: total,
        dataSource,
        sourcePath,
      });
    }
    return { printed: total, pdfPath: result.path };
  }

  if (destination.kind === "driver") {
    const bytes = await buildPdfBytes(pages, bindingPerPage);
    const jobId = await printersPrintRaster(destination.printerName, bytes, 1);
    await printersMarkUsed(destination.printerName);
    onProgress?.(total, total);
    if (templateId) {
      void historyRecord({
        templateId,
        printerName: destination.printerName,
        mode: "driver",
        quantity: total,
        dataSource,
        sourcePath,
      });
    }
    return { printed: total, jobId };
  }

  // Raw nativo (PPLB/ZPL). Despacha por LINHA, não por página, para usar o
  // `P<n>`/`^PQ<n>` em vez de re-enviar bytes idênticos. Reagrupamos as
  // páginas por `rowIndex`, mantendo a ordem original.
  let printedSoFar = 0;
  let lastJobId: string | undefined;

  for (let i = 0; i < expanded.rowIndices.length; i += 1) {
    const rowIdx = expanded.rowIndices[i];
    const qty = expanded.quantities[i] ?? 0;
    if (qty <= 0) continue;
    // A primeira página dessa linha basta — todas as `qty` cópias compartilham
    // o mesmo `bindingContext`.
    const page = expanded.pages.find((p) => p.rowIndex === rowIdx);
    if (!page) continue;
    const objectsMaterial = materializePageObjects(page);
    const canvasJson = canvasToJsonString(page.canvas, objectsMaterial);
    if (destination.language === "PPLB") {
      const res = await pplbPrint(
        destination.printerName,
        canvasJson,
        qty,
        templateId,
        { dataSource, sourcePath },
      );
      lastJobId = res.jobId;
    } else {
      const res = await zplPrint(
        destination.printerName,
        canvasJson,
        qty,
        templateId,
        { dataSource, sourcePath },
      );
      lastJobId = res.jobId;
    }
    printedSoFar += qty;
    onProgress?.(printedSoFar, total);
  }

  return { printed: printedSoFar, jobId: lastJobId };
}
