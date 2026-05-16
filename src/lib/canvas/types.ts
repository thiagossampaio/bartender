/**
 * Tipos do `canvas_json` (WP-04 / SPEC-04).
 *
 * Schema oficial: PRD §4.3, reproduzido fielmente em
 * [SPEC-04](../../../specs/specs.md#spec-04--editor-de-layout-wysiwyg-canvas-konva).
 *
 * Os tipos aqui são a representação **em memória** com a qual o editor opera
 * (Konva). O serializador (`serializer.ts`) converte para a forma persistida
 * (omitindo campos opcionais com `undefined` para manter o JSON enxuto e
 * compatível com o schema do PRD).
 *
 * Decisões:
 * - Todos os objetos compartilham `BaseObject` (id, posição em mm, tamanho em
 *   mm, rotação em graus). `width`/`height` são opcionais no schema PRD para
 *   alguns tipos (text/line podem ter dimensões intrínsecas) — aceitamos
 *   `undefined` e tratamos no render.
 * - `barcode` e `qrcode` estão presentes no schema mas o **render** real fica
 *   para [WP-07](../../../specs/work-plan.md#wp-07--códigos-de-barras-1d2d-bwip-js--validação--binding).
 *   Aqui só preservamos os campos do JSON para round-trip fiel.
 * - `image` armazena `src` como data URL (PNG/JPG/SVG embarcado). O export
 *   `.etlbl` ([WP-14](../../../specs/work-plan.md#wp-14--importexport-etlbl-zip--manifest--validação-de-hashschema))
 *   é quem decide se quebra em assets externos no manifest.
 */

export type ObjectType =
  | "text"
  | "rectangle"
  | "line"
  | "ellipse"
  | "image"
  | "barcode"
  | "qrcode";

export interface Binding {
  field: string;
  fallback?: string;
}

export interface BaseObject {
  id: string;
  type: ObjectType;
  /** Coordenadas em mm a partir do canto superior esquerdo da etiqueta. */
  x: number;
  y: number;
  /** Dimensões em mm. Opcionais para tipos com geometria intrínseca (linha). */
  width?: number;
  height?: number;
  /** Rotação em graus (0–360). */
  rotation?: number;
  binding?: Binding;
}

export interface TextObject extends BaseObject {
  type: "text";
  content: string;
  fontFamily?: string;
  /** Tamanho em pt (aderente ao schema PRD §4.3). */
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  textAlign?: "left" | "center" | "right" | "justify";
  color?: string;
  /** Espaçamento entre caracteres em px (RF-F-07; WP-06). */
  letterSpacing?: number;
  /** Multiplicador de altura de linha; 1.0 = padrão. (RF-F-07; WP-06). */
  lineHeight?: number;
  /**
   * Auto-shrink (RF-F-10; WP-06). Quando true e o texto não couber no
   * bounding box (width × height definidos), o renderer reduz `fontSize`
   * progressivamente até caber. O tamanho persistido em `fontSize` é o
   * desejado; o reduzido é só visual.
   */
  autoShrink?: boolean;
}

export interface RectangleObject extends BaseObject {
  type: "rectangle";
  /** Cor de preenchimento; `"transparent"` ou ausência = sem fill. */
  fill?: string;
  stroke?: string;
  /** Espessura do contorno em mm. */
  strokeWidth?: number;
  /** Raio do canto em mm (0 = canto reto). */
  cornerRadius?: number;
}

export interface LineObject extends BaseObject {
  type: "line";
  stroke?: string;
  strokeWidth?: number;
}

export interface EllipseObject extends BaseObject {
  type: "ellipse";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface ImageObject extends BaseObject {
  type: "image";
  /** Data URL embarcada (data:image/...;base64,...). */
  src: string;
}

export interface BarcodeObject extends BaseObject {
  type: "barcode";
  /** Simbologia 1D (CODE128, EAN13, etc.). Render real virá no WP-07. */
  symbology?: string;
  value?: string;
  showText?: boolean;
}

export interface QrcodeObject extends BaseObject {
  type: "qrcode";
  value?: string;
  /** Nível de correção; render real virá no WP-07. */
  errorCorrection?: "L" | "M" | "Q" | "H";
}

export type CanvasObject =
  | TextObject
  | RectangleObject
  | LineObject
  | EllipseObject
  | ImageObject
  | BarcodeObject
  | QrcodeObject;

export interface CanvasDef {
  /** Largura da etiqueta em mm. */
  width: number;
  /** Altura da etiqueta em mm. */
  height: number;
  dpi: number;
  background?: string;
}

export interface CanvasJson {
  version: 1;
  units: "mm";
  canvas: CanvasDef;
  objects: CanvasObject[];
}
