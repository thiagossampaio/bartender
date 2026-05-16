import * as React from "react";

import { FontPicker } from "@/components/editor/FontPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TEXT_COLOR_PALETTE } from "@/lib/canvas/color-palette";
import { roundMm } from "@/lib/canvas/units";
import type {
  BarcodeObject,
  BarcodeSymbology,
  CanvasObject,
  EllipseObject,
  ImageObject,
  LineObject,
  QrcodeObject,
  QrErrorCorrection,
  RectangleObject,
  TextObject,
} from "@/lib/canvas/types";
import { useEditorStore } from "@/lib/stores/editor-store";
import {
  DEFAULT_MODULE_WIDTH_MM,
  SYMBOLOGIES_1D,
  SYMBOLOGIES_2D,
  SYMBOLOGY_SPECS,
  validateBarcode,
} from "@/lib/canvas/barcode";

/**
 * Painel de propriedades à direita (WP-04 / SPEC-04 RF-E-13).
 *
 * - Quando nada está selecionado → mostra as propriedades do **canvas**
 *   (dimensões e cor de fundo). Cobre o critério de "ajustar tudo depois no
 *   editor" do modal "Novo template".
 * - Um objeto selecionado → mostra X, Y, W, H, rotação + propriedades
 *   específicas do tipo (texto, retângulo, linha, elipse, imagem, barcode/qr).
 * - Vários selecionados → mostra um resumo + edição em lote de rotação
 *   (suficiente para o WP-04; ferramentas avançadas tipo "match width" ficam
 *   para o polimento em WP-17).
 *
 * Os inputs são "commit on blur / Enter" — assim drags e ajustes finos no
 * canvas não disputam com a digitação do painel.
 */
export function PropertiesPanel() {
  const objects = useEditorStore((s) => s.objects);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const canvas = useEditorStore((s) => s.canvas);
  const setBackgroundColor = useEditorStore((s) => s.setBackgroundColor);
  const updateObject = useEditorStore((s) => s.updateObject);
  const updateSelectedObjects = useEditorStore((s) => s.updateSelectedObjects);

  const selected = selectedIds
    .map((id) => objects.find((o) => o.id === id))
    .filter((o): o is CanvasObject => o != null);

  return (
    <aside
      className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-card p-4"
      aria-label="Propriedades"
    >
      {selected.length === 0 && (
        <CanvasProperties canvas={canvas} onBackgroundChange={setBackgroundColor} />
      )}
      {selected.length === 1 && (
        <SingleObjectProperties
          object={selected[0]}
          onChange={(patch) => updateObject(selected[0].id, patch)}
        />
      )}
      {selected.length > 1 && (
        <MultiObjectProperties
          count={selected.length}
          onChange={(patch) => updateSelectedObjects(patch)}
        />
      )}
    </aside>
  );
}

function CanvasProperties({
  canvas,
  onBackgroundChange,
}: {
  canvas: { width: number; height: number; dpi: number; background?: string };
  onBackgroundChange: (color: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">Canvas</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Clique em um objeto para editar. As dimensões só podem ser alteradas em
        "Novo template" — usar WP-14 para mudar tamanho de template existente
        sem perder histórico.
      </p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <ReadOnlyField label="Largura (mm)" value={canvas.width.toString()} />
        <ReadOnlyField label="Altura (mm)" value={canvas.height.toString()} />
        <ReadOnlyField label="DPI" value={canvas.dpi.toString()} />
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <Label htmlFor="prop-bg">Cor de fundo</Label>
        <div className="flex items-center gap-2">
          <input
            id="prop-bg"
            type="color"
            value={canvas.background ?? "#FFFFFF"}
            onChange={(e) => onBackgroundChange(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-md border"
          />
          <Input
            value={canvas.background ?? "#FFFFFF"}
            onChange={(e) => onBackgroundChange(e.target.value)}
            className="flex-1"
          />
        </div>
      </div>
    </section>
  );
}

function SingleObjectProperties({
  object,
  onChange,
}: {
  object: CanvasObject;
  onChange: (patch: Partial<CanvasObject>) => void;
}) {
  return (
    <>
      <section>
        <h2 className="mb-2 text-sm font-semibold capitalize">
          {humanizeType(object.type)}
        </h2>
        <p className="text-[11px] text-muted-foreground">id: {object.id}</p>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Posição e tamanho
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="X (mm)"
            value={object.x}
            onCommit={(v) => onChange({ x: roundMm(v) })}
          />
          <NumberField
            label="Y (mm)"
            value={object.y}
            onCommit={(v) => onChange({ y: roundMm(v) })}
          />
          <NumberField
            label="Largura (mm)"
            value={object.width ?? 0}
            min={0.1}
            onCommit={(v) => onChange({ width: roundMm(v) })}
          />
          <NumberField
            label="Altura (mm)"
            value={object.height ?? 0}
            min={0.1}
            onCommit={(v) => onChange({ height: roundMm(v) })}
          />
          <NumberField
            label="Rotação (°)"
            value={object.rotation ?? 0}
            step={1}
            onCommit={(v) => onChange({ rotation: v })}
          />
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px]">Snap rotação</Label>
            <div className="flex flex-wrap gap-1">
              {[0, 90, 180, 270].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  className="rounded-md border px-2 py-1 text-[11px] hover:bg-accent"
                  onClick={() => onChange({ rotation: deg })}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <TypeSpecificProperties object={object} onChange={onChange} />

      <section>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Binding
        </h3>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Vinculação a campos de fonte de dados (CSV/XLSX). UI completa em WP-12.
          Use placeholders <code>{"{{ campo }}"}</code> direto no conteúdo por enquanto.
        </p>
        <Input
          placeholder="Campo (ex.: sku)"
          value={object.binding?.field ?? ""}
          onChange={(e) => {
            const field = e.target.value;
            if (field.length === 0) {
              onChange({ binding: undefined });
            } else {
              onChange({
                binding: { field, fallback: object.binding?.fallback },
              });
            }
          }}
        />
      </section>
    </>
  );
}

function TypeSpecificProperties({
  object,
  onChange,
}: {
  object: CanvasObject;
  onChange: (patch: Partial<CanvasObject>) => void;
}) {
  switch (object.type) {
    case "text":
      return <TextProperties object={object} onChange={onChange} />;
    case "rectangle":
      return <RectangleProperties object={object} onChange={onChange} />;
    case "line":
      return <LineProperties object={object} onChange={onChange} />;
    case "ellipse":
      return <EllipseProperties object={object} onChange={onChange} />;
    case "image":
      return <ImageProperties object={object} onChange={onChange} />;
    case "barcode":
      return <BarcodeProperties object={object} onChange={onChange} />;
    case "qrcode":
      return <QrcodeProperties object={object} onChange={onChange} />;
  }
}

function TextProperties({
  object,
  onChange,
}: {
  object: TextObject;
  onChange: (patch: Partial<TextObject>) => void;
}) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Texto
      </h3>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px]" htmlFor="prop-content">
            Conteúdo
          </Label>
          <textarea
            id="prop-content"
            value={object.content}
            onChange={(e) => onChange({ content: e.target.value })}
            className="min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px]" htmlFor="prop-ff">
            Fonte
          </Label>
          <FontPicker
            id="prop-ff"
            value={object.fontFamily}
            onChange={(family) => onChange({ fontFamily: family })}
          />
        </div>
        <NumberField
          label="Tamanho (pt)"
          value={object.fontSize ?? 12}
          min={4}
          max={200}
          step={0.5}
          onCommit={(v) => onChange({ fontSize: v })}
        />
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px]">Estilo</Label>
          <div className="flex gap-1">
            <ToggleChip
              active={object.fontWeight === "bold"}
              onClick={() =>
                onChange({
                  fontWeight: object.fontWeight === "bold" ? "normal" : "bold",
                })
              }
              title="Negrito"
            >
              <span className="font-bold">B</span>
            </ToggleChip>
            <ToggleChip
              active={object.fontStyle === "italic"}
              onClick={() =>
                onChange({
                  fontStyle: object.fontStyle === "italic" ? "normal" : "italic",
                })
              }
              title="Itálico"
            >
              <span className="italic">I</span>
            </ToggleChip>
            <ToggleChip
              active={object.textDecoration === "underline"}
              onClick={() =>
                onChange({
                  textDecoration:
                    object.textDecoration === "underline" ? "none" : "underline",
                })
              }
              title="Sublinhado"
            >
              <span className="underline">U</span>
            </ToggleChip>
            <ToggleChip
              active={object.textDecoration === "line-through"}
              onClick={() =>
                onChange({
                  textDecoration:
                    object.textDecoration === "line-through" ? "none" : "line-through",
                })
              }
              title="Tachado"
            >
              <span className="line-through">S</span>
            </ToggleChip>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px]">Alinhamento</Label>
          <div className="flex gap-1" role="group" aria-label="Alinhamento horizontal">
            {(["left", "center", "right", "justify"] as const).map((align) => (
              <ToggleChip
                key={align}
                active={(object.textAlign ?? "left") === align}
                onClick={() => onChange({ textAlign: align })}
                title={alignLabel(align)}
              >
                <span aria-hidden>{alignGlyph(align)}</span>
              </ToggleChip>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Espaçamento (px)"
            value={object.letterSpacing ?? 0}
            step={0.1}
            onCommit={(v) => onChange({ letterSpacing: v })}
          />
          <NumberField
            label="Altura linha"
            value={object.lineHeight ?? 1}
            min={0.5}
            max={3}
            step={0.05}
            onCommit={(v) => onChange({ lineHeight: v })}
          />
        </div>
        <ColorPaletteField
          label="Cor"
          value={object.color ?? "#000000"}
          onChange={(v) => onChange({ color: v })}
        />
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
          <div className="flex flex-col">
            <Label className="text-[11px]">Auto-shrink</Label>
            <span className="text-[10px] text-muted-foreground">
              Reduz a fonte para caber na caixa.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!object.autoShrink}
            onClick={() => onChange({ autoShrink: !object.autoShrink })}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              object.autoShrink ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform",
                object.autoShrink ? "translate-x-4" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </div>
    </section>
  );
}

function alignLabel(a: NonNullable<TextObject["textAlign"]>): string {
  switch (a) {
    case "left":
      return "Esquerda";
    case "center":
      return "Centro";
    case "right":
      return "Direita";
    case "justify":
      return "Justificado";
  }
}

function alignGlyph(a: NonNullable<TextObject["textAlign"]>): string {
  // Glyphs ASCII para evitar dependência de fonte de ícones.
  switch (a) {
    case "left":
      return "≣​";
    case "center":
      return "≡";
    case "right":
      return "​≣";
    case "justify":
      return "☰";
  }
}

function ColorPaletteField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px]">{label}</Label>
      <div className="grid grid-cols-6 gap-1">
        {TEXT_COLOR_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Aplicar cor ${c}`}
            title={c}
            className={cn(
              "h-6 w-full rounded-sm border",
              value.toLowerCase() === c.toLowerCase()
                ? "ring-2 ring-primary"
                : "border-input",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isHex(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border"
          aria-label="Cor custom"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1" />
      </div>
    </div>
  );
}

function RectangleProperties({
  object,
  onChange,
}: {
  object: RectangleObject;
  onChange: (patch: Partial<RectangleObject>) => void;
}) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Retângulo
      </h3>
      <div className="flex flex-col gap-2">
        <FillField
          value={object.fill ?? "transparent"}
          onChange={(v) => onChange({ fill: v })}
        />
        <ColorField
          label="Contorno"
          value={object.stroke ?? "#000000"}
          onChange={(v) => onChange({ stroke: v })}
        />
        <NumberField
          label="Espessura (mm)"
          value={object.strokeWidth ?? 0.3}
          min={0}
          step={0.1}
          onCommit={(v) => onChange({ strokeWidth: v })}
        />
        <NumberField
          label="Raio do canto (mm)"
          value={object.cornerRadius ?? 0}
          min={0}
          step={0.1}
          onCommit={(v) => onChange({ cornerRadius: v })}
        />
      </div>
    </section>
  );
}

function LineProperties({
  object,
  onChange,
}: {
  object: LineObject;
  onChange: (patch: Partial<LineObject>) => void;
}) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Linha
      </h3>
      <div className="flex flex-col gap-2">
        <ColorField
          label="Cor"
          value={object.stroke ?? "#000000"}
          onChange={(v) => onChange({ stroke: v })}
        />
        <NumberField
          label="Espessura (mm)"
          value={object.strokeWidth ?? 0.4}
          min={0.1}
          step={0.1}
          onCommit={(v) => onChange({ strokeWidth: v })}
        />
      </div>
    </section>
  );
}

function EllipseProperties({
  object,
  onChange,
}: {
  object: EllipseObject;
  onChange: (patch: Partial<EllipseObject>) => void;
}) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Elipse
      </h3>
      <div className="flex flex-col gap-2">
        <FillField
          value={object.fill ?? "transparent"}
          onChange={(v) => onChange({ fill: v })}
        />
        <ColorField
          label="Contorno"
          value={object.stroke ?? "#000000"}
          onChange={(v) => onChange({ stroke: v })}
        />
        <NumberField
          label="Espessura (mm)"
          value={object.strokeWidth ?? 0.3}
          min={0}
          step={0.1}
          onCommit={(v) => onChange({ strokeWidth: v })}
        />
      </div>
    </section>
  );
}

/**
 * Painel de propriedades para `barcode` 1D/2D (WP-07 / SPEC-06).
 *
 * Edita simbologia, valor, módulo, HRT, nível de correção (quando aplicável)
 * e exibe feedback de validação em tempo real (RF-B-05). Reaproveita
 * `validateBarcode()` do módulo `lib/canvas/barcode.ts`.
 */
function BarcodeProperties({
  object,
  onChange,
}: {
  object: BarcodeObject;
  onChange: (patch: Partial<BarcodeObject>) => void;
}) {
  const symbology = object.symbology ?? "CODE128";
  const spec = SYMBOLOGY_SPECS[symbology];
  const validation = validateBarcode(symbology, object.value ?? "");
  const supportsEcc = symbology === "QRCODE" || symbology === "PDF417";

  return (
    <section className="flex flex-col gap-2">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Código de barras
      </h3>

      <div className="flex flex-col gap-1.5">
        <Label className="text-[11px]" htmlFor="prop-symb">
          Simbologia
        </Label>
        <select
          id="prop-symb"
          value={symbology}
          onChange={(e) =>
            onChange({ symbology: e.target.value as BarcodeSymbology })
          }
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <optgroup label="1D">
            {SYMBOLOGIES_1D.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="2D">
            {SYMBOLOGIES_2D.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </optgroup>
        </select>
        {spec?.hint && (
          <p className="text-[10px] text-muted-foreground">{spec.hint}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-[11px]" htmlFor="prop-bc-value">
          Valor
        </Label>
        <Input
          id="prop-bc-value"
          value={object.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="Texto ou {{ campo }}"
          aria-invalid={!validation.ok || undefined}
        />
        {!validation.ok && validation.message && (
          <p
            role="alert"
            className="rounded-sm bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
          >
            {validation.message}
          </p>
        )}
        {validation.ok &&
          validation.effectiveValue !== (object.value ?? "") && (
            <p className="text-[10px] text-muted-foreground">
              Codificado: <code>{validation.effectiveValue}</code>
            </p>
          )}
      </div>

      <NumberField
        label="Módulo (mm)"
        value={object.moduleWidth ?? DEFAULT_MODULE_WIDTH_MM}
        min={0.1}
        max={2}
        step={0.05}
        onCommit={(v) => onChange({ moduleWidth: v })}
      />

      {supportsEcc && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px]">Correção</Label>
          <div className="flex gap-1" role="group" aria-label="Nível de correção">
            {(["L", "M", "Q", "H"] as const).map((lvl) => (
              <ToggleChip
                key={lvl}
                active={(object.errorCorrection ?? "M") === lvl}
                onClick={() => onChange({ errorCorrection: lvl })}
                title={qrEccLabel(lvl)}
              >
                {lvl}
              </ToggleChip>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {qrEccLabel(object.errorCorrection ?? "M")}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
        <div className="flex flex-col">
          <Label className="text-[11px]">Mostrar HRT</Label>
          <span className="text-[10px] text-muted-foreground">
            Texto legível abaixo do código (1D).
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={object.showText ?? true}
          onClick={() =>
            onChange({ showText: !(object.showText ?? true) })
          }
          disabled={spec?.kind !== "1D"}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
            (object.showText ?? true) && spec?.kind === "1D"
              ? "bg-primary"
              : "bg-muted",
            spec?.kind !== "1D" && "opacity-40",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform",
              (object.showText ?? true) && spec?.kind === "1D"
                ? "translate-x-4"
                : "translate-x-0.5",
            )}
          />
        </button>
      </div>
    </section>
  );
}

/**
 * Painel de propriedades para `qrcode` (WP-07 / SPEC-06).
 *
 * Mantemos o tipo legado `qrcode` (separado de `barcode` com simbologia
 * QRCODE) para preservar round-trip de templates existentes. As propriedades
 * relevantes são o valor e o nível de correção.
 */
function QrcodeProperties({
  object,
  onChange,
}: {
  object: QrcodeObject;
  onChange: (patch: Partial<QrcodeObject>) => void;
}) {
  const validation = validateBarcode("QRCODE", object.value ?? "");

  return (
    <section className="flex flex-col gap-2">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        QR Code
      </h3>

      <div className="flex flex-col gap-1.5">
        <Label className="text-[11px]" htmlFor="prop-qr-value">
          Valor
        </Label>
        <textarea
          id="prop-qr-value"
          value={object.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="Texto ou {{ campo }}"
          className="min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-invalid={!validation.ok || undefined}
        />
        {!validation.ok && validation.message && (
          <p
            role="alert"
            className="rounded-sm bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
          >
            {validation.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-[11px]">Correção</Label>
        <div className="flex gap-1" role="group" aria-label="Nível de correção">
          {(["L", "M", "Q", "H"] as const).map((lvl) => (
            <ToggleChip
              key={lvl}
              active={(object.errorCorrection ?? "M") === lvl}
              onClick={() => onChange({ errorCorrection: lvl })}
              title={qrEccLabel(lvl)}
            >
              {lvl}
            </ToggleChip>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {qrEccLabel(object.errorCorrection ?? "M")}
        </p>
      </div>
    </section>
  );
}

function qrEccLabel(level: QrErrorCorrection): string {
  switch (level) {
    case "L":
      return "L — ~7% de recuperação";
    case "M":
      return "M — ~15% de recuperação";
    case "Q":
      return "Q — ~25% de recuperação";
    case "H":
      return "H — ~30% de recuperação";
  }
}

function ImageProperties({
  object,
}: {
  object: ImageObject;
  onChange: (patch: Partial<ImageObject>) => void;
}) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Imagem
      </h3>
      <p className="text-[11px] text-muted-foreground">
        Para trocar a imagem, exclua o objeto e arraste o novo arquivo sobre o
        canvas (PNG, JPG ou SVG).
      </p>
      {object.src && (
        <p className="mt-2 truncate text-[10px] text-muted-foreground" title={object.src}>
          {object.src.length > 80 ? `${object.src.slice(0, 80)}…` : object.src}
        </p>
      )}
    </section>
  );
}

function MultiObjectProperties({
  count,
  onChange,
}: {
  count: number;
  onChange: (patch: Partial<CanvasObject>) => void;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{count} objetos selecionados</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Edição em lote: as alterações aplicam a todos. Use os botões de
        alinhar/distribuir do toolbar à esquerda.
      </p>
      <NumberField
        label="Rotação (°)"
        value={0}
        step={1}
        onCommit={(v) => onChange({ rotation: v })}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pequenos blocos reusáveis.
// ---------------------------------------------------------------------------

function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [local, setLocal] = React.useState<string>(formatNum(value));
  React.useEffect(() => {
    setLocal(formatNum(value));
  }, [value]);

  function commit() {
    const parsed = Number.parseFloat(local);
    if (!Number.isFinite(parsed)) {
      setLocal(formatNum(value));
      return;
    }
    let v = parsed;
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    onCommit(v);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px]">{label}</Label>
      <Input
        type="number"
        value={local}
        min={min}
        max={max}
        step={step ?? 0.1}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px]">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isHex(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1" />
      </div>
    </div>
  );
}

function FillField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const transparent = value === "transparent" || value === "" || value === "none";
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px]">Preenchimento</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={transparent || !isHex(value) ? "#000000" : value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border"
          disabled={transparent}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
        />
        <button
          type="button"
          className={cn(
            "rounded-md border px-2 py-1 text-[11px]",
            transparent && "bg-primary text-primary-foreground",
          )}
          onClick={() => onChange(transparent ? "#000000" : "transparent")}
          title="Alternar preenchimento transparente"
        >
          ⌀
        </button>
      </div>
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        "h-8 w-8 rounded-md border text-sm font-semibold",
        active ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px]">{label}</Label>
      <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

function isHex(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s);
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, "");
}

function humanizeType(t: string): string {
  switch (t) {
    case "text":
      return "Texto";
    case "rectangle":
      return "Retângulo";
    case "line":
      return "Linha";
    case "ellipse":
      return "Elipse";
    case "image":
      return "Imagem";
    case "barcode":
      return "Código de barras";
    case "qrcode":
      return "QR Code";
    default:
      return t;
  }
}
