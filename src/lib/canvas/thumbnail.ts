/**
 * Gerador de thumbnail PNG do canvas (WP-05 / SPEC-04 §"Mudanças necessárias").
 *
 * Estratégia:
 *  - Monta um `Konva.Stage` off-screen (não anexado ao DOM principal) com as
 *    dimensões do template em mm * MM_TO_PX, sem zoom (sempre 1×).
 *  - Renderiza apenas o background + os objetos (sem grid, sem transformer).
 *  - Exporta via `stage.toDataURL({ pixelRatio })` com pixelRatio calculado
 *    para que o PNG final tenha ~`THUMBNAIL_MAX_DIMENSION_PX` no lado maior.
 *  - Decodifica o data URL (`data:image/png;base64,...`) em `Uint8Array` para
 *    persistir no SQLite (`thumbnail_png BLOB`).
 *
 * Decisões:
 *  - Off-screen para não interferir no Stage visível do editor (zoom, scroll,
 *    seleção). `Konva.Stage` exige um `container` HTMLElement, então criamos
 *    um `<div>` desanexado e descartamos depois (`stage.destroy()`).
 *  - O thumbnail é cru — não desenha barcodes nem QR (fica para WP-07
 *    incrementar o render real). Por ora desenhamos o mesmo placeholder amarelo
 *    do editor, suficiente para distinguir um template "com barcode" de um
 *    template em branco na galeria.
 *  - Sem dependências externas: Konva já está no bundle (WP-04), `atob` é
 *    nativo no Webview Tauri.
 */

import Konva from "konva";

import type { CanvasDef, CanvasObject } from "@/lib/canvas/types";
import { MM_TO_PX } from "@/lib/canvas/units";

/** Lado maior do PNG gerado (em px). 256 cobre cards da galeria com folga. */
const THUMBNAIL_MAX_DIMENSION_PX = 256;

/**
 * Gera um PNG do canvas atual e devolve os bytes prontos para BLOB.
 * `null` quando o ambiente não tem `document` (ex.: SSR/tests headless).
 */
export async function generateThumbnailPng(
  canvas: CanvasDef,
  objects: CanvasObject[],
): Promise<Uint8Array | null> {
  if (typeof document === "undefined") return null;

  const widthPx = canvas.width * MM_TO_PX;
  const heightPx = canvas.height * MM_TO_PX;

  // Container off-screen — não é anexado ao body, evitando reflow.
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-99999px";
  container.style.top = "-99999px";
  container.style.width = `${widthPx}px`;
  container.style.height = `${heightPx}px`;
  document.body.appendChild(container);

  const stage = new Konva.Stage({
    container,
    width: widthPx,
    height: heightPx,
  });

  try {
    const bgLayer = new Konva.Layer({ listening: false });
    bgLayer.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: widthPx,
        height: heightPx,
        fill: canvas.background ?? "#FFFFFF",
        stroke: "#94a3b8",
        strokeWidth: 0.5,
      }),
    );
    stage.add(bgLayer);

    const content = new Konva.Layer({
      listening: false,
      clipFunc: (ctx) => ctx.rect(0, 0, widthPx, heightPx),
    });

    for (const obj of objects) {
      const node = buildNode(obj);
      // `add` aceita Group | Shape; nossos `buildNode` retornam apenas esses
      // tipos, mas o type Konva.Node é o tipo base — cast seguro local.
      if (node) content.add(node as Konva.Group | Konva.Shape);
    }
    stage.add(content);

    // Espera imagens carregarem (já estão como data URLs, mas o decode é async).
    await waitForImages(content);

    const ratio =
      THUMBNAIL_MAX_DIMENSION_PX / Math.max(widthPx, heightPx, 1);
    const dataUrl = stage.toDataURL({
      mimeType: "image/png",
      pixelRatio: ratio,
    });
    return dataUrlToUint8Array(dataUrl);
  } finally {
    stage.destroy();
    if (container.parentNode) container.parentNode.removeChild(container);
  }
}

/**
 * Constrói um node Konva equivalente ao objeto de domínio. Versão sem zoom
 * (sempre 1×) e sem interatividade — espelha o `CanvasArea` simplificado.
 */
function buildNode(o: CanvasObject): Konva.Node | null {
  const x = (o.x ?? 0) * MM_TO_PX;
  const y = (o.y ?? 0) * MM_TO_PX;
  const width = (o.width ?? 0) * MM_TO_PX;
  const height = (o.height ?? 0) * MM_TO_PX;
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
        strokeWidth: (o.strokeWidth ?? 0.3) * MM_TO_PX,
        cornerRadius: (o.cornerRadius ?? 0) * MM_TO_PX,
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
          strokeWidth: (o.strokeWidth ?? 0.3) * MM_TO_PX,
        }),
      );
      return g;
    }
    case "line": {
      const stroke = o.stroke ?? "#000000";
      const lineH = Math.max(1, (o.height ?? 0.4) * MM_TO_PX);
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
        fontFamily: o.fontFamily ?? "Arial",
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
        fill: o.color ?? "#000000",
      });
    case "image": {
      if (!o.src) return null;
      const img = new window.Image();
      img.src = o.src;
      // O Konva.Image aceita ser construído sem a HTMLImage carregada — o
      // `waitForImages` mais abaixo aguarda o `onload` ou erro.
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
      const g = new Konva.Group({ x, y, rotation });
      g.add(
        new Konva.Rect({
          width,
          height,
          fill: "#fef9c3",
          stroke: "#ca8a04",
          strokeWidth: 1,
          dash: [4, 4],
        }),
      );
      g.add(
        new Konva.Text({
          x: 4,
          y: 4,
          text:
            o.type === "barcode"
              ? `Barcode: ${o.value ?? ""}`
              : `QR: ${o.value ?? ""}`,
          fontSize: 10,
          fill: "#854d0e",
          width: Math.max(0, width - 8),
        }),
      );
      return g;
    }
  }
}

/**
 * Espera todas as `Konva.Image` do layer terminarem de carregar (ou falharem).
 * Sem isso, `toDataURL` chama enquanto o HTMLImage ainda não tem bytes
 * decodificados, resultando em thumbnail com retângulos "carregando".
 */
function waitForImages(layer: Konva.Layer): Promise<void> {
  const promises: Promise<void>[] = [];
  layer.find("Image").forEach((node) => {
    const img = (node as Konva.Image).image() as
      | HTMLImageElement
      | undefined;
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

/**
 * Decodifica uma data URL `data:image/png;base64,...` para `Uint8Array`.
 * Lança quando a URL não tem prefixo base64 esperado.
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) {
    throw new Error("Data URL inválida para thumbnail.");
  }
  const header = dataUrl.slice(5, comma); // ex: image/png;base64
  const isBase64 = header.includes(";base64");
  const payload = dataUrl.slice(comma + 1);
  if (!isBase64) {
    // Caso teórico: data URL urlencoded; convertemos via TextEncoder.
    return new TextEncoder().encode(decodeURIComponent(payload));
  }
  const binary = atob(payload);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Conveniência inverso para a galeria: converte o BLOB lido do SQLite em um
 * ObjectURL pronto para um `<img src>`. O caller é responsável por revogar
 * o URL com `URL.revokeObjectURL(...)` quando o componente desmontar.
 */
export function thumbnailToObjectUrl(bytes: Uint8Array): string {
  // Copia para um ArrayBuffer pleno — `BlobPart` em lib.dom recente exige
  // ArrayBuffer (não SharedArrayBuffer), e o `Uint8Array` cru pode ter um
  // `ArrayBufferLike` que falha no narrowing.
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const blob = new Blob([buf], { type: "image/png" });
  return URL.createObjectURL(blob);
}
