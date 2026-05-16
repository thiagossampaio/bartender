/**
 * Serviço de Templates (WP-03 / SPEC-03).
 *
 * Façade de alto nível para as operações CRUD da tabela `templates`. Encapsula
 * o SQL para que o resto do app (galeria, lixeira, editor futuro) só converse
 * com tipos de domínio, nunca com strings de SQL.
 *
 * Convenção: este módulo é o único `import` esperado para qualquer ação sobre
 * templates. Internamente delega ao façade `@/lib/db` (`dbQuery`/`dbExecute`),
 * que por sua vez usa `tauri-plugin-sql`.
 */

import { dbExecute, dbQuery } from "@/lib/db";

/**
 * Presets de etiqueta listados no PRD §5.1 / SPEC-03 §"Comportamento esperado".
 * Em mm. Mantidos aqui para o modal "Novo template" e para validação de input.
 */
export const TEMPLATE_PRESETS = [
  { id: "50x30", label: "50 × 30 mm", widthMm: 50, heightMm: 30 },
  { id: "40x25", label: "40 × 25 mm", widthMm: 40, heightMm: 25 },
  { id: "100x50", label: "100 × 50 mm", widthMm: 100, heightMm: 50 },
] as const;

/** Orientação aceita pela coluna `templates.orientation` (CHECK informal). */
export type Orientation = "portrait" | "landscape";

/**
 * Tipo de domínio devolvido pelas consultas. Reflete as colunas do schema
 * (SPEC-02 §"Schema obrigatório") mantendo nomes camelCase no frontend.
 *
 * `thumbnailPng` é deliberadamente omitido das listagens para não trafegar
 * BLOBs grandes pela ponte JS↔Rust em telas que não usam. Quando a galeria
 * precisar do thumbnail real (WP-05+), incluímos sob demanda.
 */
export interface TemplateRow {
  id: number;
  name: string;
  description: string | null;
  widthMm: number;
  heightMm: number;
  dpi: number;
  orientation: Orientation;
  backgroundColor: string | null;
  /** ISO-ish — formato `YYYY-MM-DD HH:MM:SS` retornado por `datetime('now')`. */
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Preenchido quando o template está na lixeira. */
  deletedAt: string | null;
}

/** Linha como vem do plugin-sql (snake_case + tipos brutos). */
interface TemplateRowRaw {
  id: number;
  name: string;
  description: string | null;
  width_mm: number;
  height_mm: number;
  dpi: number;
  orientation: string;
  background_color: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}

function mapRow(r: TemplateRowRaw): TemplateRow {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    widthMm: r.width_mm,
    heightMm: r.height_mm,
    dpi: r.dpi,
    orientation: r.orientation === "landscape" ? "landscape" : "portrait",
    backgroundColor: r.background_color,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: r.version,
    deletedAt: r.deleted_at,
  };
}

const SELECT_COLUMNS =
  "id, name, description, width_mm, height_mm, dpi, orientation, " +
  "background_color, created_at, updated_at, version, deleted_at";

/** Input mínimo para criar um template em branco a partir do modal. */
export interface CreateTemplateInput {
  name: string;
  widthMm: number;
  heightMm: number;
  /** Default 203 (Argox OS-214 Plus). Range válido: 100–600. */
  dpi?: number;
  orientation?: Orientation;
}

/**
 * Monta o `canvas_json` inicial em branco. O schema oficial está em PRD §4.3
 * e [SPEC-04](../../../specs/specs.md#spec-04--editor-de-layout-wysiwyg-canvas-konva);
 * o editor (WP-04) será o responsável por evoluir esse JSON. Aqui criamos
 * apenas o esqueleto mínimo (canvas + objects vazio) válido para o serializer.
 */
function emptyCanvasJson(input: CreateTemplateInput): string {
  return JSON.stringify({
    version: 1,
    units: "mm",
    canvas: {
      width: input.widthMm,
      height: input.heightMm,
      dpi: input.dpi ?? 203,
      background: "#FFFFFF",
    },
    objects: [],
  });
}

/**
 * Lista templates **ativos** (não deletados), ordenados por `updated_at` desc
 * conforme SPEC-03 §"Comportamento esperado" item 1.
 */
export async function templatesList(): Promise<TemplateRow[]> {
  const rows = await dbQuery<TemplateRowRaw>(
    `SELECT ${SELECT_COLUMNS} FROM templates
     WHERE deleted_at IS NULL
     ORDER BY updated_at DESC, id DESC`,
  );
  return rows.map(mapRow);
}

/**
 * Lista templates **na lixeira** (deletados), ordenados pelo `deleted_at` mais
 * recente. Usado pela página `Trash`.
 */
export async function templatesListTrashed(): Promise<TemplateRow[]> {
  const rows = await dbQuery<TemplateRowRaw>(
    `SELECT ${SELECT_COLUMNS} FROM templates
     WHERE deleted_at IS NOT NULL
     ORDER BY deleted_at DESC, id DESC`,
  );
  return rows.map(mapRow);
}

/**
 * Busca substring case-insensitive (RF-T-06 + R09). Strings vazias retornam a
 * listagem completa para evitar surpresa na UX.
 */
export async function templatesSearch(query: string): Promise<TemplateRow[]> {
  const term = query.trim();
  if (term.length === 0) {
    return templatesList();
  }
  const rows = await dbQuery<TemplateRowRaw>(
    `SELECT ${SELECT_COLUMNS} FROM templates
     WHERE deleted_at IS NULL
       AND LOWER(name) LIKE LOWER($1)
     ORDER BY updated_at DESC, id DESC`,
    [`%${term}%`],
  );
  return rows.map(mapRow);
}

/**
 * Lê uma linha por id (qualquer estado, deletado ou ativo). Retorna `null`
 * quando não encontra — usado para handshakes do editor e da lixeira.
 */
export async function templatesGet(id: number): Promise<TemplateRow | null> {
  const rows = await dbQuery<TemplateRowRaw>(
    `SELECT ${SELECT_COLUMNS} FROM templates WHERE id = $1`,
    [id],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

/**
 * Lê apenas o `canvas_json` de um template — coluna grande que não trafegamos
 * nas listagens. Devolve `null` quando o template não existe ou tem JSON vazio.
 * Usado pelo editor (WP-04) ao abrir um template.
 */
export async function templatesGetCanvasJson(id: number): Promise<string | null> {
  const rows = await dbQuery<{ canvas_json: string | null }>(
    "SELECT canvas_json FROM templates WHERE id = $1",
    [id],
  );
  return rows.length > 0 ? rows[0].canvas_json : null;
}

/**
 * Persiste o `canvas_json` editado. Atualiza `updated_at` e incrementa `version`
 * para que a galeria reordene e que [WP-16](../../../specs/work-plan.md#wp-16--confiabilidade-autosave-recovery-logs-lixeira)
 * possa comparar autosave vs. último save commitado.
 *
 * `thumbnailPng` é opcional aqui — a geração de thumbnail entra em [WP-05](../../../specs/work-plan.md#wp-05--editor-undoredo--atalhos--salvarcarregar--thumbnail).
 * Quando o WP-05 estiver pronto, esta função recebe o blob PNG no mesmo save.
 */
export async function templatesUpdateCanvas(
  id: number,
  canvasJson: string,
  thumbnailPng?: Uint8Array,
): Promise<TemplateRow> {
  if (thumbnailPng !== undefined) {
    await dbExecute(
      `UPDATE templates
          SET canvas_json = $1,
              thumbnail_png = $2,
              updated_at = datetime('now'),
              version = version + 1
        WHERE id = $3`,
      [canvasJson, Array.from(thumbnailPng), id],
    );
  } else {
    await dbExecute(
      `UPDATE templates
          SET canvas_json = $1,
              updated_at = datetime('now'),
              version = version + 1
        WHERE id = $2`,
      [canvasJson, id],
    );
  }
  const row = await templatesGet(id);
  if (!row) {
    throw new Error(`Template id=${id} não encontrado após salvar.`);
  }
  return row;
}

/**
 * Cria um novo template em branco a partir dos dados do modal "Novo template"
 * (SPEC-03 §"Comportamento esperado" item 2). Retorna o template já materializado.
 */
export async function templatesCreate(
  input: CreateTemplateInput,
): Promise<TemplateRow> {
  const dpi = input.dpi ?? 203;
  const orientation: Orientation = input.orientation ?? "portrait";
  const canvasJson = emptyCanvasJson({ ...input, dpi, orientation });
  const result = await dbExecute(
    `INSERT INTO templates
       (name, width_mm, height_mm, dpi, orientation, canvas_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.name, input.widthMm, input.heightMm, dpi, orientation, canvasJson],
  );
  const id = result.lastInsertId;
  if (typeof id !== "number") {
    throw new Error(
      "Falha ao criar template: o backend não retornou um lastInsertId numérico.",
    );
  }
  const row = await templatesGet(id);
  if (!row) {
    throw new Error(
      `Template criado (id=${id}) mas não pôde ser lido logo após o INSERT.`,
    );
  }
  return row;
}

/**
 * "Salvar como" do editor (WP-05 / RF-E-20).
 *
 * Cria um **novo** template a partir das mesmas dimensões do original, mas com
 * o `canvas_json` em memória (estado atual, possivelmente diferente do que
 * está persistido no original) e nome custom. Usado pelo atalho
 * Ctrl/⌘+Shift+S no editor.
 *
 * O thumbnail é opcional aqui (é gerado a partir do canvas em memória pelo
 * lado do frontend antes de chamar esta função).
 *
 * @param sourceId id do template-base (para herdar dimensões/dpi/orientação).
 * @param newName nome do novo template (sanitizado pelo caller).
 * @param canvasJson `canvas_json` do estado atual em memória.
 * @param thumbnailPng PNG do thumbnail (opcional).
 */
export async function templatesSaveAs(
  sourceId: number,
  newName: string,
  canvasJson: string,
  thumbnailPng?: Uint8Array,
): Promise<TemplateRow> {
  const trimmed = newName.trim();
  if (trimmed.length === 0) {
    throw new Error("Nome do template não pode ser vazio.");
  }
  const original = await templatesGet(sourceId);
  if (!original) {
    throw new Error(`Template id=${sourceId} não encontrado para Salvar como.`);
  }
  const finalName = (await templateNameExists(trimmed))
    ? await pickDuplicateName(trimmed)
    : trimmed;
  const result =
    thumbnailPng !== undefined
      ? await dbExecute(
          `INSERT INTO templates
             (name, description, width_mm, height_mm, dpi, orientation,
              background_color, canvas_json, thumbnail_png)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            finalName,
            original.description,
            original.widthMm,
            original.heightMm,
            original.dpi,
            original.orientation,
            original.backgroundColor,
            canvasJson,
            Array.from(thumbnailPng),
          ],
        )
      : await dbExecute(
          `INSERT INTO templates
             (name, description, width_mm, height_mm, dpi, orientation,
              background_color, canvas_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            finalName,
            original.description,
            original.widthMm,
            original.heightMm,
            original.dpi,
            original.orientation,
            original.backgroundColor,
            canvasJson,
          ],
        );
  const newId = result.lastInsertId;
  if (typeof newId !== "number") {
    throw new Error("Falha em Salvar como: backend não retornou lastInsertId.");
  }
  const row = await templatesGet(newId);
  if (!row) {
    throw new Error(`Template (Salvar como) id=${newId} criado mas não relido.`);
  }
  return row;
}

/**
 * Lê o thumbnail PNG cru (BLOB) de um template. Retorna `null` quando não
 * há thumbnail ainda. Usado pela galeria a partir de [WP-05](../../../specs/work-plan.md#wp-05--editor-undoredo--atalhos--salvarcarregar--thumbnail)
 * para exibir o preview real renderizado pelo editor.
 *
 * O plugin-sql desserializa BLOB como `number[]` (array de bytes) — convertemos
 * para `Uint8Array` antes de devolver, que é a forma esperada pelos consumidores
 * (Blob → ObjectURL).
 */
export async function templatesGetThumbnail(
  id: number,
): Promise<Uint8Array | null> {
  const rows = await dbQuery<{ thumbnail_png: number[] | null }>(
    "SELECT thumbnail_png FROM templates WHERE id = $1",
    [id],
  );
  if (rows.length === 0) return null;
  const blob = rows[0].thumbnail_png;
  if (!blob || !Array.isArray(blob) || blob.length === 0) return null;
  return new Uint8Array(blob);
}

/**
 * Duplica um template existente. Copia o `canvas_json` e o `thumbnail_png`,
 * incrementa o sufixo " (cópia)" / " (cópia N)" para não colidir em UX, e
 * reseta `version=1` (a cópia é tratada como um novo template).
 *
 * Critério de aceite SPEC-03: "DADO um template 'T1' QUANDO clico Duplicar
 * ENTÃO surge 'T1 (cópia)' com mesmo canvas_json".
 */
export async function templatesDuplicate(id: number): Promise<TemplateRow> {
  const original = await templatesGet(id);
  if (!original) {
    throw new Error(`Template id=${id} não encontrado para duplicação.`);
  }
  const newName = await pickDuplicateName(original.name);
  const result = await dbExecute(
    `INSERT INTO templates
       (name, description, width_mm, height_mm, dpi, orientation,
        background_color, canvas_json, thumbnail_png)
     SELECT $1, description, width_mm, height_mm, dpi, orientation,
            background_color, canvas_json, thumbnail_png
     FROM templates WHERE id = $2`,
    [newName, id],
  );
  const newId = result.lastInsertId;
  if (typeof newId !== "number") {
    throw new Error(
      "Falha ao duplicar template: backend não retornou lastInsertId.",
    );
  }
  const row = await templatesGet(newId);
  if (!row) {
    throw new Error(`Duplicata id=${newId} criada mas não pôde ser relida.`);
  }
  return row;
}

/**
 * Escolhe um nome livre baseado em " (cópia)" / " (cópia N)" — não colide com
 * existentes (ativos OU na lixeira), para evitar surpresa quando o usuário
 * restaurar mais tarde. Comparação case-insensitive para acompanhar a busca.
 */
async function pickDuplicateName(baseName: string): Promise<string> {
  const candidate = `${baseName} (cópia)`;
  if (!(await templateNameExists(candidate))) {
    return candidate;
  }
  for (let i = 2; i < 1000; i += 1) {
    const next = `${baseName} (cópia ${i})`;
    if (!(await templateNameExists(next))) {
      return next;
    }
  }
  // Fallback ultra-improvável; mantém o app funcional.
  return `${baseName} (cópia ${Date.now()})`;
}

async function templateNameExists(name: string): Promise<boolean> {
  const rows = await dbQuery<{ c: number }>(
    "SELECT COUNT(*) AS c FROM templates WHERE LOWER(name) = LOWER($1)",
    [name],
  );
  return rows.length > 0 && rows[0].c > 0;
}

/**
 * Renomeia um template existente. Atualiza `updated_at` para a galeria
 * reordenar imediatamente após a ação.
 */
export async function templatesRename(
  id: number,
  newName: string,
): Promise<TemplateRow> {
  const trimmed = newName.trim();
  if (trimmed.length === 0) {
    throw new Error("Nome do template não pode ser vazio.");
  }
  await dbExecute(
    `UPDATE templates
        SET name = $1,
            updated_at = datetime('now')
      WHERE id = $2`,
    [trimmed, id],
  );
  const row = await templatesGet(id);
  if (!row) {
    throw new Error(`Template id=${id} não encontrado após rename.`);
  }
  return row;
}

/**
 * Soft delete: preenche `deleted_at` (SPEC-03 §"Regras de negócio" + R06).
 * Não remove o registro fisicamente. A lixeira reverte essa ação.
 */
export async function templatesSoftDelete(id: number): Promise<void> {
  await dbExecute(
    "UPDATE templates SET deleted_at = datetime('now') WHERE id = $1",
    [id],
  );
}

/**
 * Restauração da lixeira: zera `deleted_at`. Atualiza `updated_at` para que
 * o template restaurado apareça no topo da galeria.
 */
export async function templatesRestore(id: number): Promise<void> {
  await dbExecute(
    `UPDATE templates
        SET deleted_at = NULL,
            updated_at = datetime('now')
      WHERE id = $1`,
    [id],
  );
}

/**
 * Hard delete (Excluir definitivamente). Remove fisicamente do banco.
 * Exigido pelo SPEC-03; a confirmação dupla mora na UI da lixeira.
 *
 * Observação: `print_history` referencia `templates` via FOREIGN KEY. Como a
 * tabela é criada SEM `ON DELETE`, o SQLite por padrão NÃO faz cascade nem
 * impõe a referência (foreign_keys = OFF padrão no plugin atual). Mesmo
 * habilitando, a ausência de `ON DELETE` faria o DELETE falhar quando houver
 * histórico — então pré-removemos as linhas de histórico associadas para
 * manter a operação determinística.
 */
export async function templatesHardDelete(id: number): Promise<void> {
  await dbExecute("DELETE FROM print_history WHERE template_id = $1", [id]);
  await dbExecute("DELETE FROM templates WHERE id = $1", [id]);
}
