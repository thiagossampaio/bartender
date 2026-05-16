import * as React from "react";
import Konva from "konva";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  fitSvgToBox,
  renderBarcodeSvg,
  svgToDataUrl,
} from "@/lib/canvas/barcode-svg";
import { applyBinding } from "@/lib/canvas/barcode";
import { fontFamilyWithFallback } from "@/lib/canvas/fonts";
import type { CanvasObject } from "@/lib/canvas/types";
import { CSS_PX_PER_MM, devicePixelRatioOr1 } from "@/lib/preview/screen-dpi";
import type { BatchPage } from "@/lib/batch/types";

/**
 * Step "Preview do lote" do BatchPrintWizard (WP-13 / SPEC-07 §"Comportamento esperado" item 6).
 *
 * Mostra um **carrossel das primeiras N etiquetas** + total ("523 etiquetas
 * serão impressas"). N default = 10. Implementação Konva mirror do
 * `PreviewModal` mas com `bindingContext` aplicado em cada página.
 *
 * Decisões:
 *  - **Carrossel não-virtual**: só renderizamos a página visível (1 Stage por
 *    vez) — performance previsível mesmo se houver 10 mil etiquetas.
 *  - **Origem das páginas**: o caller passa a lista já expandida (cap de N);
 *    o `total` veio do plano completo para mostrar o badge agregado.
 *  - **Substituição inline**: aplicamos `applyBinding` no momento do render,
 *    aproveitando o mesmo pipeline do PDF e do PreviewModal — não pré-clonamos
 *    objetos para economizar memória.
 */
export interface BatchPreviewStepProps {
  /** Páginas amostradas (até `previewCount`). */
  pages: readonly BatchPage[];
  /** Total real de etiquetas que serão impressas (informativo). */
  totalLabels: number;
  /** Total de linhas selecionadas (informativo). */
  selectedRows: number;
  /** Quantidade mostrada na amostra. */
  previewCount: number;
}

export function BatchPreviewStep({
  pages,
  totalLabels,
  selectedRows,
  previewCount,
}: BatchPreviewStepProps) {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    // Reseta o índice se o conjunto de páginas mudar (ex.: usuário voltou e
    // mudou filtro).
    setIndex(0);
  }, [pages]);

  if (pages.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Sem etiquetas para visualizar — revise o filtro e a quantidade.
      </div>
    );
  }

  const safeIndex = Math.min(index, pages.length - 1);
  const current = pages[safeIndex];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Pré-visualização do lote</h3>
        <p className="text-xs text-muted-foreground">
          Mostrando {pages.length} de {totalLabels} etiqueta
          {totalLabels === 1 ? "" : "s"} ({selectedRows} linha
          {selectedRows === 1 ? "" : "s"} selecionada
          {selectedRows === 1 ? "" : "s"}).{" "}
          {totalLabels > previewCount && (
            <span>Amostra das primeiras {previewCount}.</span>
          )}
        </p>
      </header>

      <div className="flex items-center justify-center rounded-md border bg-muted/30 p-4">
        <PreviewStage page={current} />
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Etiqueta anterior"
          disabled={safeIndex <= 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="min-w-[10rem] text-center text-xs text-muted-foreground" aria-live="polite">
          Etiqueta {safeIndex + 1} de {pages.length} · linha {current.rowIndex}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Próxima etiqueta"
          disabled={safeIndex >= pages.length - 1}
          onClick={() => setIndex((i) => Math.min(pages.length - 1, i + 1))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Stage Konva equivalente ao `PreviewModal` mas com `bindingContext` por
 * página — desenha **uma** etiqueta em proporção CSS mm-correta.
 */
function PreviewStage({ page }: { page: BatchPage }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Cap visual para não estourar o modal em etiquetas muito grandes (A4).
    const MAX_PX = 480;
    const naturalW = page.canvas.width * CSS_PX_PER_MM;
    const naturalH = page.canvas.height * CSS_PX_PER_MM;
    const scale = Math.min(MAX_PX / naturalW, MAX_PX / naturalH, 1);
    const widthCssPx = naturalW * scale;
    const heightCssPx = naturalH * scale;
    const factor = CSS_PX_PER_MM * scale;
    const pixelRatio = devicePixelRatioOr1();

    const stage = new Konva.Stage({
      container,
      width: widthCssPx,
      height: heightCssPx,
      pixelRatio,
    });

    const bg = new Konva.Layer({ listening: false });
    bg.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: widthCssPx,
        height: heightCssPx,
        fill: page.canvas.background ?? "#FFFFFF",
        stroke: "#cbd5e1",
        strokeWidth: 0.5,
      }),
    );
    stage.add(bg);

    const layer = new Konva.Layer({
      listening: false,
      clipFunc: (ctx) => ctx.rect(0, 0, widthCssPx, heightCssPx),
    });
    for (const obj of page.objects) {
      const node = buildNode(obj, page.canvas.dpi, page.bindingContext, factor);
      if (node) layer.add(node as Konva.Group | Konva.Shape);
    }
    stage.add(layer);

    void waitForImages(layer).then(() => layer.batchDraw());

    return () => {
      stage.destroy();
    };
  }, [page]);

  return (
    <div className="rounded-md bg-white shadow-xl ring-1 ring-black/10">
      <div ref={containerRef} />
    </div>
  );
}

function buildNode(
  o: CanvasObject,
  canvasDpi: number,
  bindingContext: Record<string, string>,
  factor: number,
): Konva.Node | null {
  const x = (o.x ?? 0) * factor;
  const y = (o.y ?? 0) * factor;
  const width = (o.width ?? 0) * factor;
  const height = (o.height ?? 0) * factor;
  const rotation = o.rotation ?? 0;

  switch (o.type) {
    case "rectangle":
      return new Konva.Rect({
        x,
        y,
        width,
        height,
        rotation,
        fill: o.fill === "transparent" ? undefined : o.fill,
        stroke: o.stroke ?? undefined,
        strokeWidth: (o.strokeWidth ?? 0.3) * factor,
        cornerRadius: (o.cornerRadius ?? 0) * factor,
      });
    case "ellipse": {
      const g = new Konva.Group({ x, y, rotation });
      g.add(
        new Konva.Ellipse({
          x: width / 2,
          y: height / 2,
          radiusX: width / 2,
          radiusY: height / 2,
          fill: o.fill === "transparent" ? undefined : o.fill,
          stroke: o.stroke ?? undefined,
          strokeWidth: (o.strokeWidth ?? 0.3) * factor,
        }),
      );
      return g;
    }
    case "line": {
      const stroke = o.stroke ?? "#000000";
      const lineH = Math.max(1, (o.height ?? 0.4) * factor);
      return new Konva.Rect({
        x,
        y,
        width,
        height: lineH,
        rotation,
        fill: stroke,
      });
    }
    case "text": {
      const content = applyBinding(o.content ?? "", bindingContext);
      return new Konva.Text({
        x,
        y,
        rotation,
        width: width > 0 ? width : undefined,
        height: height > 0 ? height : undefined,
        text: content,
        fontFamily: fontFamilyWithFallback(o.fontFamily),
        fontSize: (o.fontSize ?? 12) * 1.333 * (factor / CSS_PX_PER_MM),
        fontStyle:
          o.fontWeight === "bold" && o.fontStyle === "italic"
            ? "bold italic"
            : o.fontWeight === "bold"
              ? "bold"
              : o.fontStyle === "italic"
                ? "italic"
                : "normal",
        textDecoration:
          o.textDecoration === "underline"
            ? "underline"
            : o.textDecoration === "line-through"
              ? "line-through"
              : "",
        align: o.textAlign === "justify" ? "left" : (o.textAlign ?? "left"),
        letterSpacing: o.letterSpacing ?? 0,
        lineHeight: o.lineHeight ?? 1,
        wrap: "word",
        fill: o.color ?? "#000000",
      });
    }
    case "image": {
      if (!o.src) return null;
      const img = new window.Image();
      img.src = o.src;
      return new Konva.Image({
        x,
        y,
        width,
        height,
        rotation,
        image: img,
      });
    }
    case "barcode":
    case "qrcode": {
      const rendered = renderBarcodeSvg(o, {
        dpi: canvasDpi,
        bindingContext,
      });
      if (!rendered.svg || width <= 0 || height <= 0) return null;
      const fitted = fitSvgToBox(
        rendered.svg,
        Math.max(1, Math.round(width)),
        Math.max(1, Math.round(height)),
      );
      const img = new window.Image();
      img.src = svgToDataUrl(fitted);
      return new Konva.Image({
        x,
        y,
        width,
        height,
        rotation,
        image: img,
      });
    }
  }
}

function waitForImages(layer: Konva.Layer): Promise<void> {
  const promises: Promise<void>[] = [];
  layer.find("Image").forEach((node) => {
    const img = (node as Konva.Image).image() as HTMLImageElement | undefined;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) return;
    promises.push(
      new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }),
    );
  });
  return Promise.all(promises).then(() => undefined);
}
