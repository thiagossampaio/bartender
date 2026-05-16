/**
 * Parser de seleção manual "1, 3, 5-9" → `[1, 3, 5, 6, 7, 8, 9]`
 * (WP-13 / SPEC-07 RF-D-05 modo "seleção").
 *
 * Mantido em módulo separado da UI para satisfazer
 * `react-refresh/only-export-components` (apenas componentes podem ser
 * exportados de arquivos `.tsx` que participam do HMR).
 */

export interface SelectionParseResult {
  rows: number[];
  error: string | null;
}

export function parseSelectionText(
  text: string,
  totalRows: number,
): SelectionParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { rows: [], error: null };
  }
  const parts = trimmed.split(/[,;\s]+/).filter((p) => p.length > 0);
  const seen = new Set<number>();
  const rows: number[] = [];
  for (const part of parts) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) {
      return {
        rows: [],
        error: `Trecho inválido: "${part}". Use números separados por vírgula e faixas com hífen (ex.: 1, 3, 5-9).`,
      };
    }
    const from = Number.parseInt(m[1], 10);
    const to = m[2] ? Number.parseInt(m[2], 10) : from;
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return {
        rows: [],
        error: `Número inválido em "${part}".`,
      };
    }
    if (from < 1 || to < 1) {
      return {
        rows: [],
        error: `Linhas começam em 1 (recebido "${part}").`,
      };
    }
    if (from > totalRows || to > totalRows) {
      return {
        rows: [],
        error: `Linha fora do intervalo (planilha tem ${totalRows} linha${totalRows === 1 ? "" : "s"}).`,
      };
    }
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let i = lo; i <= hi; i += 1) {
      if (!seen.has(i)) {
        seen.add(i);
        rows.push(i);
      }
    }
  }
  return { rows, error: null };
}
