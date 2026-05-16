/**
 * Logger do frontend (WP-16 / SPEC-13).
 *
 * Ponte tipada que joga eventos para o `tracing` do backend Rust via
 * comando `log_event`, ao mesmo tempo em que mantém o `console.*` para
 * debug local em DevTools.
 *
 * - Em **browser puro** (vitest, preview Vite sem Tauri) o `invoke` não
 *   está disponível — degradamos para `console.*` somente. O frontend
 *   continua útil para desenvolvimento; quando rodado dentro do app
 *   Tauri o evento entra no arquivo rotativo.
 * - O fluxo é **fire-and-forget**: nenhuma chamada de log lança exceção
 *   para o caller; eventuais erros de ponte são logados via `console.warn`
 *   e silenciados (logar erros de log nunca pode quebrar o app).
 *
 * Convenção de `target`: use `"<feature>::<acao>"`, ex.:
 * `"editor::autosave"`, `"editor::recovery"`, `"global::error"`. Isso ajuda
 * a filtrar o arquivo com `grep` durante diagnóstico.
 */

import { invoke } from "@tauri-apps/api/core";

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

/** Heurística: o app está rodando dentro do Tauri? Veja convenção em
 * `font-loader.ts` (WP-06). */
function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function emitToBackend(
  level: LogLevel,
  message: string,
  target: string | undefined,
): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke("log_event", { level, message, target });
  } catch (err) {
    // Não conseguimos logar a falha de log no próprio log — vai pro console
    // mesmo, com prefixo claro pra evitar loop de recursão.
    // eslint-disable-next-line no-console
    console.warn("[logger] falha ao escrever log no backend:", err);
  }
}

function consoleEmit(level: LogLevel, args: unknown[]): void {
  // eslint-disable-next-line no-console
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : level === "debug" || level === "trace"
          ? console.debug
          : console.info;
  fn.apply(console, args);
}

/** Formata um valor arbitrário para a string que vai para o arquivo de log. */
function stringify(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function compose(parts: unknown[]): string {
  return parts.map(stringify).join(" ");
}

/** Logger principal. `log.<level>("mensagem", contexto?)`. */
export const log = {
  error: (message: string, ...rest: unknown[]) => emit("error", message, rest),
  warn: (message: string, ...rest: unknown[]) => emit("warn", message, rest),
  info: (message: string, ...rest: unknown[]) => emit("info", message, rest),
  debug: (message: string, ...rest: unknown[]) => emit("debug", message, rest),
  trace: (message: string, ...rest: unknown[]) => emit("trace", message, rest),
  /** Cria um logger com um `target` fixado (`log.scope("editor::autosave")`). */
  scope(target: string) {
    return {
      error: (message: string, ...rest: unknown[]) =>
        emit("error", message, rest, target),
      warn: (message: string, ...rest: unknown[]) =>
        emit("warn", message, rest, target),
      info: (message: string, ...rest: unknown[]) =>
        emit("info", message, rest, target),
      debug: (message: string, ...rest: unknown[]) =>
        emit("debug", message, rest, target),
      trace: (message: string, ...rest: unknown[]) =>
        emit("trace", message, rest, target),
    };
  },
};

function emit(
  level: LogLevel,
  message: string,
  rest: unknown[],
  target?: string,
): void {
  const combined = rest.length > 0 ? `${message} ${compose(rest)}` : message;
  consoleEmit(level, [combined]);
  void emitToBackend(level, combined, target);
}

/** Payload usado pelo modal global de erro não tratado. */
export interface GlobalErrorInfo {
  /** Mensagem amigável apresentada ao usuário. */
  message: string;
  /** Stack/detalhes técnicos copiáveis. */
  detail: string;
  /** Quando ocorreu (ISO local). */
  at: string;
}

type GlobalErrorListener = (info: GlobalErrorInfo) => void;
const listeners = new Set<GlobalErrorListener>();

/** Permite à UI registrar/desregistrar o listener do modal global. */
export function subscribeGlobalError(listener: GlobalErrorListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyGlobalError(info: GlobalErrorInfo): void {
  for (const l of listeners) {
    try {
      l(info);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[logger] listener de erro global lançou:", err);
    }
  }
}

/** Composição padrão de mensagem amigável. */
function friendlyMessage(): string {
  return "Ocorreu um erro inesperado. Sua próxima ação ainda pode prosseguir; se o problema persistir, copie os detalhes técnicos e abra um chamado.";
}

let installed = false;

/**
 * Instala os handlers globais `window.onerror` e `unhandledrejection`. Idempotente
 * (chamadas adicionais são no-op). Chame uma vez em `main.tsx`.
 */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const detail = stringify(event.error ?? event.message);
    log.scope("global::error").error("window.onerror", detail);
    notifyGlobalError({
      message: friendlyMessage(),
      detail,
      at: new Date().toISOString(),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const detail = stringify(event.reason);
    log.scope("global::unhandledRejection").error(
      "unhandledRejection",
      detail,
    );
    notifyGlobalError({
      message: friendlyMessage(),
      detail,
      at: new Date().toISOString(),
    });
  });
}

/**
 * Publicada para ser invocada pelo `ErrorBoundary` (React não passa pelo
 * `window.onerror` quando intercepta dentro do tree).
 */
export function reportBoundaryError(error: Error, componentStack: string): void {
  const detail = `${error.stack ?? `${error.name}: ${error.message}`}\n\nComponent stack:${componentStack}`;
  log.scope("global::boundary").error("ErrorBoundary capturou", detail);
  notifyGlobalError({
    message: friendlyMessage(),
    detail,
    at: new Date().toISOString(),
  });
}
