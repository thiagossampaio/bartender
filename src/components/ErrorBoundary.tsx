import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  reportBoundaryError,
  subscribeGlobalError,
  type GlobalErrorInfo,
} from "@/lib/logger";

/**
 * ErrorBoundary global (WP-16 / SPEC-13 §"Mudanças necessárias").
 *
 * Envolve toda a árvore React em `main.tsx`. Responsabilidades:
 *
 *  1. **Capturar exceções de render** (React → `componentDidCatch`) e exibir
 *     uma tela amigável em vez de um app branco.
 *  2. **Sinkar erros globais** (`window.onerror`, `unhandledrejection`) através
 *     do `subscribeGlobalError`. Como esses eventos não derrubam o React, o
 *     boundary exibe um modal-banner sobreposto e mantém a árvore renderizada
 *     por baixo — assim o usuário não perde trabalho não salvo só porque um
 *     callback assíncrono explodiu.
 *  3. Em qualquer caso, o usuário pode **copiar os detalhes técnicos** para
 *     anexar a um chamado. O detalhe completo já vai para o log via
 *     `tracing` no backend (`logger.ts` faz `invoke("log_event", ...)`).
 *
 * Decisões:
 *  - Classe React (não hook) porque `componentDidCatch` ainda é a API
 *    canônica para boundaries em React 18.
 *  - O estado de "erro fatal de render" (`hasFatalError`) corta a árvore
 *    abaixo. O estado de "erro global" (`activeGlobalError`) renderiza um
 *    overlay E mantém `this.props.children` montados.
 */

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  /** True quando um erro de render derrubou a sub-árvore. */
  hasFatalError: boolean;
  /** Detalhes técnicos do último erro fatal de render. */
  fatalDetail: string | null;
  /** Último erro global (window.onerror / unhandledrejection); exibido como overlay. */
  activeGlobalError: GlobalErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private unsubscribe?: () => void;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasFatalError: false,
      fatalDetail: null,
      activeGlobalError: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasFatalError: true,
      fatalDetail: error.stack ?? `${error.name}: ${error.message}`,
    };
  }

  componentDidMount(): void {
    this.unsubscribe = subscribeGlobalError((info) => {
      this.setState({ activeGlobalError: info });
    });
  }

  componentWillUnmount(): void {
    this.unsubscribe?.();
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportBoundaryError(error, info.componentStack ?? "");
  }

  private dismissGlobalOverlay = () => {
    this.setState({ activeGlobalError: null });
  };

  private reload = () => {
    // Em Tauri, `location.reload()` recarrega o webview — não fecha o app.
    window.location.reload();
  };

  render(): React.ReactNode {
    const { hasFatalError, fatalDetail, activeGlobalError } = this.state;

    if (hasFatalError) {
      return (
        <ErrorScreen
          title="A interface encontrou um erro inesperado"
          message="A janela foi pausada para evitar dano ao seu trabalho. Você pode recarregar para tentar novamente. Trabalho não salvo recente pode ser recuperado pelo autosave."
          detail={fatalDetail ?? ""}
          primaryLabel="Recarregar interface"
          onPrimary={this.reload}
        />
      );
    }

    return (
      <>
        {this.props.children}
        {activeGlobalError && (
          <ErrorOverlay
            info={activeGlobalError}
            onDismiss={this.dismissGlobalOverlay}
          />
        )}
      </>
    );
  }
}

/**
 * Tela cheia exibida quando o render principal falha. Não usamos o `Dialog`
 * porque ele depende da árvore principal (overlay/portal) — em erro fatal
 * essa árvore já está cortada.
 */
function ErrorScreen({
  title,
  message,
  detail,
  primaryLabel,
  onPrimary,
}: {
  title: string;
  message: string;
  detail: string;
  primaryLabel: string;
  onPrimary: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="error-screen-title"
      className="flex h-screen w-screen items-center justify-center bg-background p-6"
    >
      <div className="w-full max-w-xl rounded-lg border border-destructive/40 bg-card p-6 shadow-xl">
        <h1 id="error-screen-title" className="text-lg font-semibold text-destructive">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <DetailBlock detail={detail} />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onPrimary}>{primaryLabel}</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Overlay que aparece por cima da UI quando um erro **não-fatal** ocorre.
 * O usuário pode fechar e continuar trabalhando.
 */
function ErrorOverlay({
  info,
  onDismiss,
}: {
  info: GlobalErrorInfo;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="error-overlay-title"
      aria-describedby="error-overlay-desc"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border bg-card p-5 shadow-xl">
        <h2
          id="error-overlay-title"
          className="text-base font-semibold text-destructive"
        >
          Algo deu errado
        </h2>
        <p id="error-overlay-desc" className="mt-2 text-sm text-muted-foreground">
          {info.message}
        </p>
        <DetailBlock detail={info.detail} />
        <p className="mt-3 text-xs text-muted-foreground">
          Hora: {info.at}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onDismiss}>
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Bloco colapsável com os detalhes técnicos + botão "Copiar detalhes
 * técnicos" (SPEC-13 §"Comportamento esperado" item 4).
 */
function DetailBlock({ detail }: { detail: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(() => {
    // `navigator.clipboard` está disponível no webview do Tauri 2.x; em
    // ambientes onde não estiver, caímos no fallback `execCommand`.
    const text = detail;
    try {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Mantém UX silenciosa: o usuário ainda vê o texto no <pre>.
    }
  }, [detail]);

  if (!detail) return null;

  return (
    <div className="mt-3 rounded-md border bg-muted/30">
      <div className="flex items-center justify-between gap-2 p-2">
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Ocultar detalhes técnicos" : "Mostrar detalhes técnicos"}
        </button>
        <Button size="sm" variant="ghost" onClick={handleCopy}>
          {copied ? "Copiado!" : "Copiar detalhes técnicos"}
        </Button>
      </div>
      {expanded && (
        <pre className="max-h-48 overflow-auto border-t bg-background p-2 text-[11px] leading-snug">
          {detail}
        </pre>
      )}
    </div>
  );
}
