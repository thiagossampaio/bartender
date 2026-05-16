/**
 * Resolução de filtro + quantidade do lote (WP-13 / SPEC-07 RF-D-05 + RF-D-06).
 *
 * Vivem em utilitários puros (sem React/store) para que sejam fáceis de
 * testar e reaproveitar em PDF/preview/raw sem duplicação.
 */

import type { RowFilter, RowQuantity } from "@/lib/batch/types";
import type { ParsedDataset } from "@/lib/data/parsers";

/**
 * Aplica o filtro ao dataset e devolve a lista de índices 1-based de linhas
 * efetivamente selecionadas (em ordem). Índices fora do range são descartados
 * silenciosamente para não quebrar o pipeline em planilhas pequenas.
 */
export function resolveRowIndices(
  dataset: Pick<ParsedDataset, "rows">,
  filter: RowFilter,
): number[] {
  const total = dataset.rows.length;
  if (total === 0) return [];

  if (filter.kind === "all") {
    const out = new Array<number>(total);
    for (let i = 0; i < total; i += 1) out[i] = i + 1;
    return out;
  }
  if (filter.kind === "range") {
    const from = Math.max(1, Math.floor(filter.from));
    const to = Math.min(total, Math.floor(filter.to));
    if (from > to) return [];
    const out: number[] = [];
    for (let i = from; i <= to; i += 1) out.push(i);
    return out;
  }
  // selection — preserva ordem do usuário; remove duplicatas e fora-de-range.
  const seen = new Set<number>();
  const out: number[] = [];
  for (const r of filter.rows) {
    const idx = Math.floor(r);
    if (!Number.isFinite(idx) || idx < 1 || idx > total) continue;
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(idx);
  }
  return out;
}

/**
 * Resolve a quantidade efetiva para cada linha selecionada.
 *
 * Para `kind = "column"`, lemos o valor da célula e tentamos converter:
 *  - inteiro positivo (>=1) → usa o valor.
 *  - vazio, não numérico, zero ou negativo → 0 (linha será pulada e listada
 *    como aviso na step de validação).
 *
 * Devolve um array com mesmo length de `rowIndices`, cada entrada `>= 0`.
 */
export function resolveQuantities(
  dataset: Pick<ParsedDataset, "rows">,
  rowIndices: readonly number[],
  quantity: RowQuantity,
): number[] {
  if (rowIndices.length === 0) return [];

  if (quantity.kind === "fixed") {
    const v = Math.floor(quantity.value);
    const safe = Number.isFinite(v) && v >= 1 ? Math.min(v, 9999) : 0;
    return rowIndices.map(() => safe);
  }
  const col = quantity.column;
  return rowIndices.map((idx) => {
    const row = dataset.rows[idx - 1];
    if (!row) return 0;
    const raw = row[col];
    if (raw === undefined || raw === null || String(raw).trim().length === 0) {
      return 0;
    }
    // Aceita "3", "3.0" → 3; rejeita "3.5", "abc".
    const trimmed = String(raw).trim();
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return 0;
    if (num < 1) return 0;
    const intVal = Math.trunc(num);
    // Se a string original não é inteiro (ex.: "3.5"), descarta.
    if (Math.abs(num - intVal) > 1e-9) return 0;
    return Math.min(intVal, 9999);
  });
}

/**
 * Soma simples — útil para o badge "X etiquetas serão impressas".
 */
export function totalLabels(quantities: readonly number[]): number {
  let n = 0;
  for (const q of quantities) n += q;
  return n;
}
