import * as React from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ChevronsDown,
  ChevronsUp,
  ChevronDown,
  ChevronUp,
  Circle,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  QrCode,
  Square,
  Type,
  Barcode,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { DEFAULT_FONT_FAMILY } from "@/lib/canvas/fonts";
import { generateId } from "@/lib/canvas/serializer";
import { roundMm } from "@/lib/canvas/units";
import type { CanvasObject, ObjectType } from "@/lib/canvas/types";
import { useEditorStore } from "@/lib/stores/editor-store";

/**
 * Toolbar lateral esquerda (WP-04 / SPEC-04 §"Comportamento esperado" item 2).
 *
 * - Botão "Selecionar" (ferramenta padrão; só fecha qualquer ferramenta de
 *   inserção pendente).
 * - Botões para inserir cada tipo de objeto. O clique adiciona o objeto no
 *   centro do canvas; o usuário pode ajustar via drag depois (WP-04 não
 *   implementa o drag-do-toolbar-para-o-canvas; o clique de inserção
 *   centralizado cobre o critério funcional sem inflar este WP. O drag
 *   refinado fica para [WP-05](../../../specs/work-plan.md#wp-05--editor-undoredo--atalhos--salvarcarregar--thumbnail)
 *   ou polimento em [WP-17](../../../specs/work-plan.md#wp-17--polimento-i18n-pt-br-onboarding-acessibilidade-aa-atalhos-finais-qa-hardware)).
 * - Botão "Imagem" abre file picker (PNG/JPG/SVG) — drag-and-drop também é
 *   aceito pelo `CanvasArea`.
 * - Ações de alinhar/distribuir entre múltiplos selecionados (RF-E-14 / RF-E-15).
 * - Reordenar camadas (RF-E-16).
 *
 * Os ícones vêm de `lucide-react` (já instalado desde WP-01).
 */

interface InsertSpec {
  type: ObjectType;
  label: string;
  icon: React.ReactNode;
  factory: (origin: { xMm: number; yMm: number }) => CanvasObject;
  shortcut?: string;
  /** WP em que o tipo torna-se totalmente funcional. */
  futureWp?: string;
}

const TEXT_DEFAULTS = {
  width: 30,
  height: 6,
  fontSize: 12,
  fontFamily: DEFAULT_FONT_FAMILY,
  color: "#000000",
};

const RECT_DEFAULTS = { width: 20, height: 10 };
const LINE_DEFAULTS = { width: 20, height: 0.4 };
const ELLIPSE_DEFAULTS = { width: 16, height: 12 };
const BARCODE_DEFAULTS = { width: 30, height: 12, symbology: "CODE128" };
const QRCODE_DEFAULTS = { width: 15, height: 15 };
const IMAGE_DEFAULTS = { width: 25, height: 25 };

const INSERTS: InsertSpec[] = [
  {
    type: "text",
    label: "Texto",
    icon: <Type className="h-4 w-4" aria-hidden="true" />,
    factory: ({ xMm, yMm }) => ({
      id: generateId("text"),
      type: "text",
      x: roundMm(xMm - TEXT_DEFAULTS.width / 2),
      y: roundMm(yMm - TEXT_DEFAULTS.height / 2),
      width: TEXT_DEFAULTS.width,
      height: TEXT_DEFAULTS.height,
      rotation: 0,
      content: "Texto",
      fontFamily: TEXT_DEFAULTS.fontFamily,
      fontSize: TEXT_DEFAULTS.fontSize,
      fontWeight: "normal",
      fontStyle: "normal",
      textAlign: "left",
      color: TEXT_DEFAULTS.color,
    }),
  },
  {
    type: "rectangle",
    label: "Retângulo",
    icon: <Square className="h-4 w-4" aria-hidden="true" />,
    factory: ({ xMm, yMm }) => ({
      id: generateId("rectangle"),
      type: "rectangle",
      x: roundMm(xMm - RECT_DEFAULTS.width / 2),
      y: roundMm(yMm - RECT_DEFAULTS.height / 2),
      width: RECT_DEFAULTS.width,
      height: RECT_DEFAULTS.height,
      rotation: 0,
      stroke: "#000000",
      strokeWidth: 0.3,
      fill: "transparent",
      cornerRadius: 0,
    }),
  },
  {
    type: "line",
    label: "Linha",
    icon: <Minus className="h-4 w-4" aria-hidden="true" />,
    factory: ({ xMm, yMm }) => ({
      id: generateId("line"),
      type: "line",
      x: roundMm(xMm - LINE_DEFAULTS.width / 2),
      y: roundMm(yMm),
      width: LINE_DEFAULTS.width,
      height: LINE_DEFAULTS.height,
      rotation: 0,
      stroke: "#000000",
      strokeWidth: 0.4,
    }),
  },
  {
    type: "ellipse",
    label: "Elipse",
    icon: <Circle className="h-4 w-4" aria-hidden="true" />,
    factory: ({ xMm, yMm }) => ({
      id: generateId("ellipse"),
      type: "ellipse",
      x: roundMm(xMm - ELLIPSE_DEFAULTS.width / 2),
      y: roundMm(yMm - ELLIPSE_DEFAULTS.height / 2),
      width: ELLIPSE_DEFAULTS.width,
      height: ELLIPSE_DEFAULTS.height,
      rotation: 0,
      stroke: "#000000",
      strokeWidth: 0.3,
      fill: "transparent",
    }),
  },
  {
    type: "image",
    label: "Imagem",
    icon: <ImageIcon className="h-4 w-4" aria-hidden="true" />,
    factory: ({ xMm, yMm }) => ({
      id: generateId("image"),
      type: "image",
      x: roundMm(xMm - IMAGE_DEFAULTS.width / 2),
      y: roundMm(yMm - IMAGE_DEFAULTS.height / 2),
      width: IMAGE_DEFAULTS.width,
      height: IMAGE_DEFAULTS.height,
      rotation: 0,
      src: "",
    }),
  },
  {
    type: "barcode",
    label: "Código de barras",
    icon: <Barcode className="h-4 w-4" aria-hidden="true" />,
    factory: ({ xMm, yMm }) => ({
      id: generateId("barcode"),
      type: "barcode",
      x: roundMm(xMm - BARCODE_DEFAULTS.width / 2),
      y: roundMm(yMm - BARCODE_DEFAULTS.height / 2),
      width: BARCODE_DEFAULTS.width,
      height: BARCODE_DEFAULTS.height,
      rotation: 0,
      // Default CODE128 com payload genérico — RF-B-01 e cobertura padrão de
      // EAN-13 também usa "123456789012" (12 dígitos; o 13º vira check digit
      // se o usuário trocar a simbologia).
      symbology: "CODE128",
      value: "123456789012",
      showText: true,
      moduleWidth: 0.33,
    }),
  },
  {
    type: "qrcode",
    label: "QR Code",
    icon: <QrCode className="h-4 w-4" aria-hidden="true" />,
    factory: ({ xMm, yMm }) => ({
      id: generateId("qrcode"),
      type: "qrcode",
      x: roundMm(xMm - QRCODE_DEFAULTS.width / 2),
      y: roundMm(yMm - QRCODE_DEFAULTS.height / 2),
      width: QRCODE_DEFAULTS.width,
      height: QRCODE_DEFAULTS.height,
      rotation: 0,
      // Texto neutro como valor inicial — evita URLs http(s) hard-coded
      // (auditoria offline-first do bundle).
      value: "ETIQUETADOR",
      errorCorrection: "M",
    }),
  },
];

export function Toolbar() {
  const canvas = useEditorStore((s) => s.canvas);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const addObject = useEditorStore((s) => s.addObject);
  const alignSelected = useEditorStore((s) => s.alignSelected);
  const distributeSelected = useEditorStore((s) => s.distributeSelected);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const bringToFront = useEditorStore((s) => s.bringToFront);
  const sendToBack = useEditorStore((s) => s.sendToBack);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  function insert(spec: InsertSpec) {
    if (spec.type === "image") {
      fileInputRef.current?.click();
      return;
    }
    const center = { xMm: canvas.width / 2, yMm: canvas.height / 2 };
    const obj = spec.factory(center);
    addObject(obj);
  }

  async function handleImageFile(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const center = { xMm: canvas.width / 2, yMm: canvas.height / 2 };
    addObject({
      id: generateId("image"),
      type: "image",
      x: roundMm(center.xMm - IMAGE_DEFAULTS.width / 2),
      y: roundMm(center.yMm - IMAGE_DEFAULTS.height / 2),
      width: IMAGE_DEFAULTS.width,
      height: IMAGE_DEFAULTS.height,
      rotation: 0,
      src: dataUrl,
    });
  }

  const multi = selectedIds.length >= 2;
  const three = selectedIds.length >= 3;
  const hasSelection = selectedIds.length >= 1;

  return (
    <aside
      className="flex w-44 shrink-0 flex-col gap-3 border-r bg-card p-3"
      aria-label="Ferramentas do editor"
    >
      <section>
        <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Ferramenta
        </p>
        <ToolButton
          onClick={() => clearSelection()}
          icon={<MousePointer2 className="h-4 w-4" aria-hidden="true" />}
          label="Selecionar"
        />
      </section>

      <section>
        <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Inserir
        </p>
        <div className="flex flex-col gap-1">
          {INSERTS.map((spec) => (
            <ToolButton
              key={spec.type}
              onClick={() => insert(spec)}
              icon={spec.icon}
              label={spec.label}
              title={spec.futureWp ? `Render completo em ${spec.futureWp}` : undefined}
              hint={spec.futureWp}
            />
          ))}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImageFile(file);
            e.target.value = "";
          }}
        />
      </section>

      <section>
        <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Alinhar
        </p>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="Alinhar selecionados">
          <IconButton
            disabled={!multi}
            onClick={() => alignSelected("left")}
            icon={<AlignStartVertical className="h-4 w-4" aria-hidden="true" />}
            title="Alinhar à esquerda"
          />
          <IconButton
            disabled={!multi}
            onClick={() => alignSelected("center-horizontal")}
            icon={<AlignCenterVertical className="h-4 w-4" aria-hidden="true" />}
            title="Centralizar horizontalmente"
          />
          <IconButton
            disabled={!multi}
            onClick={() => alignSelected("right")}
            icon={<AlignEndVertical className="h-4 w-4" aria-hidden="true" />}
            title="Alinhar à direita"
          />
          <IconButton
            disabled={!multi}
            onClick={() => alignSelected("top")}
            icon={<AlignStartHorizontal className="h-4 w-4" aria-hidden="true" />}
            title="Alinhar ao topo"
          />
          <IconButton
            disabled={!multi}
            onClick={() => alignSelected("middle-vertical")}
            icon={<AlignCenterHorizontal className="h-4 w-4" aria-hidden="true" />}
            title="Centralizar verticalmente"
          />
          <IconButton
            disabled={!multi}
            onClick={() => alignSelected("bottom")}
            icon={<AlignEndHorizontal className="h-4 w-4" aria-hidden="true" />}
            title="Alinhar à base"
          />
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <IconButton
            disabled={!three}
            onClick={() => distributeSelected("horizontal")}
            icon={
              <AlignHorizontalDistributeCenter className="h-4 w-4" aria-hidden="true" />
            }
            title="Distribuir horizontalmente"
          />
          <IconButton
            disabled={!three}
            onClick={() => distributeSelected("vertical")}
            icon={
              <AlignVerticalDistributeCenter className="h-4 w-4" aria-hidden="true" />
            }
            title="Distribuir verticalmente"
          />
        </div>
      </section>

      <section>
        <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Camadas
        </p>
        <div className="grid grid-cols-2 gap-1">
          <IconButton
            disabled={!hasSelection}
            onClick={() => bringToFront()}
            icon={<ChevronsUp className="h-4 w-4" aria-hidden="true" />}
            title="Trazer para frente"
          />
          <IconButton
            disabled={!hasSelection}
            onClick={() => bringForward()}
            icon={<ChevronUp className="h-4 w-4" aria-hidden="true" />}
            title="Avançar uma camada"
          />
          <IconButton
            disabled={!hasSelection}
            onClick={() => sendBackward()}
            icon={<ChevronDown className="h-4 w-4" aria-hidden="true" />}
            title="Recuar uma camada"
          />
          <IconButton
            disabled={!hasSelection}
            onClick={() => sendToBack()}
            icon={<ChevronsDown className="h-4 w-4" aria-hidden="true" />}
            title="Mandar para trás"
          />
        </div>
      </section>
    </aside>
  );
}

interface ToolButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title?: string;
  hint?: string;
}

function ToolButton({ onClick, icon, label, title, hint }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span className="rounded-sm bg-muted px-1 text-[9px] font-medium uppercase text-muted-foreground">
          {hint}
        </span>
      )}
    </button>
  );
}

interface IconButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  disabled?: boolean;
}

function IconButton({ onClick, icon, title, disabled }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "flex h-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      {icon}
    </button>
  );
}
