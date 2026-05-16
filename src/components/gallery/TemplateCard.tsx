import * as React from "react";
import { MoreVertical } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { thumbnailToObjectUrl } from "@/lib/canvas/thumbnail";
import { templatesGetThumbnail, type TemplateRow } from "@/lib/templates";

/**
 * Card de template renderizado na galeria.
 *
 * Em WP-05 ligamos a leitura do `thumbnail_png` (BLOB) do banco — quando
 * presente, exibimos a imagem real renderizada pelo editor. Caso contrário
 * (template recém-criado, sem save ainda), caímos no placeholder com a
 * proporção correta da etiqueta.
 *
 * A busca do thumbnail é assíncrona e cached por `template.updatedAt` (qualquer
 * save invalida o cache visual). O BLOB é convertido em `ObjectURL` para
 * exibição e revogado quando o card desmonta ou troca de template.
 *
 * O menu de contexto (Duplicar / Renomear / Excluir) é entregue por callbacks
 * para manter este componente puro/testável. "Exportar" é deixado como
 * placeholder visível mas inativo: a feature entra em [WP-14](../../../specs/work-plan.md#wp-14--importexport-etlbl-zip--manifest--validação-de-hashschema)
 * (`.etlbl`); SPEC-03 explicitamente delega a SPEC-11.
 */
interface TemplateCardProps {
  template: TemplateRow;
  /** Abre o template no editor (WP-04). */
  onOpen: (id: number) => void;
  onDuplicate: (id: number) => void;
  onRename: (template: TemplateRow) => void;
  onDelete: (template: TemplateRow) => void;
}

export function TemplateCard({
  template,
  onOpen,
  onDuplicate,
  onRename,
  onDelete,
}: TemplateCardProps) {
  const thumbnailUrl = useTemplateThumbnail(template.id, template.updatedAt);

  return (
    <Card className="group relative">
      <button
        type="button"
        onClick={() => onOpen(template.id)}
        className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Abrir ${template.name} no editor`}
      >
        {thumbnailUrl ? (
          <ThumbnailImage
            url={thumbnailUrl}
            widthMm={template.widthMm}
            heightMm={template.heightMm}
            orientation={template.orientation}
            alt={`Pré-visualização de ${template.name}`}
          />
        ) : (
          <ThumbnailPlaceholder
            widthMm={template.widthMm}
            heightMm={template.heightMm}
            orientation={template.orientation}
          />
        )}
      </button>
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpen(template.id)}
            className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            aria-label={`Abrir ${template.name} no editor`}
          >
            <h3
              className="truncate text-sm font-semibold leading-tight"
              title={template.name}
            >
              {template.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {formatDimensions(template)} · {template.dpi} dpi
            </p>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Ações para ${template.name}`}
              className="-mr-1 -mt-1"
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onOpen(template.id)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(template.id)}>
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRename(template)}>
                Renomear
              </DropdownMenuItem>
              <DropdownMenuItem disabled title="Disponível em WP-14">
                Exportar
              </DropdownMenuItem>
              <DropdownMenuItem destructive onClick={() => onDelete(template)}>
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pb-3 pt-0">
        <p className="text-xs text-muted-foreground">
          Atualizado em {formatTimestamp(template.updatedAt)}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Hook que carrega o `thumbnail_png` do banco (BLOB) para um ObjectURL pronto
 * para `<img>`. Re-busca quando o template foi atualizado (`updatedAt` muda).
 * Revoga o URL anterior automaticamente para não vazar memória.
 */
function useTemplateThumbnail(
  id: number,
  updatedAt: string,
): string | null {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    void (async () => {
      try {
        const bytes = await templatesGetThumbnail(id);
        if (cancelled) return;
        if (bytes) {
          createdUrl = thumbnailToObjectUrl(bytes);
          setUrl(createdUrl);
        } else {
          setUrl(null);
        }
      } catch {
        if (!cancelled) setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [id, updatedAt]);

  return url;
}

function ThumbnailImage({
  url,
  widthMm,
  heightMm,
  orientation,
  alt,
}: {
  url: string;
  widthMm: number;
  heightMm: number;
  orientation: TemplateRow["orientation"];
  alt: string;
}) {
  const w = orientation === "landscape" ? heightMm : widthMm;
  const h = orientation === "landscape" ? widthMm : heightMm;
  const aspect = w / h;
  return (
    <div
      className="flex items-center justify-center rounded-t-lg border-b bg-muted/40"
      style={{ aspectRatio: aspect.toString() }}
    >
      <img
        src={url}
        alt={alt}
        className="max-h-full max-w-full object-contain"
        draggable={false}
      />
    </div>
  );
}

/**
 * Placeholder de thumbnail respeitando a proporção real da etiqueta. Mantém
 * a galeria visualmente consistente quando o template ainda não tem PNG
 * gerado (criado mas nunca salvo no editor).
 */
function ThumbnailPlaceholder({
  widthMm,
  heightMm,
  orientation,
}: {
  widthMm: number;
  heightMm: number;
  orientation: TemplateRow["orientation"];
}) {
  // Orientação landscape inverte W/H para apresentação (mesma decisão que o
  // editor fará na WP-04 ao renderizar o canvas).
  const w = orientation === "landscape" ? heightMm : widthMm;
  const h = orientation === "landscape" ? widthMm : heightMm;
  const aspect = w / h;

  return (
    <div
      className="flex items-center justify-center rounded-t-lg border-b bg-muted/40"
      style={{ aspectRatio: aspect.toString() }}
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {widthMm}×{heightMm} mm
      </span>
    </div>
  );
}

function formatDimensions(template: TemplateRow): string {
  return `${formatMm(template.widthMm)} × ${formatMm(template.heightMm)} mm`;
}

function formatMm(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

/**
 * Formata o timestamp que vem do SQLite (`YYYY-MM-DD HH:MM:SS`) para algo
 * curto em PT-BR. Mantemos local-aware sem depender de libs externas
 * (Intl é nativo no runtime do Webview).
 */
function formatTimestamp(raw: string): string {
  // `datetime('now')` do SQLite devolve UTC ISO sem 'Z'; tratamos como UTC.
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
