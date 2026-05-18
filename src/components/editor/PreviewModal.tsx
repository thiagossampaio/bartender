import * as React from "react";
import Konva from "konva";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Loader2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fontFamilyWithFallback } from "@/lib/canvas/fonts";
import {
  fitSvgToBox,
  renderBarcodeSvg,
  svgToDataUrl,
} from "@/lib/canvas/barcode-svg";
import type { CanvasDef, CanvasObject } from "@/lib/canvas/types";
import { CSS_PX_PER_MM, devicePixelRatioOr1 } from "@/lib/preview/screen-dpi";

/**
 * Modal de pré-visualização fiel (WP-08 / SPEC-08).
 *
 * - Renderiza **uma página por vez** em proporção mm-correta usando o fator
 *   CSS-padrão `96 px / 25.4 mm` (≈ 3.78 CSS px/mm). Aderente ao critério
 *   "50×30 mm na tela ≈ 50×30 mm físicos" em monitores ~96 dpi.
 * - Navegação primeira/anterior/próxima/última + input "ir para nº"
 *   (RF-P-02). Para etiqueta única (WP-08 entrega 1 página), os controles
 *   ficam visíveis mas desabilitados — UI consistente quando o wizard
 *   [WP-13] passar N páginas.
 * - Botão "Exportar PDF" delega ao `exportPdf` (helper em `lib/pdf/export.ts`).
 *
 * O Stage Konva é montado uma única vez e re-renderizado quando o índice da
 * página muda (`useEffect`). Isso evita o overhead de remount em batches
 * grandes (RF-P performance: 500 etiquetas, preview ≤ 10 s).
 */
export interface PreviewPage {
  canvas: CanvasDef;
  objects: CanvasObject[];
  /** Contexto opcional para binding/placeholders por linha (futuro WP-13). */
  bindingContext?: Record<string, string | number | null | undefined>;
}

export interface PreviewModalProps {
  open: boolean;
  pages: PreviewPage[];
  /** Título mostrado no header do modal. */
  templateName?: string;
  onOpenChange: (open: boolean) => void;
  onExportPdf?: () => Promise<void> | void;
  /** True enquanto o caller está executando o `onExportPdf`. */
  exporting?: boolean;
}

export function PreviewModal({
  open,
  pages,
  templateName,
  onOpenChange,
  onExportPdf,
  exporting,
}: PreviewModalProps) {
  const [index, setIndex] = React.useState(0);
  const [gotoText, setGotoText] = React.useState("");

  // Reseta o índice quando o modal abre ou o set de páginas muda.
  React.useEffect(() => {
    if (open) {
      setIndex(0);
      setGotoText("");
    }
  }, [open, pages]);

  // Fecha com ESC. Mantemos um listener separado do `Dialog` porque o
  // PreviewModal é mais "tela cheia" e queremos que o foco fique no Konva.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        setIndex((i) => Math.min(pages.length - 1, i + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Home") {
        setIndex(0);
      } else if (e.key === "End") {
        setIndex(pages.length - 1);
      }
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, pages.length, onOpenChange]);

  if (!open) return null;
  if (pages.length === 0) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-empty-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      >
        <div className="rounded-lg border bg-card p-6 text-center">
          <h2 id="preview-empty-title" className="text-base font-semibold">
            Nenhuma etiqueta para pré-visualizar
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Adicione objetos ao canvas antes de abrir a pré-visualização.
          </p>
          <Button className="mt-4" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </div>
    );
  }

  const current = pages[index];
  const total = pages.length;

  function handleGoto(e: React.FormEvent) {
    e.preventDefault();
    const n = Number.parseInt(gotoText, 10);
    if (Number.isNaN(n)) return;
    const clamped = Math.min(Math.max(1, n), total);
    setIndex(clamped - 1);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
      className="fixed inset-0 z-50 flex flex-col bg-black/70"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 bg-card px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <h2 id="preview-title" className="truncate text-sm font-semibold">
            Pré-visualização{templateName ? ` — ${templateName}` : ""}
          </h2>
          <span className="rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground">
            {current.canvas.width} × {current.canvas.height} mm
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onExportPdf && (
            <Button
              size="sm"
              onClick={() => void onExportPdf()}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              {exporting ? "Exportando…" : "Exportar PDF"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar pré-visualização"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      {/* Body — área do canvas centralizada */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-6">
        <PreviewStage page={current} />
      </div>

      {/* Footer — navegação entre páginas */}
      <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-card px-4 py-2 text-sm">
        <NavButton
          disabled={index === 0}
          onClick={() => setIndex(0)}
          icon={<ChevronsLeft className="h-4 w-4" aria-hidden="true" />}
          label="Primeira"
        />
        <NavButton
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          icon={<ChevronLeft className="h-4 w-4" aria-hidden="true" />}
          label="Anterior"
        />
        <span className="px-2 text-muted-foreground" aria-live="polite">
          Página <strong className="text-foreground">{index + 1}</strong> de{" "}
          <strong className="text-foreground">{total}</strong>
        </span>
        <NavButton
          disabled={index >= total - 1}
          onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          icon={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
          label="Próxima"
        />
        <NavButton
          disabled={index >= total - 1}
          onClick={() => setIndex(total - 1)}
          icon={<ChevronsRight className="h-4 w-4" aria-hidden="true" />}
          label="Última"
        />
        <form onSubmit={handleGoto} className="ml-3 flex items-center gap-1.5">
          <Label htmlFor="preview-goto" className="text-xs">
            Ir para
          </Label>
          <Input
            id="preview-goto"
            value={gotoText}
            onChange={(e) => setGotoText(e.target.value)}
            type="number"
            min={1}
            max={total}
            className="h-8 w-16"
            disabled={total <= 1}
            aria-label="Ir para a página"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={total <= 1 || gotoText.trim().length === 0}
          >
            Ir
          </Button>
        </form>
      </footer>
    </div>
  );
}

interface NavButtonProps {
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function NavButton({ disabled, onClick, icon, label }: NavButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/**
 * Renderiza UMA página do preview com proporção em mm correta. Reusa o
 * pipeline Konva do thumbnail mas em **CSS px reais** (1 mm = 96/25.4 CSS
 * px), atrelando o `pixelRatio` ao `devicePixelRatio` para nitidez retina.
 */
function PreviewStage({ page }: { page: PreviewPage }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<Konva.Stage | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const widthCssPx = page.canvas.width * CSS_PX_PER_MM;
    const heightCssPx = page.canvas.height * CSS_PX_PER_MM;
    const pixelRatio = devicePixelRatioOr1();

    const stage = new Konva.Stage({
      container,
      width: widthCssPx,
      height: heightCssPx,
      pixelRatio,
    });
    stageRef.current = stage;

    // Background.
    const bgLayer = new Konva.Layer({ listening: false });
    bgLayer.add(
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
    stage.add(bgLayer);

    // Conteúdo.
    const content = new Konva.Layer({
      listening: false,
      clipFunc: (ctx) => ctx.rect(0, 0, widthCssPx, heightCssPx),
    });
    for (const obj of page.objects) {
      const node = buildNode(obj, page.canvas.dpi, page.bindingContext);
      if (node) content.add(node as Konva.Group | Konva.Shape);
    }
    stage.add(content);

    // Aguarda imagens carregarem antes de desenhar o frame final — caso
    // contrário barcodes e fotos aparecem em branco no primeiro frame.
    void waitForImages(content).then(() => {
      content.batchDraw();
    });

    return () => {
      stage.destroy();
      stageRef.current = null;
    };
  }, [page]);

  return (
    <div className="rounded-md bg-white shadow-2xl ring-1 ring-black/10">
      <div ref={containerRef} />
    </div>
  );
}

/**
 * Constrói um node Konva equivalente ao objeto de domínio, em CSS px (1 mm
 * = `CSS_PX_PER_MM`). Espelha a estrutura do `thumbnail.ts`/`CanvasArea.tsx`
 * mas usando o fator de tela em vez de `MM_TO_PX` (4) — assim a etiqueta
 * fica fisicamente correta.
 */
function buildNode(
  o: CanvasObject,
  canvasDpi: number,
  bindingContext?: Record<string, string | number | null | undefined>,
): Konva.Node | null {
  const x = (o.x ?? 0) * CSS_PX_PER_MM;
  const y = (o.y ?? 0) * CSS_PX_PER_MM;
  const width = (o.width ?? 0) * CSS_PX_PER_MM;
  const height = (o.height ?? 0) * CSS_PX_PER_MM;
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
        strokeWidth: (o.strokeWidth ?? 0.3) * CSS_PX_PER_MM,
        cornerRadius: (o.cornerRadius ?? 0) * CSS_PX_PER_MM,
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
          strokeWidth: (o.strokeWidth ?? 0.3) * CSS_PX_PER_MM,
        }),
      );
      return g;
    }
    case "line": {
      const stroke = o.stroke ?? "#000000";
      const lineH = Math.max(1, (o.height ?? 0.4) * CSS_PX_PER_MM);
      return new Konva.Rect({
        x,
        y,
        width,
        height: lineH,
        rotation,
        fill: stroke,
      });
    }
    case "text":
      return new Konva.Text({
        x,
        y,
        rotation,
        width: width > 0 ? width : undefined,
        height: height > 0 ? height : undefined,
        text: o.content ?? "",
        fontFamily: fontFamilyWithFallback(o.fontFamily),
        // pt → CSS px @ 96 dpi: 1 pt ≈ 1.333 px.
        fontSize: (o.fontSize ?? 12) * 1.333,
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
        verticalAlign: o.verticalAlign ?? "top",
        letterSpacing: o.letterSpacing ?? 0,
        lineHeight: o.lineHeight ?? 1,
        wrap: "word",
        fill: o.color ?? "#000000",
      });
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
      const rendered = renderBarcodeSvg(o, { dpi: canvasDpi, bindingContext });
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

/** Aguarda todas as `Konva.Image` do layer terminarem de carregar. */
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
