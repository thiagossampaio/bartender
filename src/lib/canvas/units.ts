/**
 * Conversões mm ↔ px (WP-04 / SPEC-04 §"Comportamento esperado" item 1).
 *
 * O canvas precisa ser fiel em mm, mas o Konva opera em **pixels**. Adotamos
 * um "pixel base" fixo para o canvas Konva (a 1× de zoom): 1 mm = `MM_TO_PX`
 * pixels. O zoom é um Konva `scale` independente — assim a conversão lógica
 * para serializar fica trivial (`x_mm = x_px / MM_TO_PX`).
 *
 * A escolha de **4 px/mm** é convencional para preview confortável em telas
 * comuns (≈ 101 dpi de tela) — 50×30 mm ≈ 200×120 px a 1×, com headroom para
 * zoom 25 %..400 %. Não tem relação com o DPI da impressora; o DPI da
 * impressora só entra na exportação raster (WP-08+).
 */
export const MM_TO_PX = 4;

export function mmToPx(mm: number): number {
  return mm * MM_TO_PX;
}

export function pxToMm(px: number): number {
  return px / MM_TO_PX;
}

/**
 * Arredonda mm para o "passo" mais próximo. Usado pelo snap-to-grid e por
 * normalizações de drag/resize para evitar coordenadas com 14 casas decimais.
 */
export function roundMm(mm: number, stepMm = 0.1): number {
  return Math.round(mm / stepMm) * stepMm;
}
