/**
 * Pipeline de exportação PDF (WP-08 / SPEC-08).
 *
 * Ponte do estado do editor (`canvas_json`) até o comando Tauri
 * `pdf_export` — Rust (printpdf) é quem produz o PDF vetorial; aqui só
 * preparamos a payload:
 *
 *  1. Para cada página, clonamos os objetos do canvas.
 *  2. Cada `barcode`/`qrcode` é pré-renderizado em SVG via `bwip-js`
 *     (mesma função usada pelo editor) e o SVG é anexado ao objeto sob
 *     `renderedSvg`. O backend Rust faz parsing minimalista do SVG
 *     (`<rect>`-only) para emitir retângulos vetoriais no PDF, garantindo
 *     **barcodes nítidos em qualquer zoom** (RF-P-05).
 *  3. Texto e formas seguem como vetoriais nativos do printpdf.
 *  4. Imagens (data URLs PNG/JPEG) seguem como raster embarcado.
 *
 * Por que pré-renderizar no JS?
 *  - Mantemos uma única fonte da verdade para a geometria dos barcodes
 *    (a lib `bwip-js`), evitando inconsistência entre o que o usuário viu
 *    no preview e o que aparece no PDF.
 *  - `bwip-js` em Rust não existe estável; portar a lib não vale o esforço.
 *  - O SVG é texto compacto (~2-10 KB por barcode); transportar 500
 *    barcodes no IPC custa < 5 MB — aceitável para batches do MVP.
 */

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import { applyBinding } from "@/lib/canvas/barcode";
import { renderBarcodeSvg } from "@/lib/canvas/barcode-svg";
import { canvasToJson } from "@/lib/canvas/serializer";
import type {
  BarcodeObject,
  CanvasDef,
  CanvasJson,
  CanvasObject,
  QrcodeObject,
  TextObject,
} from "@/lib/canvas/types";

export interface PdfPage {
  canvas: CanvasDef;
  objects: CanvasObject[];
}

export interface ExportPdfOptions {
  /**
   * Páginas a serem exportadas. Para etiqueta única, 1 entrada; para o
   * wizard de lote (futuro WP-13), N entradas — uma por linha aplicada.
   */
  pages: PdfPage[];
  /** Nome do arquivo sugerido (sem path). Não precisa incluir extensão. */
  suggestedFileName: string;
  /** Caller pode optar por pular o diálogo (ex: testes E2E ou fluxo
   *  programático). Quando ausente, abrimos o save nativo via Tauri. */
  outputPath?: string;
  /**
   * Contextos de binding (1 por página). Hoje o editor exporta um único
   * preview sem binding; o WP-13 usa isso para resolver placeholders
   * `{{ campo }}` por linha do CSV/XLSX.
   */
  bindingPerPage?: Array<Record<string, string | number | null | undefined>>;
}

export interface ExportPdfResult {
  /** Caminho onde o PDF foi gravado (igual ao retorno do comando Rust). */
  path: string;
}

/**
 * Constrói o nome de arquivo sugerido `{{ template }}_YYYY-MM-DD_HHmm.pdf`
 * (RF-P-06). Sanitiza caracteres ilegais em filesystems comuns.
 */
export function suggestPdfFileName(templateName: string, when: Date = new Date()): string {
  // Remove combining diacritical marks (U+0300..U+036F). Construímos o
  // RegExp a partir de string `\u` para evitar caracteres combining
  // invisíveis no source.
  const diacritics = new RegExp("[\\u0300-\\u036f]", "g");
  const safe = templateName
    .normalize("NFD")
    .replace(diacritics, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .replace(/\s+/g, "_");
  const yyyy = when.getFullYear().toString().padStart(4, "0");
  const mm = (when.getMonth() + 1).toString().padStart(2, "0");
  const dd = when.getDate().toString().padStart(2, "0");
  const hh = when.getHours().toString().padStart(2, "0");
  const mi = when.getMinutes().toString().padStart(2, "0");
  return `${safe || "etiqueta"}_${yyyy}-${mm}-${dd}_${hh}${mi}.pdf`;
}

/**
 * Serializa a página, embutindo `renderedSvg` em cada barcode/qrcode.
 * O SVG é o output do `bwip-js`, montado pelo `renderBarcodeSvg` (cache
 * compartilhado com o editor — re-renderizar o mesmo barcode no preview e
 * no PDF custa zero adicional).
 */
function buildPagePayload(
  page: PdfPage,
  bindingContext?: Record<string, string | number | null | undefined>,
): string {
  const ctx = bindingContext ?? {};
  const enrichedObjects: CanvasObject[] = page.objects.map((obj) => {
    if (obj.type === "text") {
      const t = obj as TextObject;
      return { ...t, content: applyBinding(t.content ?? "", ctx) };
    }
    if (obj.type === "barcode" || obj.type === "qrcode") {
      const b = obj as BarcodeObject | QrcodeObject;
      // `renderBarcodeSvg` aplica binding internamente para gerar o SVG; aqui
      // também substituímos o `value` para manter o canvas_json consistente
      // (e qualquer logging/diagnóstico futuro veria a string final).
      const rendered = renderBarcodeSvg(b, {
        dpi: page.canvas.dpi,
        bindingContext,
      });
      return {
        ...b,
        value: applyBinding(b.value ?? "", ctx),
        renderedSvg: rendered.svg,
      } as CanvasObject & { renderedSvg: string };
    }
    return obj;
  });
  const cj: CanvasJson = canvasToJson(page.canvas, enrichedObjects);
  return JSON.stringify(cj);
}

/**
 * Exporta o PDF chamando o backend Rust. Se `outputPath` for omitido, abre o
 * diálogo de save nativo do SO (RF-P-07).
 *
 * @returns o path final, ou `null` se o usuário cancelou o diálogo.
 */
export async function exportPdf(options: ExportPdfOptions): Promise<ExportPdfResult | null> {
  if (options.pages.length === 0) {
    throw new Error("Nenhuma página para exportar.");
  }

  let outputPath = options.outputPath ?? null;
  if (!outputPath) {
    outputPath = await save({
      title: "Exportar PDF",
      defaultPath: options.suggestedFileName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!outputPath) return null;
  }

  const canvasJsons = options.pages.map((page, idx) =>
    buildPagePayload(page, options.bindingPerPage?.[idx]),
  );

  const path = await invoke<string>("pdf_export", {
    canvasJsons,
    outputPath,
  });
  return { path };
}

/**
 * Gera o PDF em memória (Uint8Array) — usado pelo wizard de impressão
 * (WP-09) para enviar o raster ao spooler **sem etapa intermediária de
 * save no disco**. Delega ao comando Rust `pdf_export_bytes` que reusa o
 * mesmo pipeline do `pdf_export` mas devolve `Vec<u8>` em vez de gravar
 * arquivo.
 */
export async function buildPdfBytes(
  pages: PdfPage[],
  bindingPerPage?: ExportPdfOptions["bindingPerPage"],
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error("Nenhuma página para imprimir.");
  }
  const canvasJsons = pages.map((page, idx) =>
    buildPagePayload(page, bindingPerPage?.[idx]),
  );
  const bytes = await invoke<number[] | Uint8Array>("pdf_export_bytes", {
    canvasJsons,
  });
  return bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
}
