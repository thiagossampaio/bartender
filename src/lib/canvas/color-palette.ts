/**
 * Paleta de cores recomendada para etiquetas (WP-06 / SPEC-05 RF-F-05).
 *
 * Decisão: como impressoras térmicas são predominantemente monocromáticas
 * (preto sobre papel térmico), a paleta padrão favorece tons que ainda
 * permanecem legíveis após renderização raster. O input HEX continua aceito
 * para qualquer cor (suportado por `ColorField` existente).
 *
 * Mantemos a paleta enxuta — atalhos típicos para usuários iniciantes — e
 * deixamos a expansão completa para WP-17 (polimento UX).
 */

export const TEXT_COLOR_PALETTE: readonly string[] = [
  "#000000",
  "#FFFFFF",
  "#1f2937", // slate-800
  "#475569", // slate-600
  "#94a3b8", // slate-400
  "#dc2626", // red-600
  "#ea580c", // orange-600
  "#ca8a04", // yellow-600
  "#16a34a", // green-600
  "#0ea5e9", // sky-500
  "#2563eb", // blue-600
  "#7c3aed", // violet-600
] as const;
