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
import { composePhysicalPages, normalizeLayout } from "@/lib/batch/compose";
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
  const totalLogical = expanded.pages.length;

  if (totalLogical === 0) {
    throw new Error(
      "Nenhuma etiqueta para imprimir. Verifique a seleção e a quantidade.",
    );
  }

  // Layout físico do rolo (WP-13.5). Quando `1×1`, `composePhysicalPages`
  // devolve 1 página física por etiqueta lógica — equivalente ao caminho
  // anterior, com objetos já trasladados (`dx=0`, `dy=0`) e binding
  // materializado. Para multi-up, cada página física contém `cols*rows`
  // etiquetas de linhas potencialmente diferentes.
  const layout = normalizeLayout(plan.canvas.layout);
  const isMultiUp =
    layout.columns > 1 || layout.rows > 1 || layout.gapX > 0 || layout.gapY > 0;
  const physicalPages = composePhysicalPages(expanded.pages, layout);
  const totalPhysical = physicalPages.length;
  const physicalPdfPages = physicalPages.map((p) => ({
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
    // Binding já materializado em `compose`; passamos `undefined` para o
    // pipeline PDF não reaplicar (idempotente, mas evita confusão).
    const result = await exportPdf({
      pages: physicalPdfPages,
      suggestedFileName: suggestPdfFileName(templateName),
      bindingPerPage: undefined,
    });
    if (!result) {
      return { printed: 0, cancelled: true };
    }
    onProgress?.(totalLogical, totalLogical);
    // PDF não é "impressão" stricto sensu, mas o SPEC-12 critério 1 trata
    // qualquer despacho do wizard como entrada do histórico. Registramos com
    // `mode = "driver"` (não há linguagem nativa envolvida) e
    // `printer_name = "PDF"` para distinção visual na tela `History`.
    if (templateId) {
      void historyRecord({
        templateId,
        printerName: "PDF",
        mode: "driver",
        quantity: totalLogical,
        dataSource,
        sourcePath,
      });
    }
    return { printed: totalLogical, pdfPath: result.path };
  }

  if (destination.kind === "driver") {
    const bytes = await buildPdfBytes(physicalPdfPages, undefined);
    const jobId = await printersPrintRaster(destination.printerName, bytes, 1);
    await printersMarkUsed(destination.printerName);
    onProgress?.(totalLogical, totalLogical);
    if (templateId) {
      void historyRecord({
        templateId,
        printerName: destination.printerName,
        mode: "driver",
        quantity: totalLogical,
        dataSource,
        sourcePath,
      });
    }
    return { printed: totalLogical, jobId };
  }

  // Raw nativo (PPLB/ZPL).
  //
  // - **Layout 1×1**: agrupa por `rowIndex` para usar o `P<n>`/`^PQ<n>` —
  //   evita reenviar bytes idênticos. Comportamento pré-WP-13.5.
  // - **Multi-up (cols>1 ou rows>1)**: cada página física é uma composição de
  //   linhas distintas. Despachamos 1 envio raw por página física (qty=1).
  //   `P<n>` deixa de ser aplicável porque o conteúdo varia entre páginas.
  let printedSoFar = 0;
  let lastJobId: string | undefined;

  if (!isMultiUp) {
    for (let i = 0; i < expanded.rowIndices.length; i += 1) {
      const rowIdx = expanded.rowIndices[i];
      const qty = expanded.quantities[i] ?? 0;
      if (qty <= 0) continue;
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
      onProgress?.(printedSoFar, totalLogical);
    }
    return { printed: printedSoFar, jobId: lastJobId };
  }

  for (let i = 0; i < totalPhysical; i += 1) {
    const phys = physicalPages[i];
    const canvasJson = canvasToJsonString(phys.canvas, phys.objects);
    if (destination.language === "PPLB") {
      const res = await pplbPrint(
        destination.printerName,
        canvasJson,
        1,
        templateId,
        { dataSource, sourcePath },
      );
      lastJobId = res.jobId;
    } else {
      const res = await zplPrint(
        destination.printerName,
        canvasJson,
        1,
        templateId,
        { dataSource, sourcePath },
      );
      lastJobId = res.jobId;
    }
    printedSoFar += phys.slots.length;
    onProgress?.(printedSoFar, totalLogical);
  }

  return { printed: printedSoFar, jobId: lastJobId };
}
