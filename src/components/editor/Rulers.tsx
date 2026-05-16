import { MM_TO_PX } from "@/lib/canvas/units";

/**
 * Réguas horizontal e vertical em mm (WP-04 / SPEC-04 RF-E-02).
 *
 * Implementadas em SVG simples para ficar leve. Conscientes do `zoom` do
 * canvas — os ticks são marcados a cada 1 mm com rótulos a cada 5 mm. Em
 * zoom baixo (≤ 50 %) reduzimos a densidade dos ticks para evitar poluição.
 *
 * As réguas são puramente visuais; nenhum estado de canvas vive aqui.
 */

interface RulersProps {
  widthMm: number;
  heightMm: number;
  zoom: number;
  /** Largura visível em px (área do canvas). */
  pxWidth: number;
  /** Altura visível em px. */
  pxHeight: number;
}

export const RULER_SIZE_PX = 20;

export function Rulers({ widthMm, heightMm, zoom, pxWidth, pxHeight }: RulersProps) {
  const mmPerPx = 1 / (MM_TO_PX * zoom);
  // Densidade adaptativa: 1 mm em zoom alto, 2 mm em zoom médio, 5 mm em baixo.
  const tickStepMm = zoom >= 1 ? 1 : zoom >= 0.5 ? 2 : 5;
  const labelStepMm = zoom >= 1 ? 5 : zoom >= 0.5 ? 10 : 20;
  // Limita a quantos mm a régua mostra (um pouco além das dimensões do canvas).
  const maxMmX = Math.ceil(pxWidth * mmPerPx);
  const maxMmY = Math.ceil(pxHeight * mmPerPx);
  const ticksX: number[] = [];
  for (let mm = 0; mm <= maxMmX; mm += tickStepMm) ticksX.push(mm);
  const ticksY: number[] = [];
  for (let mm = 0; mm <= maxMmY; mm += tickStepMm) ticksY.push(mm);
  const canvasEndX = widthMm * MM_TO_PX * zoom;
  const canvasEndY = heightMm * MM_TO_PX * zoom;

  return (
    <>
      {/* Régua horizontal */}
      <svg
        role="presentation"
        width={pxWidth}
        height={RULER_SIZE_PX}
        className="absolute left-[20px] top-0 bg-muted/30"
      >
        <rect width={canvasEndX} height={RULER_SIZE_PX} fill="rgba(99,102,241,0.06)" />
        {ticksX.map((mm) => {
          const x = mm * MM_TO_PX * zoom;
          const isLabel = mm % labelStepMm === 0;
          const tickH = isLabel ? 8 : 4;
          return (
            <g key={mm}>
              <line
                x1={x}
                x2={x}
                y1={RULER_SIZE_PX - tickH}
                y2={RULER_SIZE_PX}
                stroke="currentColor"
                strokeOpacity={isLabel ? 0.6 : 0.3}
              />
              {isLabel && (
                <text
                  x={x + 2}
                  y={RULER_SIZE_PX - tickH - 2}
                  fontSize={9}
                  fill="currentColor"
                  fillOpacity={0.7}
                >
                  {mm}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Régua vertical */}
      <svg
        role="presentation"
        width={RULER_SIZE_PX}
        height={pxHeight}
        className="absolute left-0 top-[20px] bg-muted/30"
      >
        <rect width={RULER_SIZE_PX} height={canvasEndY} fill="rgba(99,102,241,0.06)" />
        {ticksY.map((mm) => {
          const y = mm * MM_TO_PX * zoom;
          const isLabel = mm % labelStepMm === 0;
          const tickW = isLabel ? 8 : 4;
          return (
            <g key={mm}>
              <line
                x1={RULER_SIZE_PX - tickW}
                x2={RULER_SIZE_PX}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity={isLabel ? 0.6 : 0.3}
              />
              {isLabel && (
                <text
                  x={2}
                  y={y + 9}
                  fontSize={9}
                  fill="currentColor"
                  fillOpacity={0.7}
                >
                  {mm}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Quina entre as réguas */}
      <div
        aria-hidden
        className="absolute left-0 top-0 bg-muted/40"
        style={{ width: RULER_SIZE_PX, height: RULER_SIZE_PX }}
      />
    </>
  );
}
