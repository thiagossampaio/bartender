import { Grid3x3, Magnet, ZoomIn, ZoomOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { useEditorStore, ZOOM_LEVELS } from "@/lib/stores/editor-store";

/**
 * Controles de viewport do editor (WP-04).
 *
 * - Zoom + / − discreto entre `ZOOM_LEVELS` (RF-E-04).
 * - Select com os níveis fixos (mostrado em %).
 * - Toggle de grid (1 mm / 5 mm).
 * - Toggle de snap.
 *
 * Os atalhos `Ctrl/⌘ +/−` ficam para [WP-05](../../../specs/work-plan.md#wp-05--editor-undoredo--atalhos--salvarcarregar--thumbnail);
 * aqui temos apenas os botões equivalentes.
 */
export function ZoomControls() {
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);
  const grid = useEditorStore((s) => s.grid);
  const setGrid = useEditorStore((s) => s.setGrid);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-md border bg-card px-1">
        <button
          type="button"
          onClick={() => zoomOut()}
          className={iconBtnClass}
          aria-label="Reduzir zoom"
          disabled={zoom <= ZOOM_LEVELS[0]}
        >
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </button>
        <select
          aria-label="Nível de zoom"
          value={zoom}
          onChange={(e) => setZoom(Number.parseFloat(e.target.value))}
          className="h-8 bg-transparent text-xs"
        >
          {ZOOM_LEVELS.map((z) => (
            <option key={z} value={z}>
              {Math.round(z * 100)}%
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => zoomIn()}
          className={iconBtnClass}
          aria-label="Aumentar zoom"
          disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
        >
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setGrid(grid === 1 ? 5 : 1)}
        className={cn(
          "flex h-8 items-center gap-1 rounded-md border px-2 text-xs",
          "hover:bg-accent hover:text-accent-foreground",
        )}
        aria-label="Alternar tamanho da grade"
        title={`Grade ${grid} mm`}
      >
        <Grid3x3 className="h-4 w-4" aria-hidden="true" />
        {grid} mm
      </button>

      <button
        type="button"
        onClick={() => toggleSnap()}
        className={cn(
          "flex h-8 items-center gap-1 rounded-md border px-2 text-xs",
          snapEnabled
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "hover:bg-accent hover:text-accent-foreground",
        )}
        aria-pressed={snapEnabled}
        title={snapEnabled ? "Snap ativado" : "Snap desativado"}
      >
        <Magnet className="h-4 w-4" aria-hidden="true" />
        Snap
      </button>
    </div>
  );
}

const iconBtnClass =
  "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40";
