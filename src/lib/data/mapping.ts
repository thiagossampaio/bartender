/**
 * Utilitários de mapeamento placeholder → coluna (WP-12 / SPEC-07).
 *
 * O mapeamento é um simples `Record<placeholder, columnName | null>`. Mantemos
 * em um módulo dedicado para:
 *  - Centralizar o "auto-match" (mesmo nome ou nome próximo) que economiza
 *    cliques na primeira importação.
 *  - Compartilhar tipos entre `DataImportDialog` (WP-12) e
 *    `BatchPrintWizard` (WP-13), que herda o mapeamento como ponto de partida.
 *
 * Decisões:
 *  - **Auto-match case-insensitive**: o usuário rotula seu CSV livremente
 *    ("Produto", "produto", "PRODUTO") e o template usa `{{ produto }}`. Match
 *    direto economiza UX.
 *  - **Não persistimos no banco** ainda — RF-D-08 (salvar mapeamento ao
 *    template) está em Could/risco R10. WP-13 decidirá; aqui apenas mantemos
 *    o mapeamento em memória durante a sessão de importação.
 */

import type { PlaceholderInfo } from "@/lib/data/placeholders";

/** Mapeamento placeholder → coluna do dataset. `null` = ainda não mapeado. */
export type ColumnMapping = Record<string, string | null>;

/**
 * Constrói o mapeamento inicial com base nos placeholders detectados e
 * colunas disponíveis. Quando o nome do placeholder bate (case-insensitive,
 * ignorando hífens/underscores) com uma coluna, fazemos o auto-match.
 */
export function autoMatchMapping(
  placeholders: readonly PlaceholderInfo[],
  columns: readonly string[],
): ColumnMapping {
  const norm = (s: string): string => s.trim().toLowerCase().replace(/[\s_\-.]+/g, "");
  const byNorm = new Map<string, string>();
  for (const c of columns) {
    const key = norm(c);
    if (!byNorm.has(key)) byNorm.set(key, c);
  }
  const mapping: ColumnMapping = {};
  for (const p of placeholders) {
    const match = byNorm.get(norm(p.field));
    mapping[p.field] = match ?? null;
  }
  return mapping;
}

/** True quando todos os placeholders estão mapeados a uma coluna. */
export function isMappingComplete(
  mapping: ColumnMapping,
  placeholders: readonly PlaceholderInfo[],
): boolean {
  if (placeholders.length === 0) return true;
  return placeholders.every((p) => Boolean(mapping[p.field]));
}

/** Lista placeholders ainda não mapeados — usado para badge de pendências. */
export function unmappedPlaceholders(
  mapping: ColumnMapping,
  placeholders: readonly PlaceholderInfo[],
): string[] {
  return placeholders.filter((p) => !mapping[p.field]).map((p) => p.field);
}
