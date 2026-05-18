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
  /** Alinhamento vertical dentro da bounding box (`top`/`middle`/`bottom`).
   *  Quando ausente, defaulta para `top` (compat com templates antigos). */
  verticalAlign?: "top" | "middle" | "bottom";
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

/**
 * Identificadores de simbologia 1D suportados (WP-07 / SPEC-06 RF-B-01).
 * Mantidos em maiúsculas para legibilidade e compatibilidade com o schema
 * existente; o mapeamento para o `bcid` interno do `bwip-js` está em
 * `src/lib/canvas/barcode.ts`.
 */
export type Barcode1DSymbology =
  | "CODE128"
  | "CODE39"
  | "CODE11"
  | "EAN13"
  | "EAN8"
  | "UPCA"
  | "UPCE"
  | "ITF"
  | "CODABAR";

/** Simbologias 2D suportadas (RF-B-02). */
export type Barcode2DSymbology = "QRCODE" | "DATAMATRIX" | "PDF417";

export type BarcodeSymbology = Barcode1DSymbology | Barcode2DSymbology;

export type QrErrorCorrection = "L" | "M" | "Q" | "H";

export interface BarcodeObject extends BaseObject {
  type: "barcode";
  /** Simbologia 1D. Pode estar ausente em templates antigos — defaulta para CODE128. */
  symbology?: BarcodeSymbology;
  /**
   * Valor codificado. Aceita literal ("789123456789") ou referência por
   * placeholder ("{{ sku }}"); a substituição via `binding`/contexto fica a
   * cargo do renderer (RF-B-08).
   */
  value?: string;
  /** Mostrar/ocultar HRT — Human Readable Text (RF-B-03). Default true. */
  showText?: boolean;
  /**
   * Largura do módulo (espessura da barra fina) em mm. Mapeada para a opção
   * `scale` do bwip-js usando o `dpi` do canvas. Default = 0.33 mm (~2 dots
   * a 203 dpi, mínimo recomendado pela Argox). Cobre RF-B-04.
   */
  moduleWidth?: number;
  /**
   * Nível de correção para QR (RF-B-04). Ignorado para 1D e demais 2D —
   * Data Matrix/PDF417 usam algoritmos próprios (deixados como defaults do
   * bwip-js para o MVP).
   */
  errorCorrection?: QrErrorCorrection;
}

export interface QrcodeObject extends BaseObject {
  type: "qrcode";
  value?: string;
  /** Nível de correção (RF-B-04). */
  errorCorrection?: QrErrorCorrection;
}

export type CanvasObject =
  | TextObject
  | RectangleObject
  | LineObject
  | EllipseObject
  | ImageObject
  | BarcodeObject
  | QrcodeObject;

/**
 * Layout físico do rolo (multi-coluna). Reflete a configuração do material:
 * rolos com 2+ colunas de etiquetas lado a lado precisam que cada "página
 * física" comporte `columns × rows` etiquetas com os gaps físicos do rolo.
 *
 * Onde isso é aplicado:
 *  - O **editor** continua mostrando UMA etiqueta (`width × height`).
 *  - O **lote** compõe `columns × rows` etiquetas em uma única página física,
 *    aplicando offsets X/Y nos objetos. Backend (PDF Rust / PPLB / ZPL)
 *    recebe a página física já trasladada — não precisa conhecer o layout.
 *  - O **single-print** ignora o layout (1 etiqueta na origem).
 *
 * Default `{ columns: 1, rows: 1, gapX: 0, gapY: 0 }` mantém comportamento
 * pré-WP-13.5 (templates antigos sem `layout`).
 */
export interface LayoutConfig {
  /** Etiquetas por linha física do rolo (default 1). */
  columns: number;
  /** Linhas físicas por página (default 1; raro > 1 em rolo contínuo). */
  rows: number;
  /** Espaço horizontal entre colunas, em mm (default 0). */
  gapX: number;
  /** Espaço vertical entre linhas, em mm (default 0). */
  gapY: number;
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  columns: 1,
  rows: 1,
  gapX: 0,
  gapY: 0,
};

export interface CanvasDef {
  /** Largura da etiqueta em mm. */
  width: number;
  /** Altura da etiqueta em mm. */
  height: number;
  dpi: number;
  background?: string;
  /** Layout físico do rolo (multi-coluna). Ausente = 1×1 sem gaps. */
  layout?: LayoutConfig;
}

export interface CanvasJson {
  version: 1;
  units: "mm";
  canvas: CanvasDef;
  objects: CanvasObject[];
}
