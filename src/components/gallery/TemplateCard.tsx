import { MoreVertical } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TemplateRow } from "@/lib/templates";

/**
 * Card de template renderizado na galeria.
 *
 * O thumbnail real é gerado a partir do WP-05 (Konva off-screen). Até lá
 * exibimos um placeholder com a proporção correta (`width_mm x height_mm`),
 * já em escala — assim o usuário tem feedback visual da forma da etiqueta.
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
  return (
    <Card className="group relative">
      <button
        type="button"
        onClick={() => onOpen(template.id)}
        className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Abrir ${template.name} no editor`}
      >
        <ThumbnailPlaceholder
          widthMm={template.widthMm}
          heightMm={template.heightMm}
          orientation={template.orientation}
        />
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
 * Placeholder de thumbnail respeitando a proporção real da etiqueta. Mantém
 * a galeria visualmente consistente até o WP-05 sobrescrever com PNG real.
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
