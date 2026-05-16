/**
 * Tipos compartilhados do Wizard de Impressão em Lote (WP-13 / SPEC-07).
 *
 * Mantemos os tipos em um módulo dedicado para evitar ciclos de import entre
 * a UI (`components/batch/*`) e os utilitários (`lib/batch/*`). Tudo aqui é
 * declarativo — sem lógica.
 */
import type { CanvasDef, CanvasObject } from "@/lib/canvas/types";
import type { ColumnMapping } from "@/lib/data/mapping";
import type { ParsedDataset } from "@/lib/data/parsers";
import type { PlaceholderInfo } from "@/lib/data/placeholders";

/**
 * Filtro de linhas (RF-D-05). Espelha o que o usuário escolheu na step
 * "Filtro/quantidade".
 */
export type RowFilter =
  | { kind: "all" }
  /** Range 1-based inclusivo (ex.: 10–50 = linhas 10 a 50). */
  | { kind: "range"; from: number; to: number }
  /** Seleção manual — índices 1-based já validados pelo caller. */
  | { kind: "selection"; rows: number[] };

/**
 * Quantidade por linha (RF-D-06). Pode ser um valor fixo aplicado a todas as
 * linhas selecionadas OU lido de uma coluna específica do dataset (valor
 * inteiro positivo; linhas inválidas viram `0` e são listadas como aviso).
 */
export type RowQuantity =
  | { kind: "fixed"; value: number }
  | { kind: "column"; column: string };

/**
 * Erro de validação detectado em uma linha específica. Origina-se do
 * `validateBarcode` aplicado aos objetos `barcode`/`qrcode` do template com
 * o valor substituído pela linha (RF-B-08 + RF-D-07).
 */
export interface RowValidationError {
  /** Índice 1-based da linha no dataset original. */
  rowIndex: number;
  /** Id do objeto que falhou. */
  objectId: string;
  /** Tipo do objeto. */
  objectType: "barcode" | "qrcode" | "text";
  /** Mensagem PT-BR pronta para a UI. */
  message: string;
  /** Quando aplicável, o valor após o binding (útil para a UI mostrar). */
  resolvedValue?: string;
  /**
   * `true` quando o erro impede a impressão (placeholder sem coluna mapeada
   * em barcode, valor inválido em simbologia). Bloqueia o "Avançar".
   * `false` quando é apenas um aviso (linha com quantidade 0, por exemplo).
   */
  critical: boolean;
}

/** Resumo agregado de validação para feedback rápido na UI. */
export interface BatchValidationSummary {
  /** Total de erros críticos (bloqueia avanço). */
  criticalCount: number;
  /** Total de avisos não críticos (linhas serão puladas). */
  warningCount: number;
  /** Linhas com pelo menos um erro crítico — para destacar na tabela. */
  criticalRows: Set<number>;
  /** Lista completa, já ordenada por rowIndex/objectId. */
  errors: RowValidationError[];
}

/**
 * Página resolvida do lote — uma "etiqueta" pronta para o pipeline de
 * impressão / preview / PDF. `bindingContext` carrega o `{ campo → valor }`
 * para que cada texto / barcode aplique a substituição `{{ campo }}`.
 *
 * `objects`/`canvas` referenciam os do template (mesma instância) — o
 * `bindingContext` é o que muda por linha. Mantemos uma cópia por página
 * para o consumidor poder enriquecer (`renderedSvg` no PDF, por exemplo)
 * sem mutar o estado original do editor.
 */
export interface BatchPage {
  canvas: CanvasDef;
  objects: CanvasObject[];
  bindingContext: Record<string, string>;
  /** Índice da linha de origem no dataset (1-based). */
  rowIndex: number;
}

/**
 * "Plano" do lote — composição de seleção × quantidade. Não inclui as
 * páginas expandidas: o caller chama `expandBatchPlan` quando precisa
 * materializar (preview, PDF, raw).
 */
export interface BatchPlan {
  /** Dataset usado como fonte. */
  dataset: ParsedDataset;
  /** Mapeamento placeholder → coluna (RF-D-04). */
  mapping: ColumnMapping;
  /** Placeholders detectados no template (para validar / mostrar). */
  placeholders: PlaceholderInfo[];
  /** Canvas/objects do template (snapshot do editor). */
  canvas: CanvasDef;
  objects: CanvasObject[];
  /** Filtro de linhas (RF-D-05). */
  filter: RowFilter;
  /** Quantidade por linha (RF-D-06). */
  quantity: RowQuantity;
}

/**
 * Destino da impressão escolhido na última step do wizard. Espelha a UI:
 *  - `pdf` → exporta PDF via diálogo nativo (RF-P-07).
 *  - `driver` → envio raster via driver do SO (SPEC-09).
 *  - `native` → envio raw PPLB/ZPL (SPEC-10).
 */
export type BatchDestination =
  | { kind: "pdf" }
  | { kind: "driver"; printerName: string }
  | { kind: "native"; printerName: string; language: "PPLB" | "ZPL" };
