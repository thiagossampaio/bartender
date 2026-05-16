import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Dialog/Modal minimalista (WP-03) sem @radix-ui — mantém o bundle leve e
 * dispensa adicionar `style-src 'unsafe-inline'` adicional ou portals
 * complexos. Cobre os requisitos básicos do shadcn/ui:
 *
 *  - Overlay com backdrop (click fora fecha).
 *  - Tecla ESC fecha.
 *  - Focus trap ligeiro (foca o primeiro elemento ao abrir).
 *  - Restaura o foco anterior ao fechar.
 *  - `aria-modal` + `role="dialog"`.
 *
 * O foco em A11y AA fica para [WP-17](../../../specs/work-plan.md#wp-17--polimento-i18n-pt-br-onboarding-acessibilidade-aa-atalhos-finais-qa-hardware);
 * aqui entregamos o mínimo correto.
 */

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const previouslyFocused = React.useRef<HTMLElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);

    // Foca o primeiro elemento focável dentro do dialog.
    requestAnimationFrame(() => {
      const root = containerRef.current;
      if (!root) return;
      const focusable = root.querySelector<HTMLElement>(
        'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    });

    // Trava o scroll do body.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        ref={containerRef}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border bg-card p-6 shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 pb-4", className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-lg font-semibold leading-none", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}
