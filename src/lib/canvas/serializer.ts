/**
 * Serializador `canvas_json` ↔ estado em memória (WP-04 / SPEC-04).
 *
 * `canvasToJson()` produz a estrutura **exata** definida em PRD §4.3 — campos
 * `undefined` são removidos para manter o JSON pequeno e o snapshot
 * determinístico (importante para o futuro autosave em [WP-16](../../../specs/work-plan.md#wp-16--confiabilidade-autosave-recovery-logs-lixeira)
 * e para os hashes do `.etlbl` em [WP-14](../../../specs/work-plan.md#wp-14--importexport-etlbl-zip--manifest--validação-de-hashschema)).
 *
 * `jsonToCanvas()` é tolerante a campos ausentes (templates antigos / hand-edit)
 * e atribui defaults seguros. Falhas estruturais (não-JSON, schema selvagem)
 * caem em fallback "canvas vazio com as dimensões fornecidas" para o editor
 * sempre conseguir abrir.
 */

import type {
  BarcodeSymbology,
  CanvasDef,
  CanvasJson,
  CanvasObject,
  ObjectType,
  QrErrorCorrection,
} from "@/lib/canvas/types";

const VALID_SYMBOLOGIES: readonly BarcodeSymbology[] = [
  "CODE128",
  "CODE39",
  "CODE11",
  "EAN13",
  "EAN8",
  "UPCA",
  "UPCE",
  "ITF",
  "CODABAR",
  "QRCODE",
  "DATAMATRIX",
  "PDF417",
];

function pickSymbology(v: unknown): BarcodeSymbology | undefined {
  if (typeof v !== "string") return undefined;
  const upper = v.toUpperCase() as BarcodeSymbology;
  return VALID_SYMBOLOGIES.includes(upper) ? upper : undefined;
}

function pickQrEcc(v: unknown): QrErrorCorrection | undefined {
  return v === "L" || v === "M" || v === "Q" || v === "H" ? v : undefined;
}

const DEFAULT_BACKGROUND = "#FFFFFF";
const ALLOWED_TYPES: readonly ObjectType[] = [
  "text",
  "rectangle",
  "line",
  "ellipse",
  "image",
  "barcode",
  "qrcode",
];

function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result as T;
}

/** Serializa estado do editor para a forma persistida em `templates.canvas_json`. */
export function canvasToJson(
  canvas: CanvasDef,
  objects: CanvasObject[],
): CanvasJson {
  return {
    version: 1,
    units: "mm",
    canvas: omitUndefined({
      width: canvas.width,
      height: canvas.height,
      dpi: canvas.dpi,
      background: canvas.background ?? DEFAULT_BACKGROUND,
    }),
    objects: objects.map((o) => omitUndefined({ ...o }) as CanvasObject),
  };
}

/** Forma serializada em string. Conveniência para o backend. */
export function canvasToJsonString(
  canvas: CanvasDef,
  objects: CanvasObject[],
): string {
  return JSON.stringify(canvasToJson(canvas, objects));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickNumber(
  v: unknown,
  fallback?: number,
): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const parsed = Number.parseFloat(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function pickString(v: unknown, fallback?: string): string | undefined {
  return typeof v === "string" ? v : fallback;
}

function pickType(v: unknown): ObjectType | null {
  if (typeof v !== "string") return null;
  return ALLOWED_TYPES.includes(v as ObjectType) ? (v as ObjectType) : null;
}

/**
 * Deserializa o JSON persistido (ou um fallback) para o formato em memória.
 * @param raw string JSON do banco; pode ser vazio para template recém-criado.
 * @param fallback usado quando `raw` é inválido (preserva pelo menos as
 *                 dimensões corretas vindas da row de `templates`).
 */
export function jsonToCanvas(
  raw: string | null | undefined,
  fallback: CanvasDef,
): { canvas: CanvasDef; objects: CanvasObject[] } {
  const empty = { canvas: { ...fallback, background: fallback.background ?? DEFAULT_BACKGROUND }, objects: [] };
  if (!raw || typeof raw !== "string" || raw.trim().length === 0) {
    return empty;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!isRecord(parsed)) return empty;

  const rawCanvas = isRecord(parsed.canvas) ? parsed.canvas : {};
  const canvas: CanvasDef = {
    width: pickNumber(rawCanvas.width, fallback.width) ?? fallback.width,
    height: pickNumber(rawCanvas.height, fallback.height) ?? fallback.height,
    dpi: pickNumber(rawCanvas.dpi, fallback.dpi) ?? fallback.dpi,
    background:
      pickString(rawCanvas.background, fallback.background ?? DEFAULT_BACKGROUND) ??
      DEFAULT_BACKGROUND,
  };

  const rawObjects = Array.isArray(parsed.objects) ? parsed.objects : [];
  const objects: CanvasObject[] = [];
  for (const item of rawObjects) {
    if (!isRecord(item)) continue;
    const type = pickType(item.type);
    if (!type) continue;
    const id = pickString(item.id) ?? generateId(type);
    const base = {
      id,
      type,
      x: pickNumber(item.x, 0) ?? 0,
      y: pickNumber(item.y, 0) ?? 0,
      width: pickNumber(item.width),
      height: pickNumber(item.height),
      rotation: pickNumber(item.rotation, 0) ?? 0,
    };

    // Re-mapeia mantendo só os campos conhecidos por tipo. Campos extras
    // são descartados para manter o round-trip explícito.
    switch (type) {
      case "text":
        objects.push({
          ...base,
          type: "text",
          content: pickString(item.content, "") ?? "",
          fontFamily: pickString(item.fontFamily) ?? undefined,
          fontSize: pickNumber(item.fontSize),
          fontWeight:
            item.fontWeight === "bold" ? "bold" : item.fontWeight === "normal" ? "normal" : undefined,
          fontStyle:
            item.fontStyle === "italic" ? "italic" : item.fontStyle === "normal" ? "normal" : undefined,
          textDecoration:
            item.textDecoration === "underline" ||
            item.textDecoration === "line-through" ||
            item.textDecoration === "none"
              ? item.textDecoration
              : undefined,
          textAlign:
            item.textAlign === "center" ||
            item.textAlign === "right" ||
            item.textAlign === "justify" ||
            item.textAlign === "left"
              ? item.textAlign
              : undefined,
          verticalAlign:
            item.verticalAlign === "middle" ||
            item.verticalAlign === "bottom" ||
            item.verticalAlign === "top"
              ? item.verticalAlign
              : undefined,
          color: pickString(item.color),
          letterSpacing: pickNumber(item.letterSpacing),
          lineHeight: pickNumber(item.lineHeight),
          autoShrink:
            typeof item.autoShrink === "boolean" ? item.autoShrink : undefined,
          binding: isRecord(item.binding)
            ? {
                field: pickString(item.binding.field, "") ?? "",
                fallback: pickString(item.binding.fallback),
              }
            : undefined,
        });
        break;
      case "rectangle":
        objects.push({
          ...base,
          type: "rectangle",
          fill: pickString(item.fill),
          stroke: pickString(item.stroke),
          strokeWidth: pickNumber(item.strokeWidth),
          cornerRadius: pickNumber(item.cornerRadius),
        });
        break;
      case "line":
        objects.push({
          ...base,
          type: "line",
          stroke: pickString(item.stroke),
          strokeWidth: pickNumber(item.strokeWidth),
        });
        break;
      case "ellipse":
        objects.push({
          ...base,
          type: "ellipse",
          fill: pickString(item.fill),
          stroke: pickString(item.stroke),
          strokeWidth: pickNumber(item.strokeWidth),
        });
        break;
      case "image":
        objects.push({
          ...base,
          type: "image",
          src: pickString(item.src, "") ?? "",
        });
        break;
      case "barcode":
        objects.push({
          ...base,
          type: "barcode",
          symbology: pickSymbology(item.symbology),
          value: pickString(item.value),
          showText: typeof item.showText === "boolean" ? item.showText : undefined,
          moduleWidth: pickNumber(item.moduleWidth),
          errorCorrection: pickQrEcc(item.errorCorrection),
          binding: isRecord(item.binding)
            ? {
                field: pickString(item.binding.field, "") ?? "",
                fallback: pickString(item.binding.fallback),
              }
            : undefined,
        });
        break;
      case "qrcode":
        objects.push({
          ...base,
          type: "qrcode",
          value: pickString(item.value),
          errorCorrection: pickQrEcc(item.errorCorrection),
          binding: isRecord(item.binding)
            ? {
                field: pickString(item.binding.field, "") ?? "",
                fallback: pickString(item.binding.fallback),
              }
            : undefined,
        });
        break;
    }
  }

  return { canvas, objects };
}

/**
 * Gera um id estável e legível para um novo objeto. Não usa `crypto.randomUUID`
 * para manter os ids curtos no JSON; colisão em runtime é praticamente nula
 * (timestamp ms + 4 chars random).
 */
export function generateId(type: ObjectType): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${type}_${Date.now().toString(36)}_${suffix}`;
}
