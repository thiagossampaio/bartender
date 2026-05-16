/**
 * Cálculo de DPI da tela para preview mm-correto (WP-08 / RF-P-01).
 *
 * Por que isso é necessário: o critério "etiqueta 50×30 mm aparece com 50×30
 * mm físicos na tela" depende do DPI real do monitor. Navegadores reportam
 * `window.devicePixelRatio` (CSS px → device px) e padronizam **96 CSS px por
 * polegada** (1 in = 96 CSS px = 25.4 mm).
 *
 * O webview do Tauri segue o mesmo padrão CSS, então `1 mm = 96/25.4 ≈ 3.7795
 * CSS px` é o nosso fator de conversão. `devicePixelRatio` só importa para
 * controlar a nitidez do canvas (`pixelRatio` no Konva.Stage); a proporção
 * permanece correta independente dele.
 *
 * Atenção: usuários com escala do SO ≠ 100 % (Windows DPI scaling, macOS
 * "Zoom") fazem o CSS px corresponder a mais physical px, mantendo a
 * proporção em mm corretamente. Quem tem monitor calibrado fora desse
 * padrão (raro) verá uma proporção próxima — o critério "≈ 50×30 mm" do
 * SPEC-08 tolera essa margem.
 */

/** CSS px por mm assumindo 96 CSS px/in (especificação CSS). */
export const CSS_PX_PER_MM = 96 / 25.4;

/** Converte mm em CSS px (escala 1×). */
export function mmToCssPx(mm: number): number {
  return mm * CSS_PX_PER_MM;
}

/**
 * Pixel ratio recomendado para nitidez do `Konva.Stage` em telas Retina.
 * Caímos em 1 quando `window` não está presente (SSR/testes).
 */
export function devicePixelRatioOr1(): number {
  if (typeof window === "undefined") return 1;
  return window.devicePixelRatio || 1;
}
