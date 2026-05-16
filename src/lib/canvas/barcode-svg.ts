/**
 * Gerador de SVG vetorial para códigos de barras 1D/2D (WP-07 / SPEC-06).
 *
 * Encapsula o `bwip-js.toSVG()` com:
 *  - Tratamento defensivo de erros (valor inválido → string vazia, sem throw).
 *  - Cache em memória: a chave é a combinação `(bcid, value, opts)`; o mesmo
 *    barcode (mesma simbologia/valor/escala/rotação) reaproveita o SVG.
 *    Reduz overhead em re-renders frequentes do Konva (drag, transform).
 *  - Saneamento do SVG: o bwip-js emite um `<svg viewBox=…>` sem `width`/
 *    `height` numérico — bom para escalar livre no Konva e no PDF do WP-08.
 *
 * O Renderer (componente React) é responsável por desenhar; este módulo é
 * puro (sem React) para que o WP-08 (PDF) e o WP-10 (raster PPLB) possam
 * reusar a mesma SVG quando precisarem.
 */

import bwipjs from "bwip-js/browser";

import {
  applyBinding,
  bcidFor,
  is2DSymbology,
  validateBarcode,
  DEFAULT_QR_ERROR_CORRECTION,
} from "@/lib/canvas/barcode";
import type {
  BarcodeObject,
  BarcodeSymbology,
  QrcodeObject,
  QrErrorCorrection,
} from "@/lib/canvas/types";

export interface RenderBarcodeOptions {
  /**
   * Largura do módulo em mm (apenas 1D). Padrão = 0.33 mm.
   * O bwip-js usa "scale" em pixels — convertemos com base no DPI do canvas
   * para manter fidelidade física na impressão.
   */
  moduleWidthMm?: number;
  /** Mostrar HRT (RF-B-03). 1D apenas. */
  showText?: boolean;
  /** Nível de correção para QR (RF-B-04). */
  errorCorrection?: QrErrorCorrection;
  /** DPI do canvas/template; usado para converter mm→px nas opções do bwip. */
  dpi: number;
  /**
   * Contexto de binding (RF-B-08). Quando passado, placeholders `{{ campo }}`
   * são substituídos antes de validar/renderizar. Sem o contexto, o valor
   * literal (com placeholders intactos) é renderizado — mostrando o
   * "esqueleto" no editor.
   */
  bindingContext?: Record<string, string | number | null | undefined>;
}

export interface RenderedBarcode {
  /** SVG válido, pronto para data URL/Konva.Image. Vazio quando inválido. */
  svg: string;
  /** Valor efetivo aplicado (com check digit / binding resolvido). */
  effectiveValue: string;
  /** True se a validação rejeitou — caller mostra estado de erro. */
  error?: string;
}

const SVG_CACHE = new Map<string, RenderedBarcode>();
const SVG_CACHE_MAX = 256;

function cacheKey(
  symbology: BarcodeSymbology,
  value: string,
  opts: Required<Pick<RenderBarcodeOptions, "dpi">> & {
    moduleWidthMm: number;
    showText: boolean;
    errorCorrection?: QrErrorCorrection;
  },
): string {
  return [
    symbology,
    value,
    opts.dpi,
    opts.moduleWidthMm.toFixed(3),
    opts.showText ? "1" : "0",
    opts.errorCorrection ?? "-",
  ].join("|");
}

/**
 * Gera o SVG vetorial para um objeto barcode/qrcode. Sem React; retorna o
 * `svg` cru e o `effectiveValue` (útil para legendas/HRT custom).
 */
export function renderBarcodeSvg(
  obj: BarcodeObject | QrcodeObject,
  options: RenderBarcodeOptions,
): RenderedBarcode {
  const symbology: BarcodeSymbology =
    obj.type === "qrcode"
      ? "QRCODE"
      : (obj.symbology ?? "CODE128");
  const rawValue = applyBinding(obj.value ?? "", options.bindingContext ?? {});

  // Validação amistosa: o caller pode renderizar um "placeholder de erro".
  const validation = validateBarcode(symbology, rawValue);
  if (!validation.ok) {
    return {
      svg: "",
      effectiveValue: validation.effectiveValue,
      error: validation.message,
    };
  }

  const effectiveValue = validation.effectiveValue;

  const moduleWidthMm =
    obj.type === "barcode"
      ? (obj.moduleWidth ?? 0.33)
      : 0.33; // Para QR/2D usamos density similar; bwip-js cuida do resto via scale.

  const showText =
    obj.type === "barcode" ? (obj.showText ?? true) : false;

  const errorCorrection: QrErrorCorrection | undefined =
    obj.type === "qrcode"
      ? (obj.errorCorrection ?? DEFAULT_QR_ERROR_CORRECTION)
      : symbology === "QRCODE" || symbology === "PDF417"
        ? ((obj as BarcodeObject).errorCorrection ?? DEFAULT_QR_ERROR_CORRECTION)
        : undefined;

  const key = cacheKey(symbology, effectiveValue, {
    dpi: options.dpi,
    moduleWidthMm,
    showText,
    errorCorrection,
  });
  const cached = SVG_CACHE.get(key);
  if (cached) return cached;

  // mm → dots: o bwip-js usa "scale" como multiplicador de px-por-módulo.
  // Para 203 dpi (Argox padrão): 1 mm ≈ 8 dots; com module = 0.33 mm temos
  // ~2.64 dots por módulo → arredondamos para 2 (mínimo recomendado).
  const dotsPerMm = options.dpi / 25.4;
  const scale = Math.max(1, Math.round(moduleWidthMm * dotsPerMm));

  const renderOpts: Parameters<typeof bwipjs.toSVG>[0] = {
    bcid: bcidFor(symbology),
    text: effectiveValue,
    scale,
    // Altura do bwip-js é em "módulos" para 1D. Deixamos o componente decidir
    // a altura visual via SVG (que respeita o bounding box do Konva). Mas
    // bwip-js exige uma altura — colocamos 10 módulos como padrão para 1D;
    // o renderer estica para o bounding box real.
    height: is2DSymbology(symbology) ? undefined : 10,
    includetext: showText,
    textxalign: "center",
    paddingwidth: 0,
    paddingheight: 0,
  };

  // QR/PDF417 aceitam `eclevel`: L/M/Q/H (QR) ou 0-8 (PDF417). Para PDF417
  // mapeamos H→8, Q→5, M→2, L→0 (níveis aproximados); para QR é direto.
  // `eclevel` não consta nos typings .d.ts do bwip-js — extensão dinâmica
  // (a lib aceita opções específicas por simbologia em runtime).
  const renderOptsExt = renderOpts as unknown as Record<string, unknown>;
  if (symbology === "QRCODE" && errorCorrection) {
    renderOptsExt.eclevel = errorCorrection;
  } else if (symbology === "PDF417" && errorCorrection) {
    const pdfEcc: Record<QrErrorCorrection, number> = { L: 0, M: 2, Q: 5, H: 8 };
    renderOptsExt.eclevel = pdfEcc[errorCorrection];
  }

  let svg = "";
  try {
    svg = bwipjs.toSVG(renderOpts);
  } catch (e) {
    const out: RenderedBarcode = {
      svg: "",
      effectiveValue,
      error: e instanceof Error ? e.message : "Erro ao renderizar barcode.",
    };
    cacheStore(key, out);
    return out;
  }

  const out: RenderedBarcode = { svg, effectiveValue };
  cacheStore(key, out);
  return out;
}

function cacheStore(key: string, value: RenderedBarcode) {
  if (SVG_CACHE.size >= SVG_CACHE_MAX) {
    // Evita crescimento ilimitado: remove o item mais antigo (LRU simples).
    const firstKey = SVG_CACHE.keys().next().value;
    if (firstKey !== undefined) SVG_CACHE.delete(firstKey);
  }
  SVG_CACHE.set(key, value);
}

/**
 * Converte um SVG string para uma data URL UTF-8. Mantém o XML legível
 * (sem base64) — facilita a auditoria offline-first (não confundir com
 * payloads opacos) e mantém o bundle livre de URLs externas.
 */
export function svgToDataUrl(svg: string): string {
  if (!svg) return "";
  // Encoding URL-safe: escapamos `#`, `<`, `>` e `"` que travariam o data URL.
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

/**
 * Decora um SVG do bwip-js com `width`/`height` em pixels para uso por
 * elementos que precisam de dimensão explícita (alguns navegadores não
 * respeitam `viewBox` sem isso, especialmente quando carregado como
 * HTMLImageElement). Mantém o `viewBox` intacto.
 */
export function fitSvgToBox(
  svg: string,
  widthPx: number,
  heightPx: number,
): string {
  if (!svg) return svg;
  // Substitui o primeiro <svg ...> pelo equivalente com width/height novos.
  return svg.replace(
    /<svg([^>]*?)>/,
    (_, attrs: string) => {
      // Remove width/height existentes (bwip-js geralmente não inclui, mas
      // garantimos idempotência).
      const cleaned = attrs
        .replace(/\swidth="[^"]*"/, "")
        .replace(/\sheight="[^"]*"/, "")
        .replace(/\spreserveAspectRatio="[^"]*"/, "");
      return `<svg${cleaned} width="${widthPx}" height="${heightPx}" preserveAspectRatio="none">`;
    },
  );
}

/** Limpa o cache — útil para testes / hot reload. */
export function _clearBarcodeCache() {
  SVG_CACHE.clear();
}
