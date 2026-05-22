/**
 * Helpers para extração de mensagem de erro.
 *
 * O Tauri 2.x rejeita `invoke()` com o valor exato retornado pelo backend
 * via `serde::Serialize`. Quando o backend faz
 * `serializer.serialize_str(&self.to_string())` (padrão usado em todos os
 * módulos Rust deste projeto), o JS recebe uma **string nua** como `reason`
 * da Promise.
 *
 * O idioma `e instanceof Error ? e.message : "fallback genérico"` descarta
 * essa string nua e mostra apenas o fallback — fazendo a UI falar
 * "Falha ao exportar template." em vez do `"Não foi possível ler o
 * arquivo: Permission denied"` real do Rust.
 *
 * `extractErrorMessage` cobre os três casos comuns:
 *   1. `Error` (lançado pelo próprio frontend)
 *   2. `string` (rejeição do Tauri quando o backend serializa erro como string)
 *   3. Objeto com propriedade `message: string` (raro mas defensivo)
 *
 * Sempre devolve uma string não-vazia: cai no `fallback` se a mensagem
 * extraída estiver vazia ou se nada bater.
 */
export function extractErrorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error) {
    const m = value.message?.trim();
    if (m) return m;
  }
  if (typeof value === "string") {
    const m = value.trim();
    if (m) return m;
  }
  if (typeof value === "object" && value !== null) {
    const msg = (value as { message?: unknown }).message;
    if (typeof msg === "string") {
      const m = msg.trim();
      if (m) return m;
    }
  }
  return fallback;
}
