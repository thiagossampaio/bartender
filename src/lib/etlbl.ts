/**
 * Façade de Import/Export `.etlbl` (WP-14 / SPEC-11).
 *
 * Esta é a única porta de entrada para o pacote `.etlbl` no frontend.
 * Encapsula:
 *
 *  - Diálogos nativos de save/open (`@tauri-apps/plugin-dialog`).
 *  - Chamada dos comandos Rust `etlbl_export` / `etlbl_inspect`.
 *  - Inserção / substituição no banco via `@/lib/templates`.
 *  - Estratégia de conflito de nome (Substituir / Manter ambos / Cancelar).
 *
 * Por que o frontend orquestra o banco em vez do Rust?
 *  - O acesso SQLite no projeto vive em JS via `tauri-plugin-sql` (decisão
 *    WP-02/WP-03 — ver `@/lib/db`). Replicar o handle no Rust apenas para o
 *    `.etlbl` seria duplicação. O Rust faz o trabalho exclusivo dele:
 *    validação de pacote, hash, schema e sanitização de imagens.
 */

import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

import { dbExecute, dbQuery } from "@/lib/db";
import {
  type TemplateRow,
  templatesGet,
  templatesGetCanvasJson,
  templatesGetThumbnail,
} from "@/lib/templates";

/** Resolução de conflito quando o nome do template importado já existe. */
export type ImportConflictResolution = "replace" | "keep-both" | "cancel";

/** Resultado bruto do comando `etlbl_inspect`. */
interface InspectRawResult {
  name: string;
  description: string | null;
  widthMm: number;
  heightMm: number;
  dpi: number;
  orientation: string;
  backgroundColor: string | null;
  canvasJson: string;
  thumbnailPng: number[] | null;
  schema_version: number;
  origin_app_version: string;
}

/** Resultado do `inspect` em tipos do domínio (camelCase + Uint8Array). */
export interface EtlblInspect {
  name: string;
  description: string | null;
  widthMm: number;
  heightMm: number;
  dpi: number;
  orientation: "portrait" | "landscape";
  backgroundColor: string | null;
  canvasJson: string;
  thumbnailPng: Uint8Array | null;
  schemaVersion: number;
  originAppVersion: string;
}

/** Outcome do fluxo de import end-to-end. */
export type EtlblImportOutcome =
  | { kind: "cancelled" }
  | { kind: "imported"; template: TemplateRow; replaced: boolean };

/**
 * Abre o diálogo de save e exporta o template selecionado para `.etlbl`.
 *
 * Lê do banco: row do template (metadata), `canvas_json` e `thumbnail_png`
 * (opcional) — depois delega ao comando Rust `etlbl_export`.
 *
 * @returns o path final gravado, ou `null` se o usuário cancelou.
 */
export async function exportTemplate(templateId: number): Promise<string | null> {
  const row = await templatesGet(templateId);
  if (!row) {
    throw new Error(`Template id=${templateId} não encontrado para exportação.`);
  }
  const canvasJson = (await templatesGetCanvasJson(templateId)) ?? "";
  const thumbnail = await templatesGetThumbnail(templateId);

  const suggestedName = suggestEtlblFileName(row.name);
  const outputPath = await saveDialog({
    title: "Exportar template",
    defaultPath: suggestedName,
    filters: [{ name: "Etiquetador Label", extensions: ["etlbl"] }],
  });
  if (!outputPath) return null;

  const path = await invoke<string>("etlbl_export", {
    payload: {
      name: row.name,
      description: row.description,
      widthMm: row.widthMm,
      heightMm: row.heightMm,
      dpi: row.dpi,
      orientation: row.orientation,
      backgroundColor: row.backgroundColor,
      canvasJson,
      thumbnailPng: thumbnail ? Array.from(thumbnail) : null,
      outputPath,
    },
  });
  return path;
}

/**
 * Inspeciona um `.etlbl` (sem inserir no banco). Faz toda a validação de hash,
 * schema e sanitização. Retorna `null` se o usuário cancelou o diálogo de open.
 */
export async function pickAndInspectEtlbl(): Promise<EtlblInspect | null> {
  const filePath = await openDialog({
    title: "Importar template",
    multiple: false,
    filters: [{ name: "Etiquetador Label", extensions: ["etlbl"] }],
  });
  if (!filePath || typeof filePath !== "string") return null;

  const raw = await invoke<InspectRawResult>("etlbl_inspect", { filePath });
  return {
    name: raw.name,
    description: raw.description,
    widthMm: raw.widthMm,
    heightMm: raw.heightMm,
    dpi: raw.dpi,
    orientation: raw.orientation === "landscape" ? "landscape" : "portrait",
    backgroundColor: raw.backgroundColor,
    canvasJson: raw.canvasJson,
    thumbnailPng:
      raw.thumbnailPng && raw.thumbnailPng.length > 0
        ? new Uint8Array(raw.thumbnailPng)
        : null,
    schemaVersion: raw.schema_version,
    originAppVersion: raw.origin_app_version,
  };
}

/**
 * Verifica se já existe template ativo (não-deletado) com este nome.
 *
 * O conflito só considera ativos: itens na lixeira não bloqueiam o import
 * (o usuário pode importar e mais tarde restaurar manualmente; ambos
 * convivem com nomes distintos por causa do sufixo "(N)" gerado pela
 * lixeira na restauração — fora do escopo deste WP).
 */
export async function findActiveByName(name: string): Promise<TemplateRow | null> {
  const rows = await dbQuery<{ id: number }>(
    "SELECT id FROM templates WHERE deleted_at IS NULL AND LOWER(name) = LOWER($1) LIMIT 1",
    [name],
  );
  if (rows.length === 0) return null;
  return templatesGet(rows[0].id);
}

/**
 * Insere o template inspecionado no banco aplicando a resolução de conflito
 * escolhida pelo usuário.
 *
 *  - `replace`: encontra o template ativo de mesmo nome e **atualiza**
 *    in-place todas as colunas + `canvas_json` + `thumbnail_png`, mantendo
 *    o `id` (preserva histórico de impressões que referencia este id).
 *  - `keep-both`: gera um nome livre (sufixo " (N)") e **insere** novo.
 *  - `cancel`: no-op.
 *
 *  Quando `existing` for `null` (sem conflito), insere normalmente.
 */
export async function commitImport(
  inspect: EtlblInspect,
  resolution: ImportConflictResolution,
  existing: TemplateRow | null,
): Promise<EtlblImportOutcome> {
  if (resolution === "cancel") return { kind: "cancelled" };

  const thumbBytes = inspect.thumbnailPng
    ? Array.from(inspect.thumbnailPng)
    : null;

  if (existing && resolution === "replace") {
    if (thumbBytes !== null) {
      await dbExecute(
        `UPDATE templates
            SET name = $1,
                description = $2,
                width_mm = $3,
                height_mm = $4,
                dpi = $5,
                orientation = $6,
                background_color = $7,
                canvas_json = $8,
                thumbnail_png = $9,
                updated_at = datetime('now'),
                version = version + 1
          WHERE id = $10`,
        [
          inspect.name,
          inspect.description,
          inspect.widthMm,
          inspect.heightMm,
          inspect.dpi,
          inspect.orientation,
          inspect.backgroundColor,
          inspect.canvasJson,
          thumbBytes,
          existing.id,
        ],
      );
    } else {
      await dbExecute(
        `UPDATE templates
            SET name = $1,
                description = $2,
                width_mm = $3,
                height_mm = $4,
                dpi = $5,
                orientation = $6,
                background_color = $7,
                canvas_json = $8,
                thumbnail_png = NULL,
                updated_at = datetime('now'),
                version = version + 1
          WHERE id = $9`,
        [
          inspect.name,
          inspect.description,
          inspect.widthMm,
          inspect.heightMm,
          inspect.dpi,
          inspect.orientation,
          inspect.backgroundColor,
          inspect.canvasJson,
          existing.id,
        ],
      );
    }
    const updated = await templatesGet(existing.id);
    if (!updated) {
      throw new Error("Template substituído não pôde ser relido.");
    }
    return { kind: "imported", template: updated, replaced: true };
  }

  // keep-both ou sem conflito: insert novo. Quando keep-both, achamos um
  // nome livre via sufixo " (N)" — o algoritmo cobre colisões em série.
  const finalName =
    existing && resolution === "keep-both"
      ? await pickFreeName(inspect.name)
      : inspect.name;

  const result = thumbBytes !== null
    ? await dbExecute(
        `INSERT INTO templates
           (name, description, width_mm, height_mm, dpi, orientation,
            background_color, canvas_json, thumbnail_png)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          finalName,
          inspect.description,
          inspect.widthMm,
          inspect.heightMm,
          inspect.dpi,
          inspect.orientation,
          inspect.backgroundColor,
          inspect.canvasJson,
          thumbBytes,
        ],
      )
    : await dbExecute(
        `INSERT INTO templates
           (name, description, width_mm, height_mm, dpi, orientation,
            background_color, canvas_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          finalName,
          inspect.description,
          inspect.widthMm,
          inspect.heightMm,
          inspect.dpi,
          inspect.orientation,
          inspect.backgroundColor,
          inspect.canvasJson,
        ],
      );
  const id = result.lastInsertId;
  if (typeof id !== "number") {
    throw new Error("Falha ao importar template: backend não retornou lastInsertId.");
  }
  const row = await templatesGet(id);
  if (!row) {
    throw new Error(`Template importado (id=${id}) não pôde ser relido.`);
  }
  return { kind: "imported", template: row, replaced: false };
}

/**
 * Escolhe um nome livre adicionando " (N)" — começa em 2 (assumimos que o
 * "(1)" é o original que entrou em conflito). Cobre colisões em série
 * (importações sucessivas do mesmo arquivo).
 */
async function pickFreeName(baseName: string): Promise<string> {
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${baseName} (${i})`;
    const exists = await templateNameExists(candidate);
    if (!exists) return candidate;
  }
  // Fallback ultra-improvável.
  return `${baseName} (${Date.now()})`;
}

async function templateNameExists(name: string): Promise<boolean> {
  const rows = await dbQuery<{ c: number }>(
    "SELECT COUNT(*) AS c FROM templates WHERE LOWER(name) = LOWER($1)",
    [name],
  );
  return rows.length > 0 && rows[0].c > 0;
}

/**
 * Gera nome de arquivo `{{ template }}_YYYY-MM-DD_HHmm.etlbl` análogo ao do
 * PDF (RF-P-06 / `suggestPdfFileName`). Sanitiza caracteres ilegais comuns.
 */
export function suggestEtlblFileName(templateName: string, when: Date = new Date()): string {
  const diacritics = new RegExp("[\\u0300-\\u036f]", "g");
  const safe = templateName
    .normalize("NFD")
    .replace(diacritics, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .replace(/\s+/g, "_");
  const yyyy = when.getFullYear().toString().padStart(4, "0");
  const mm = (when.getMonth() + 1).toString().padStart(2, "0");
  const dd = when.getDate().toString().padStart(2, "0");
  const hh = when.getHours().toString().padStart(2, "0");
  const mi = when.getMinutes().toString().padStart(2, "0");
  return `${safe || "etiqueta"}_${yyyy}-${mm}-${dd}_${hh}${mi}.etlbl`;
}
