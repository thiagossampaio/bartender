/**
 * Helpers de detecção de plataforma para UI cross-platform
 * (WP-17 / SPEC-14 §"Comportamento esperado" item 1).
 *
 * Centraliza a decisão entre `⌘` (macOS) e `Ctrl` (Windows/Linux) para tooltips,
 * legendas de atalhos e o componente `OnboardingTour`. NÃO substitui a lógica
 * de teclado em `useEditorShortcuts` (lá aceitamos ambos os modificadores para
 * conveniência de teclados externos — ver justificativa no arquivo).
 *
 * Detecção:
 *  - Em Tauri 2.x, `navigator.userAgentData.platform` é nulo no webview macOS.
 *    Usamos `navigator.platform` (string) que ainda é exposto pelo WebKit/WebView2
 *    e nunca dispara request de rede.
 *  - `userAgent` é usado como fallback (alguns ambientes injetam plataforma).
 */

let cachedIsMac: boolean | null = null;

/** True quando o frontend está rodando sobre macOS. */
export function isMacPlatform(): boolean {
  if (cachedIsMac !== null) return cachedIsMac;
  if (typeof navigator === "undefined") {
    cachedIsMac = false;
    return cachedIsMac;
  }
  const platform = (navigator.platform || "").toLowerCase();
  const ua = (navigator.userAgent || "").toLowerCase();
  cachedIsMac = platform.includes("mac") || ua.includes("mac os");
  return cachedIsMac;
}

/** Reseta o cache de detecção. Útil só em testes. */
export function _resetPlatformCacheForTests(): void {
  cachedIsMac = null;
}

/**
 * Modificador "comando" no formato pronto para exibição em tooltip/menu.
 * Retorna `⌘` no macOS e `Ctrl` no resto.
 */
export function cmdKeyLabel(): string {
  return isMacPlatform() ? "⌘" : "Ctrl";
}

/**
 * Formata uma combinação de teclas para exibição. Aceita o nome final da
 * tecla (`"S"`, `"Z"`, ...) e opcionalmente `shift`.
 *
 * @example formatShortcut("S")            → "⌘+S" no macOS, "Ctrl+S" no Windows
 * @example formatShortcut("Z", { shift }) → "⌘+Shift+Z" / "Ctrl+Shift+Z"
 */
export function formatShortcut(
  key: string,
  options: { shift?: boolean; alt?: boolean } = {},
): string {
  const parts: string[] = [cmdKeyLabel()];
  if (options.shift) parts.push("Shift");
  if (options.alt) parts.push(isMacPlatform() ? "⌥" : "Alt");
  parts.push(key.toUpperCase());
  return parts.join("+");
}
