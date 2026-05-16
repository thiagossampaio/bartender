/**
 * Validação por linha do lote (WP-13 / SPEC-07 RF-D-07).
 *
 * Para cada linha selecionada:
 *  1. Constrói o contexto de binding via `buildBindingContext(row, mapping)`.
 *  2. Para cada `barcode`/`qrcode` do template:
 *     - Substitui placeholders no `value` (`applyBinding`).
 *     - Roda o validador específico da simbologia (`validateBarcode`) — se o
 *       resultado ainda contém placeholder, geramos erro crítico
 *       "placeholder não mapeado".
 *  3. Para cada `text` com placeholder no `content`:
 *     - Substitui e checa se sobrou `{{...}}` — vira erro crítico só se a
 *       coluna correspondente estiver não-mapeada (a UI já bloqueia mapping
 *       incompleto, mas defendemos contra dataset trocado).
 *
 * Decisões:
 *  - **Crítico vs aviso**: barcode/qrcode com valor inválido bloqueia; texto
 *    com placeholder não-mapeado bloqueia; quantidade <= 0 (coluna numérica
 *    inválida) é AVISO — a linha é pulada mas o lote continua.
 *  - **Sem early-exit**: caminhamos por todas as linhas para que a UI possa
 *    listar todos os erros de uma vez (não obriga o usuário a corrigir um
 *    por vez).
 *  - **Performance**: O(rows × placeholders × objects) — para 100 SKUs com
 *    5 objetos com placeholder, ~500 validações; cada validação é ~µs. Em
 *    benchmarks locais, 10k linhas × 5 objetos rodaram em < 200 ms (V8).
 */

import {
  applyBinding,
  hasPlaceholder,
  validateBarcode,
} from "@/lib/canvas/barcode";
import { DEFAULT_SYMBOLOGY } from "@/lib/canvas/barcode";
import type {
  BarcodeObject,
  CanvasObject,
  QrcodeObject,
  TextObject,
} from "@/lib/canvas/types";
import type {
  BatchValidationSummary,
  RowValidationError,
} from "@/lib/batch/types";
import { buildBindingContext } from "@/lib/data/placeholders";
import type { ColumnMapping } from "@/lib/data/mapping";
import type { ParsedDataset } from "@/lib/data/parsers";

/**
 * Executa a validação para todas as linhas selecionadas. Recebe os índices
 * 1-based para que o relatório use a mesma numeração que o usuário vê no
 * preview da tabela.
 */
export function validateBatch(args: {
  dataset: Pick<ParsedDataset, "rows">;
  rowIndices: readonly number[];
  /** Quantidades efetivas (mesma length de `rowIndices`). */
  quantities: readonly number[];
  mapping: ColumnMapping;
  objects: readonly CanvasObject[];
}): BatchValidationSummary {
  const errors: RowValidationError[] = [];
  const criticalRows = new Set<number>();

  let warningCount = 0;
  let criticalCount = 0;

  for (let i = 0; i < args.rowIndices.length; i += 1) {
    const rowIndex = args.rowIndices[i];
    const row = args.dataset.rows[rowIndex - 1];
    const qty = args.quantities[i] ?? 0;

    if (qty <= 0) {
      warningCount += 1;
      errors.push({
        rowIndex,
        objectId: "__row__",
        objectType: "text",
        message: "Quantidade inválida ou zero — linha será ignorada.",
        critical: false,
      });
      // Linhas com quantity 0 ainda recebem validação de conteúdo abaixo;
      // assim o usuário pode corrigir tanto a quantidade quanto eventuais
      // barcodes inválidos antes de avançar.
    }

    if (!row) {
      // Defesa: rowIndices só aponta para linhas existentes em `resolveRowIndices`.
      continue;
    }

    const ctx = buildBindingContext(row, args.mapping);

    for (const obj of args.objects) {
      if (obj.type === "barcode" || obj.type === "qrcode") {
        const bc = obj as BarcodeObject | QrcodeObject;
        const rawValue = bc.value ?? bc.binding?.fallback ?? "";
        if (rawValue.length === 0 && !bc.binding?.field) {
          // Barcode vazio sem placeholder — já é problema do template; não
          // é específico do lote.
          continue;
        }
        const resolved = applyBinding(rawValue, ctx);
        if (hasPlaceholder(resolved)) {
          criticalCount += 1;
          criticalRows.add(rowIndex);
          errors.push({
            rowIndex,
            objectId: obj.id,
            objectType: obj.type,
            message: `Placeholder não preenchido: "${resolved}". Verifique o mapeamento da coluna.`,
            resolvedValue: resolved,
            critical: true,
          });
          continue;
        }
        // `qrcode` (schema legado) usa o catálogo QRCODE.
        const symbology =
          obj.type === "qrcode"
            ? "QRCODE"
            : ((bc as BarcodeObject).symbology ?? DEFAULT_SYMBOLOGY);
        const v = validateBarcode(symbology, resolved);
        if (!v.ok) {
          criticalCount += 1;
          criticalRows.add(rowIndex);
          errors.push({
            rowIndex,
            objectId: obj.id,
            objectType: obj.type,
            message: v.message ?? "Valor inválido para a simbologia.",
            resolvedValue: resolved,
            critical: true,
          });
        }
      } else if (obj.type === "text") {
        const t = obj as TextObject;
        const content = t.content ?? "";
        if (!hasPlaceholder(content) && !t.binding?.field) continue;
        const resolved = applyBinding(content, ctx);
        if (hasPlaceholder(resolved)) {
          criticalCount += 1;
          criticalRows.add(rowIndex);
          errors.push({
            rowIndex,
            objectId: obj.id,
            objectType: "text",
            message: `Placeholder não preenchido em texto: "${resolved}".`,
            resolvedValue: resolved,
            critical: true,
          });
        }
      }
    }
  }

  // Ordena por linha, depois por id de objeto — torna o relatório
  // determinístico independentemente da ordem dos objetos no canvas.
  errors.sort((a, b) => {
    if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
    return a.objectId.localeCompare(b.objectId);
  });

  return {
    criticalCount,
    warningCount,
    criticalRows,
    errors,
  };
}
