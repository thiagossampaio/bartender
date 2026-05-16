/**
 * Parsers de fontes de dados — CSV e XLSX (WP-12 / SPEC-07).
 *
 * Pipeline (RF-D-01 a RF-D-03):
 *   1. Usuário escolhe um arquivo via diálogo nativo.
 *   2. Leitura via `@tauri-apps/plugin-fs` (texto p/ CSV, binário p/ XLSX).
 *   3. Parse local — sem ida ao backend Rust:
 *        - CSV: `papaparse` com auto-detecção de separador (`,` ou `;`).
 *        - XLSX: `xlsx` (SheetJS) lendo a **1ª planilha** com a 1ª linha
 *          como cabeçalho.
 *   4. Normalização para `{ headers: string[], rows: Record<string,string>[] }`.
 *
 * Decisões:
 *  - **Tudo no frontend**: arquivos típicos de etiquetas têm centenas-poucos
 *    milhares de linhas (PRD §6.1: 500 etiquetas em ≤ 10 s); parse JS é
 *    suficiente. Caso o WP-13 mostre gargalo, abrimos um comando Rust.
 *  - **Auto-detecção de separador**: contamos `,` e `;` na 1ª linha
 *    "razoável" do arquivo (até 8 KB ou primeira quebra de linha após 16). Vence
 *    o que aparecer mais. Empate ou ausência → vírgula (default do CSV oficial).
 *  - **Normalização para string**: o XLSX preserva datas como `Date`/números
 *    como `number`; convertemos para `string` (ISO p/ datas) porque o
 *    `applyBinding` interpola texto. RF-D-04 mapeia uma coluna por
 *    placeholder; preservar números crus geraria `"3.14"` vs `"3.140000001"`
 *    inesperadamente.
 *  - **Erros de parsing**: `parseCsv` e `parseXlsx` lançam `DataParseError`
 *    com mensagem PT-BR, traduzida pela UI sem precisar inspecionar.
 *  - **BOM UTF-8** removido manualmente — o papaparse não tira sozinho em
 *    todas as versões.
 */

import { invoke } from "@tauri-apps/api/core";
import Papa from "papaparse";
import * as XLSX from "xlsx";

/** Erro de parsing com mensagem PT-BR pronta para a UI. */
export class DataParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "DataParseError";
  }
}

export interface ParsedDataset {
  /** Cabeçalho na ordem original do arquivo. */
  headers: string[];
  /** Cada linha = `{ [coluna]: valor }`. Sempre string. */
  rows: Record<string, string>[];
  /** Origem ("csv" | "xlsx") — útil para logs e badges na UI. */
  source: "csv" | "xlsx";
  /**
   * Separador detectado quando `source === "csv"`. Útil só para feedback
   * informativo na UI.
   */
  csvDelimiter?: string;
  /** Nome do arquivo (sem path) — para o badge na UI. */
  fileName?: string;
}

const BOM = "﻿";

/** Conta ocorrências de `ch` em `s` (mais barato que split p/ strings grandes). */
function countChar(s: string, ch: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s.charAt(i) === ch) n += 1;
  }
  return n;
}

/**
 * Detecta separador CSV. RF-D-01 lista apenas `,` e `;`; outras conventions
 * (tab/pipe) ficam para um polimento futuro.
 *
 * Heurística: usa a primeira linha (que deve ser o cabeçalho); empate vai
 * para `,`. Se o conteúdo é vazio ou só com whitespace, devolve `,` —
 * `papaparse` então retorna 0 linhas e a UI mostra "arquivo vazio".
 */
export function detectCsvDelimiter(text: string): "," | ";" {
  const sample = text.slice(0, 8192);
  const newline = sample.indexOf("\n");
  const firstLine =
    newline >= 0 ? sample.slice(0, newline) : sample;
  const commas = countChar(firstLine, ",");
  const semis = countChar(firstLine, ";");
  return semis > commas ? ";" : ",";
}

/** Garante cabeçalho não vazio e sem duplicatas (resolvendo silenciosamente). */
function normalizeHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  const out: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const original = (raw[i] ?? "").toString().trim();
    const base = original.length > 0 ? original : `coluna_${i + 1}`;
    let candidate = base;
    let n = 1;
    while (seen.has(candidate)) {
      n += 1;
      candidate = `${base}_${n}`;
    }
    seen.set(candidate, 1);
    out.push(candidate);
  }
  return out;
}

/** Converte qualquer célula XLSX para string. Datas viram ISO (YYYY-MM-DD). */
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") {
    return Number.isFinite(v) ? String(v) : "";
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return v.toISOString();
  }
  return String(v);
}

/**
 * Parse CSV puro a partir do texto já lido. Exposto separadamente para
 * facilitar testes — `parseDataFile` é o caminho do usuário.
 */
export function parseCsvText(text: string, fileName?: string): ParsedDataset {
  let body = text;
  if (body.startsWith(BOM)) body = body.slice(BOM.length);
  if (body.trim().length === 0) {
    throw new DataParseError("Arquivo CSV vazio.");
  }
  const delimiter = detectCsvDelimiter(body);

  const parsed = Papa.parse<Record<string, string>>(body, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    transformHeader: (h) => (h ?? "").trim(),
    // `dynamicTyping: false` (default) — preservamos string para todos os
    // valores; assim o usuário vê exatamente o que está na planilha.
  });

  if (parsed.errors && parsed.errors.length > 0) {
    // Reportamos o primeiro erro relevante (papaparse pode acumular vários).
    const first = parsed.errors[0];
    const where = typeof first.row === "number" ? `linha ${first.row + 2}` : "início";
    throw new DataParseError(
      `Erro ao ler CSV (${where}): ${first.message}.`,
      parsed.errors,
    );
  }

  const rawHeaders =
    (parsed.meta.fields && [...parsed.meta.fields]) ?? [];
  if (rawHeaders.length === 0) {
    throw new DataParseError(
      "Não foi possível detectar o cabeçalho do CSV. Verifique se a 1ª linha contém os nomes das colunas.",
    );
  }
  const headers = normalizeHeaders(rawHeaders);

  // Remapeia `parsed.data` para usar os headers normalizados (papaparse devolve
  // chaves com o nome original do cabeçalho).
  const rows: Record<string, string>[] = [];
  for (const r of parsed.data) {
    if (!r) continue;
    const row: Record<string, string> = {};
    for (let i = 0; i < rawHeaders.length; i += 1) {
      const original = rawHeaders[i];
      const v = (r as Record<string, unknown>)[original];
      row[headers[i]] = cellToString(v);
    }
    // Pula linhas completamente em branco.
    if (Object.values(row).some((v) => v.length > 0)) {
      rows.push(row);
    }
  }

  return { headers, rows, source: "csv", csvDelimiter: delimiter, fileName };
}

/**
 * Parse XLSX a partir de bytes binários. 1ª planilha, 1ª linha = cabeçalho
 * (RF-D-02). Datas e números preservam representação humana via `cellToString`.
 */
export function parseXlsxBytes(
  bytes: Uint8Array,
  fileName?: string,
): ParsedDataset {
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(bytes, { type: "array", cellDates: true });
  } catch (e) {
    throw new DataParseError("Arquivo XLSX inválido ou corrompido.", e);
  }

  const sheetName = book.SheetNames[0];
  if (!sheetName) {
    throw new DataParseError("Arquivo XLSX não contém planilhas.");
  }
  const sheet = book.Sheets[sheetName];
  if (!sheet) {
    throw new DataParseError(
      "Arquivo XLSX inválido: planilha de referência não encontrada.",
    );
  }

  // `header: 1` → matriz; preservamos posicionamento das colunas para
  // construir headers de forma estável (mesmo quando há células vazias).
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  if (matrix.length === 0) {
    throw new DataParseError("Planilha XLSX vazia.");
  }
  const rawHeaders = (matrix[0] ?? []).map((c) => cellToString(c));
  if (rawHeaders.length === 0 || rawHeaders.every((h) => h.length === 0)) {
    throw new DataParseError(
      "Não foi possível detectar o cabeçalho da planilha. Verifique se a 1ª linha contém os nomes das colunas.",
    );
  }
  const headers = normalizeHeaders(rawHeaders);

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const cells = matrix[r] ?? [];
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = cellToString(cells[i]);
    }
    if (Object.values(row).some((v) => v.length > 0)) {
      rows.push(row);
    }
  }

  return { headers, rows, source: "xlsx", fileName };
}

/**
 * Lê o arquivo do disco via comando Tauri `data_source_read` e parsa conforme
 * a extensão. Caminho exposto à UI.
 *
 * A leitura passa pelo backend Rust em vez de `@tauri-apps/plugin-fs` porque
 * o plugin-fs 2.x exige scope explícito por path no `capabilities/default.json`
 * — declarar scope amplo aqui enfraqueceria a defesa em profundidade do app.
 * O comando Rust valida extensão + tamanho máximo antes de ler.
 *
 * @throws DataParseError com mensagem amigável em PT-BR.
 */
export async function parseDataFile(filePath: string): Promise<ParsedDataset> {
  const lower = filePath.toLowerCase();
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

  if (
    !lower.endsWith(".csv") &&
    !lower.endsWith(".txt") &&
    !lower.endsWith(".xlsx") &&
    !lower.endsWith(".xlsm")
  ) {
    throw new DataParseError(
      "Formato de arquivo não suportado. Use CSV (.csv) ou Excel (.xlsx).",
    );
  }

  let raw: Uint8Array;
  try {
    const result = await invoke<number[] | Uint8Array>("data_source_read", {
      path: filePath,
    });
    raw = result instanceof Uint8Array ? result : Uint8Array.from(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new DataParseError(msg || "Não foi possível abrir o arquivo.", e);
  }

  try {
    if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
      const text = new TextDecoder("utf-8").decode(raw);
      return parseCsvText(text, fileName);
    }
    return parseXlsxBytes(raw, fileName);
  } catch (e) {
    if (e instanceof DataParseError) throw e;
    if (e instanceof Error) {
      throw new DataParseError(
        `Falha ao processar o arquivo: ${e.message}`,
        e,
      );
    }
    throw new DataParseError("Falha ao processar o arquivo.", e);
  }
}
