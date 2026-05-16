/**
 * Extração de placeholders `{{ campo }}` (WP-12 / SPEC-07).
 *
 * O wizard de importação CSV/XLSX (WP-12 e WP-13) precisa saber quais
 * placeholders existem no `canvas_json` do template para oferecer, na UI de
 * mapeamento, a lista de "campos a preencher" × colunas da planilha
 * (RF-D-04). Centralizamos essa varredura aqui para evitar duplicação entre
 * o `DataImportDialog`, o futuro `BatchPrintWizard` (WP-13) e qualquer
 * preview com binding.
 *
 * Decisões:
 *  - **Mesma regex** do `applyBinding` em `lib/canvas/barcode.ts` para garantir
 *    que toda string varrida aqui também é substituível depois — qualquer
 *    divergência geraria placeholders "fantasmas" no mapeamento.
 *  - Origem dos placeholders, em ordem de prioridade:
 *      1. `binding.field` declarado explicitamente (cobre todos os tipos
 *         que aceitam binding: text, barcode, qrcode).
 *      2. Placeholders inline no `content` (text) ou `value` (barcode/qrcode).
 *  - Resultado deduplicado e ordenado alfabeticamente — estabilidade visual
 *    é importante porque o mapeamento aparece em lista e o usuário precisa
 *    encontrar o mesmo placeholder na mesma posição entre aberturas.
 *  - Cada entrada inclui `usages` (quais objetos referenciam o campo); a
 *    UI usa isso para mostrar a contagem ("usado em 3 objetos").
 */

import type {
  BarcodeObject,
  CanvasObject,
  QrcodeObject,
  TextObject,
} from "@/lib/canvas/types";

/** Regex igual à de `barcode.ts` (`PLACEHOLDER_RE`). Mantida local — re-criada
 *  por execução para evitar estado de `lastIndex` global. */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export interface PlaceholderUsage {
  /** id do objeto que referencia o placeholder. */
  objectId: string;
  /** Tipo do objeto (texto/barcode/qrcode). */
  objectType: "text" | "barcode" | "qrcode";
  /** Origem do placeholder dentro do objeto. */
  source: "binding" | "content" | "value";
}

export interface PlaceholderInfo {
  /** Nome do campo (sem chaves, sem espaços). */
  field: string;
  /** Locais onde aparece, para feedback visual. */
  usages: PlaceholderUsage[];
}

/** True se a string contém ao menos um placeholder. */
export function hasPlaceholder(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  return re.test(raw);
}

/** Devolve a lista de nomes de campos presentes na string (deduplicada,
 *  preservando ordem de aparição). */
export function extractPlaceholderNames(
  raw: string | null | undefined,
): string[] {
  if (!raw) return [];
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  const found: string[] = [];
  const seen = new Set<string>();
  for (const m of raw.matchAll(re)) {
    const name = m[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    found.push(name);
  }
  return found;
}

/**
 * Varre os objetos do canvas e extrai todos os placeholders únicos,
 * registrando em quais objetos cada um aparece. Útil para alimentar a UI
 * de mapeamento (RF-D-04) e para o preview que destaca placeholders não
 * mapeados.
 */
export function extractPlaceholders(
  objects: readonly CanvasObject[],
): PlaceholderInfo[] {
  const byField = new Map<string, PlaceholderUsage[]>();

  function record(field: string, usage: PlaceholderUsage) {
    if (!field) return;
    const list = byField.get(field);
    if (list) {
      list.push(usage);
    } else {
      byField.set(field, [usage]);
    }
  }

  for (const obj of objects) {
    if (obj.type === "text") {
      const t = obj as TextObject;
      if (t.binding?.field) {
        record(t.binding.field, {
          objectId: t.id,
          objectType: "text",
          source: "binding",
        });
      }
      for (const name of extractPlaceholderNames(t.content)) {
        record(name, {
          objectId: t.id,
          objectType: "text",
          source: "content",
        });
      }
    } else if (obj.type === "barcode") {
      const b = obj as BarcodeObject;
      if (b.binding?.field) {
        record(b.binding.field, {
          objectId: b.id,
          objectType: "barcode",
          source: "binding",
        });
      }
      for (const name of extractPlaceholderNames(b.value)) {
        record(name, {
          objectId: b.id,
          objectType: "barcode",
          source: "value",
        });
      }
    } else if (obj.type === "qrcode") {
      const q = obj as QrcodeObject;
      if (q.binding?.field) {
        record(q.binding.field, {
          objectId: q.id,
          objectType: "qrcode",
          source: "binding",
        });
      }
      for (const name of extractPlaceholderNames(q.value)) {
        record(name, {
          objectId: q.id,
          objectType: "qrcode",
          source: "value",
        });
      }
    }
  }

  const result: PlaceholderInfo[] = [];
  for (const [field, usages] of byField.entries()) {
    result.push({ field, usages });
  }
  // Ordem alfabética case-insensitive para a UI permanecer estável entre
  // aberturas do template.
  result.sort((a, b) =>
    a.field.localeCompare(b.field, undefined, { sensitivity: "base" }),
  );
  return result;
}

/**
 * Constrói o contexto de binding (mapa `{ campo: valor }`) a partir de uma
 * linha de planilha e do `ColumnMapping`. Valores ausentes (coluna não
 * mapeada ou linha sem o dado) ficam `undefined` — o `applyBinding` então
 * preserva o `{{ placeholder }}` literal, que o validador trata como erro.
 */
export function buildBindingContext(
  row: Record<string, string>,
  mapping: Record<string, string | null>,
): Record<string, string> {
  const ctx: Record<string, string> = {};
  for (const [field, column] of Object.entries(mapping)) {
    if (!column) continue;
    const v = row[column];
    if (v !== undefined && v !== null) {
      ctx[field] = v;
    }
  }
  return ctx;
}
