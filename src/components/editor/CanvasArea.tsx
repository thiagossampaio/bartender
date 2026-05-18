import * as React from "react";
import Konva from "konva";
import { Stage, Layer, Rect, Line, Ellipse, Text, Image as KImage, Transformer, Group } from "react-konva";

import { fontFamilyWithFallback } from "@/lib/canvas/fonts";
import { generateId } from "@/lib/canvas/serializer";
import { MM_TO_PX, mmToPx, pxToMm, roundMm } from "@/lib/canvas/units";
import type {
  BarcodeObject,
  CanvasObject,
  QrcodeObject,
  TextObject,
} from "@/lib/canvas/types";
import { useEditorStore } from "@/lib/stores/editor-store";
import { RULER_SIZE_PX, Rulers } from "@/components/editor/Rulers";
import {
  fitSvgToBox,
  renderBarcodeSvg,
  svgToDataUrl,
} from "@/lib/canvas/barcode-svg";

/**
 * Área central do editor (WP-04 / SPEC-04).
 *
 * Renderiza:
 *  - Réguas em mm (top/left).
 *  - Stage Konva com 3 layers:
 *      1. Background (papel branco + grid em mm).
 *      2. Conteúdo (objetos do template).
 *      3. UI (Transformer de seleção).
 *  - Hotspot de drop para arquivos PNG/JPG/SVG → cria `image` no canvas.
 *
 * Decisões:
 *  - Tudo é desenhado em pixels (Konva), mas o **estado é em mm** — só
 *    convertemos na renderização e quando recebemos eventos (drag/transform).
 *    Isso mantém o `canvas_json` 100 % independente de tela / zoom.
 *  - Snap-to-grid acontece no commit do drag/transform via `roundMm`.
 *  - Multi-seleção (Shift+click) e clique em vazio limpam.
 *  - `clipFunc` no layer de conteúdo limita o que vaza para fora da etiqueta
 *    (zoom alto), igual ao comportamento de um software de etiquetas.
 */
export function CanvasArea() {
  const canvas = useEditorStore((s) => s.canvas);
  const objects = useEditorStore((s) => s.objects);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const zoom = useEditorStore((s) => s.zoom);
  const grid = useEditorStore((s) => s.grid);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);

  const selectOnly = useEditorStore((s) => s.selectOnly);
  const toggleSelect = useEditorStore((s) => s.toggleSelect);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const updateObject = useEditorStore((s) => s.updateObject);
  const addObject = useEditorStore((s) => s.addObject);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<Konva.Stage | null>(null);
  const transformerRef = React.useRef<Konva.Transformer | null>(null);
  const nodeRefs = React.useRef<Map<string, Konva.Node>>(new Map());

  // Mantém o transformer apontando para os nodes selecionados.
  React.useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const nodes = selectedIds
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Node => n != null);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, objects]);

  // Atalhos completos (Ctrl/⌘+Z/Y/C/X/V/D/A/S/+/−/0, Delete, setas, Esc) são
  // tratados pelo `useEditorShortcuts` (montado pela página `Editor`). Aqui
  // mantemos apenas o handler de **paste de imagem** da área de transferência,
  // que precisa ser global (Ctrl/⌘+V pelo store cola objetos do clipboard
  // interno; só interceptamos o evento `paste` quando houver arquivo de imagem).

  // Paste de imagem da área de transferência.
  React.useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          const dataUrl = await fileToDataUrl(file);
          addObject({
            id: generateId("image"),
            type: "image",
            x: roundMm(canvas.width / 2 - 12.5),
            y: roundMm(canvas.height / 2 - 12.5),
            width: 25,
            height: 25,
            rotation: 0,
            src: dataUrl,
          });
          return;
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addObject, canvas.width, canvas.height]);

  // Drop de arquivo → imagem.
  const [isDragOver, setIsDragOver] = React.useState(false);
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const dataUrl = await fileToDataUrl(file);
    // Drop coordinate em px relativo ao container do stage.
    const rect = containerRef.current?.getBoundingClientRect();
    let xMm = canvas.width / 2 - 12.5;
    let yMm = canvas.height / 2 - 12.5;
    if (rect) {
      const px = e.clientX - rect.left - RULER_SIZE_PX;
      const py = e.clientY - rect.top - RULER_SIZE_PX;
      xMm = roundMm(pxToMm(px / zoom) - 12.5);
      yMm = roundMm(pxToMm(py / zoom) - 12.5);
    }
    addObject({
      id: generateId("image"),
      type: "image",
      x: xMm,
      y: yMm,
      width: 25,
      height: 25,
      rotation: 0,
      src: dataUrl,
    });
  }

  const stageWidthMm = canvas.width;
  const stageHeightMm = canvas.height;
  const pxW = mmToPx(stageWidthMm) * zoom;
  const pxH = mmToPx(stageHeightMm) * zoom;

  // Tamanho total da área de viewport inclui as réguas.
  const viewportW = pxW + RULER_SIZE_PX + 200; // headroom para zoom
  const viewportH = pxH + RULER_SIZE_PX + 200;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto bg-muted/40"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={onDrop}
    >
      <div
        className="relative"
        style={{ width: viewportW, height: viewportH }}
      >
        <Rulers
          widthMm={stageWidthMm}
          heightMm={stageHeightMm}
          zoom={zoom}
          pxWidth={pxW}
          pxHeight={pxH}
        />

        <div
          className="absolute"
          style={{ left: RULER_SIZE_PX, top: RULER_SIZE_PX, width: pxW, height: pxH }}
        >
          <Stage
            ref={stageRef}
            width={pxW}
            height={pxH}
            onMouseDown={(e) => {
              // Clique no fundo (stage = target) limpa seleção.
              if (e.target === e.target.getStage()) {
                clearSelection();
              }
            }}
          >
            {/* Background + Grid */}
            <Layer listening={false}>
              <Rect
                x={0}
                y={0}
                width={pxW}
                height={pxH}
                fill={canvas.background ?? "#FFFFFF"}
                stroke="#94a3b8"
                strokeWidth={1}
              />
              <GridLines
                widthMm={stageWidthMm}
                heightMm={stageHeightMm}
                stepMm={grid}
                zoom={zoom}
              />
            </Layer>

            {/* Conteúdo */}
            <Layer
              clipFunc={(ctx) => {
                ctx.rect(0, 0, pxW, pxH);
              }}
            >
              {objects.map((obj) => (
                <ObjectNode
                  key={obj.id}
                  object={obj}
                  zoom={zoom}
                  selected={selectedIds.includes(obj.id)}
                  snapEnabled={snapEnabled}
                  grid={grid}
                  registerNode={(node) => {
                    if (node) nodeRefs.current.set(obj.id, node);
                    else nodeRefs.current.delete(obj.id);
                  }}
                  onSelect={(e) => {
                    if (e.evt.shiftKey) {
                      toggleSelect(obj.id);
                    } else {
                      selectOnly(obj.id);
                    }
                  }}
                  onChange={(patch) => updateObject(obj.id, patch)}
                />
              ))}
            </Layer>

            {/* UI: Transformer */}
            <Layer>
              <Transformer
                ref={(node) => {
                  transformerRef.current = node;
                }}
                rotateEnabled
                keepRatio={false}
                anchorSize={8}
                borderStroke="#6366f1"
                anchorStroke="#6366f1"
                anchorFill="#ffffff"
                rotationSnaps={[0, 90, 180, 270]}
                rotationSnapTolerance={10}
                boundBoxFunc={(oldBox, newBox) => {
                  // Evita dimensões negativas/quase nulas.
                  if (newBox.width < 4 || newBox.height < 4) return oldBox;
                  return newBox;
                }}
              />
            </Layer>
          </Stage>
        </div>

        {isDragOver && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 border-2 border-dashed border-primary/50 bg-primary/5"
          />
        )}
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Renderiza as linhas de grade. Optamos por **gerar as Lines uma única vez**
 * por par (canvas, grid, zoom) para não criar centenas de nodes a cada
 * re-render do conteúdo.
 */
function GridLines({
  widthMm,
  heightMm,
  stepMm,
  zoom,
}: {
  widthMm: number;
  heightMm: number;
  stepMm: number;
  zoom: number;
}) {
  const lines = React.useMemo(() => {
    const pxStep = MM_TO_PX * stepMm * zoom;
    const w = MM_TO_PX * widthMm * zoom;
    const h = MM_TO_PX * heightMm * zoom;
    const out: { points: number[]; major: boolean }[] = [];
    for (let mm = stepMm; mm < widthMm; mm += stepMm) {
      const x = MM_TO_PX * mm * zoom;
      out.push({ points: [x, 0, x, h], major: mm % 5 === 0 });
    }
    for (let mm = stepMm; mm < heightMm; mm += stepMm) {
      const y = MM_TO_PX * mm * zoom;
      out.push({ points: [0, y, w, y], major: mm % 5 === 0 });
    }
    // Suprime warning de variável não usada em compiladores muito estritos.
    void pxStep;
    return out;
  }, [widthMm, heightMm, stepMm, zoom]);

  return (
    <>
      {lines.map((l, i) => (
        <Line
          key={i}
          points={l.points}
          stroke={l.major ? "#cbd5e1" : "#e2e8f0"}
          strokeWidth={l.major ? 0.5 : 0.3}
          listening={false}
        />
      ))}
    </>
  );
}

interface ObjectNodeProps {
  object: CanvasObject;
  zoom: number;
  selected: boolean;
  snapEnabled: boolean;
  grid: number;
  registerNode: (node: Konva.Node | null) => void;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onChange: (patch: Partial<CanvasObject>) => void;
}

function ObjectNode(props: ObjectNodeProps) {
  const { object: o, zoom, snapEnabled, grid, registerNode, onSelect, onChange } = props;

  function commitDrag(node: Konva.Node) {
    const xMm = pxToMm(node.x() / zoom);
    const yMm = pxToMm(node.y() / zoom);
    const finalX = snapEnabled ? roundMm(xMm, grid) : roundMm(xMm);
    const finalY = snapEnabled ? roundMm(yMm, grid) : roundMm(yMm);
    onChange({ x: finalX, y: finalY });
    // Recoloca o node na posição final (em px) para evitar drift visual entre
    // o "commit em mm arredondado" e a posição original do drag.
    node.position({ x: finalX * MM_TO_PX * zoom, y: finalY * MM_TO_PX * zoom });
  }

  function commitTransform(node: Konva.Node, ratio: { sx: number; sy: number }) {
    // Konva aplica escala no node; convertemos de volta para width/height em mm.
    const baseW = (o.width ?? 0) * MM_TO_PX * zoom;
    const baseH = (o.height ?? 0) * MM_TO_PX * zoom;
    const newWidthPx = Math.max(2, baseW * ratio.sx);
    const newHeightPx = Math.max(2, baseH * ratio.sy);
    const xMm = pxToMm(node.x() / zoom);
    const yMm = pxToMm(node.y() / zoom);
    const wMm = pxToMm(newWidthPx / zoom);
    const hMm = pxToMm(newHeightPx / zoom);
    const rotation = node.rotation();
    const stepX = snapEnabled ? grid : 0.1;
    const stepY = snapEnabled ? grid : 0.1;
    onChange({
      x: roundMm(xMm, stepX),
      y: roundMm(yMm, stepY),
      width: roundMm(wMm, snapEnabled ? grid : 0.1),
      height: roundMm(hMm, snapEnabled ? grid : 0.1),
      rotation: roundMm(rotation, 0.5),
    });
    // Reset da escala — o tamanho real vai para width/height.
    node.scaleX(1);
    node.scaleY(1);
  }

  const commonProps = {
    x: (o.x ?? 0) * MM_TO_PX * zoom,
    y: (o.y ?? 0) * MM_TO_PX * zoom,
    rotation: o.rotation ?? 0,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onMouseDown: onSelect,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => commitDrag(e.target),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) =>
      commitTransform(e.target, { sx: e.target.scaleX(), sy: e.target.scaleY() }),
  };

  const widthPx = (o.width ?? 0) * MM_TO_PX * zoom;
  const heightPx = (o.height ?? 0) * MM_TO_PX * zoom;

  switch (o.type) {
    case "rectangle":
      return (
        <Rect
          ref={(n) => registerNode(n)}
          {...commonProps}
          width={widthPx}
          height={heightPx}
          fill={o.fill === "transparent" ? undefined : o.fill}
          stroke={o.stroke ?? undefined}
          strokeWidth={(o.strokeWidth ?? 0.3) * MM_TO_PX * zoom}
          cornerRadius={(o.cornerRadius ?? 0) * MM_TO_PX * zoom}
        />
      );
    case "ellipse":
      return (
        <Group ref={(n) => registerNode(n)} {...commonProps}>
          <Ellipse
            x={widthPx / 2}
            y={heightPx / 2}
            radiusX={widthPx / 2}
            radiusY={heightPx / 2}
            fill={o.fill === "transparent" ? undefined : o.fill}
            stroke={o.stroke ?? undefined}
            strokeWidth={(o.strokeWidth ?? 0.3) * MM_TO_PX * zoom}
          />
        </Group>
      );
    case "line": {
      // Linha desenhada como retângulo fininho — preserva bounding box e
      // permite o Transformer atuar normalmente.
      const stroke = o.stroke ?? "#000000";
      const lineH = Math.max(1, (o.height ?? 0.4) * MM_TO_PX * zoom);
      return (
        <Rect
          ref={(n) => registerNode(n)}
          {...commonProps}
          width={widthPx}
          height={lineH}
          fill={stroke}
        />
      );
    }
    case "text":
      return (
        <TextObjectNode
          object={o}
          widthPx={widthPx}
          heightPx={heightPx}
          zoom={zoom}
          commonProps={commonProps}
          registerNode={registerNode}
        />
      );
    case "image":
      return (
        <KonvaImageObject
          object={o}
          widthPx={widthPx}
          heightPx={heightPx}
          commonProps={commonProps}
          registerNode={registerNode}
        />
      );
    case "barcode":
    case "qrcode":
      // WP-07 / SPEC-06: render vetorial via bwip-js → SVG → HTMLImage no Konva.
      return (
        <BarcodeObjectNode
          object={o}
          widthPx={widthPx}
          heightPx={heightPx}
          commonProps={commonProps}
          registerNode={registerNode}
        />
      );
  }
}

interface KonvaImageObjectProps {
  object: { src: string; x: number; y: number };
  widthPx: number;
  heightPx: number;
  commonProps: Record<string, unknown>;
  registerNode: (node: Konva.Node | null) => void;
}

function KonvaImageObject({
  object,
  widthPx,
  heightPx,
  commonProps,
  registerNode,
}: KonvaImageObjectProps) {
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  React.useEffect(() => {
    if (!object.src) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.src = object.src;
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
  }, [object.src]);

  if (!image) {
    return (
      <Group ref={(n) => registerNode(n)} {...(commonProps as object)}>
        <Rect width={widthPx} height={heightPx} fill="#f1f5f9" stroke="#94a3b8" dash={[4, 4]} />
        <Text
          x={4}
          y={4}
          text={object.src ? "Carregando…" : "Imagem"}
          fontSize={10}
          fill="#64748b"
        />
      </Group>
    );
  }
  return (
    <KImage
      ref={(n) => registerNode(n)}
      {...(commonProps as object)}
      image={image}
      width={widthPx}
      height={heightPx}
    />
  );
}

// ---------------------------------------------------------------------------
// Texto (WP-06 / SPEC-05): render unificado com fontes do bundle/sistema,
// estilos, alinhamentos, letter-spacing, line-height e auto-shrink.
// ---------------------------------------------------------------------------

interface TextObjectNodeProps {
  object: TextObject;
  widthPx: number;
  heightPx: number;
  zoom: number;
  commonProps: Record<string, unknown>;
  registerNode: (node: Konva.Node | null) => void;
}

function TextObjectNode({
  object: o,
  widthPx,
  heightPx,
  zoom,
  commonProps,
  registerNode,
}: TextObjectNodeProps) {
  // pt → px (96 dpi). Mantemos a constante alinhada ao MEMORY.md / WP-04.
  const PT_TO_PX = 1.333;
  const desiredPx = (o.fontSize ?? 12) * PT_TO_PX * zoom;

  /**
   * Auto-shrink (RF-F-10): se `autoShrink` está ligado e o texto não couber
   * no bounding box, reduzimos `fontSize` por passos até caber (ou bater no
   * mínimo de 4 pt). Aproximação geométrica baseada em `Konva.Text.measureSize`:
   * pegamos um `Konva.Text` desanexado para medir; mais barato que renderizar
   * a árvore inteira e reconciliar.
   *
   * Reage a mudanças de conteúdo, dimensão, fonte e zoom. Falha gracioso →
   * usa o desiredPx (sem shrink) se a medição der ruim.
   */
  const renderedPx = React.useMemo(() => {
    if (!o.autoShrink) return desiredPx;
    if (widthPx <= 0 || heightPx <= 0) return desiredPx;
    const minPx = 4 * PT_TO_PX * zoom;
    let current = desiredPx;
    // Limite de iterações para garantir terminação rápida (RF-F-10 não impõe
    // exato, mas a UX de digitação precisa ser fluida).
    for (let i = 0; i < 24; i++) {
      const measureNode = new Konva.Text({
        text: o.content ?? "",
        width: widthPx,
        fontFamily: fontFamilyWithFallback(o.fontFamily),
        fontSize: current,
        fontStyle: konvaFontStyle(o.fontWeight, o.fontStyle),
        lineHeight: o.lineHeight ?? 1,
        letterSpacing: (o.letterSpacing ?? 0) * zoom,
        align: o.textAlign === "justify" ? "left" : (o.textAlign ?? "left"),
      });
      const size = measureNode.getClientRect({ skipTransform: true });
      measureNode.destroy();
      if (size.height <= heightPx) break;
      if (current <= minPx) {
        current = minPx;
        break;
      }
      current = Math.max(minPx, current * 0.92);
    }
    return current;
  }, [
    o.autoShrink,
    o.content,
    o.fontFamily,
    o.fontWeight,
    o.fontStyle,
    o.textAlign,
    o.letterSpacing,
    o.lineHeight,
    desiredPx,
    widthPx,
    heightPx,
    zoom,
  ]);

  return (
    <Text
      ref={(n) => registerNode(n)}
      {...(commonProps as object)}
      text={o.content ?? ""}
      width={widthPx > 0 ? widthPx : undefined}
      height={heightPx > 0 ? heightPx : undefined}
      fontFamily={fontFamilyWithFallback(o.fontFamily)}
      fontSize={renderedPx}
      fontStyle={konvaFontStyle(o.fontWeight, o.fontStyle)}
      textDecoration={
        o.textDecoration === "underline"
          ? "underline"
          : o.textDecoration === "line-through"
            ? "line-through"
            : ""
      }
      align={o.textAlign === "justify" ? "left" : (o.textAlign ?? "left")}
      verticalAlign={o.verticalAlign ?? "top"}
      letterSpacing={(o.letterSpacing ?? 0) * zoom}
      lineHeight={o.lineHeight ?? 1}
      fill={o.color ?? "#000000"}
      // Konva faz wrap automático quando há `width` e o texto excede (RF-F-09).
      wrap="word"
    />
  );
}

/** Combina fontWeight + fontStyle no formato esperado pelo Konva.Text. */
function konvaFontStyle(
  fontWeight: TextObject["fontWeight"],
  fontStyle: TextObject["fontStyle"],
): string {
  const bold = fontWeight === "bold";
  const italic = fontStyle === "italic";
  if (bold && italic) return "bold italic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "normal";
}

// ---------------------------------------------------------------------------
// Barcode / QR Code (WP-07 / SPEC-06).
// ---------------------------------------------------------------------------

interface BarcodeObjectNodeProps {
  object: BarcodeObject | QrcodeObject;
  widthPx: number;
  heightPx: number;
  commonProps: Record<string, unknown>;
  registerNode: (node: Konva.Node | null) => void;
}

/**
 * Render real do `barcode`/`qrcode` no canvas.
 *
 * Estratégia:
 *  - `bwip-js.toSVG(...)` gera o SVG vetorial. Estamos no editor, sem dados
 *    de planilha — placeholders `{{ campo }}` aparecem como literal (UX
 *    consistente com o resto do app antes do wizard de lote do WP-13).
 *  - Decoramos o SVG com `width`/`height` em px iguais ao bounding box e
 *    `preserveAspectRatio="none"` para que o barcode preencha exatamente a
 *    caixa do objeto. O usuário ajusta proporção via Transformer.
 *  - Convertendo SVG → data URL UTF-8 → HTMLImageElement → Konva.Image. Sem
 *    CDN (offline-first OK).
 *  - Em estado inválido (validação falhou) mostramos um overlay vermelho com
 *    a mensagem em PT-BR (RF-B-05).
 */
function BarcodeObjectNode({
  object,
  widthPx,
  heightPx,
  commonProps,
  registerNode,
}: BarcodeObjectNodeProps) {
  const canvasDpi = useEditorStore((s) => s.canvas.dpi);

  // Memoiza a geração do SVG por (objeto, dpi, dimensões). O cache interno
  // de `barcode-svg.ts` deduplica chamadas com mesmo conteúdo lógico.
  const rendered = React.useMemo(() => {
    return renderBarcodeSvg(object, {
      dpi: canvasDpi,
      bindingContext: {},
    });
  }, [
    object,
    canvasDpi,
  ]);

  // Decora o SVG com width/height px para o HTMLImage respeitar a caixa.
  const dataUrl = React.useMemo(() => {
    if (!rendered.svg) return "";
    if (widthPx <= 0 || heightPx <= 0) return "";
    const fitted = fitSvgToBox(
      rendered.svg,
      Math.max(1, Math.round(widthPx)),
      Math.max(1, Math.round(heightPx)),
    );
    return svgToDataUrl(fitted);
  }, [rendered.svg, widthPx, heightPx]);

  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  React.useEffect(() => {
    if (!dataUrl) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
    img.src = dataUrl;
  }, [dataUrl]);

  // Estado de erro (validação falhou) → desenha placeholder de aviso.
  if (rendered.error) {
    return (
      <Group ref={(n) => registerNode(n)} {...(commonProps as object)}>
        <Rect
          width={widthPx}
          height={heightPx}
          fill="#fee2e2"
          stroke="#dc2626"
          strokeWidth={1}
          dash={[4, 4]}
        />
        <Text
          x={4}
          y={4}
          text={rendered.error}
          fontSize={9}
          fill="#991b1b"
          width={Math.max(0, widthPx - 8)}
          wrap="word"
        />
      </Group>
    );
  }

  if (!image) {
    return (
      <Group ref={(n) => registerNode(n)} {...(commonProps as object)}>
        <Rect
          width={widthPx}
          height={heightPx}
          fill="#f1f5f9"
          stroke="#94a3b8"
          dash={[4, 4]}
        />
        <Text
          x={4}
          y={4}
          text="Gerando barcode…"
          fontSize={9}
          fill="#475569"
          width={Math.max(0, widthPx - 8)}
        />
      </Group>
    );
  }

  return (
    <KImage
      ref={(n) => registerNode(n)}
      {...(commonProps as object)}
      image={image}
      width={widthPx}
      height={heightPx}
    />
  );
}
