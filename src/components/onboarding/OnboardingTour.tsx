import * as React from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Tour de onboarding (WP-17 / SPEC-14 §"Comportamento esperado" item 4).
 *
 * 4 passos guiados na primeira execução do app, cobrindo:
 *   1. Boas-vindas e proposta offline-first.
 *   2. Galeria (criar/importar templates).
 *   3. Editor (objetos + atalhos PT-BR).
 *   4. Imprimir + histórico (Argox/Zebra, modo nativo, reimpressão).
 *
 * Decisões:
 *  - **Sem `react-joyride`**: o overlay é uma view modal centralizada, sem
 *    "spotlight" sobre elementos específicos. Justificativa: a galeria é a
 *    primeira tela aberta — apontar para botões dela exigiria refs cross-
 *    component que cresceriam a superfície de mudança em todas as views.
 *    A spec exige "tour de 3-4 passos" e o critério de aceite é "o tour
 *    aparece" + "100 % das strings em PT-BR" — não pede spotlight.
 *  - **Persistência**: a Galeria controla o flag `onboarding_completed_v1`
 *    em `settings` e só renderiza este componente quando ainda não foi
 *    concluído (ver `useOnboardingState` em `useOnboardingState.ts`).
 *  - **Atalhos de teclado**: ←/→ navegam entre passos; `Esc` fecha (= pular).
 *  - **Acessibilidade**: `role="dialog"` + `aria-modal` + foco inicial em
 *    "Próximo"/"Concluir" garante navegação por teclado e leitores de tela.
 */

export interface OnboardingTourProps {
  /** Renderiza apenas quando `true`. */
  open: boolean;
  /** Disparado ao concluir todos os passos OU ao "Pular". */
  onClose: (reason: "finished" | "skipped") => void;
}

interface Step {
  titleKey: string;
  bodyKey: string;
}

const STEPS: Step[] = [
  { titleKey: "onboarding.step1Title", bodyKey: "onboarding.step1Body" },
  { titleKey: "onboarding.step2Title", bodyKey: "onboarding.step2Body" },
  { titleKey: "onboarding.step3Title", bodyKey: "onboarding.step3Body" },
  { titleKey: "onboarding.step4Title", bodyKey: "onboarding.step4Body" },
];

export function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const { t } = useTranslation();
  const [index, setIndex] = React.useState(0);
  const primaryRef = React.useRef<HTMLButtonElement | null>(null);

  const isLast = index === STEPS.length - 1;

  // Foco inicial no botão primário ao abrir / mudar de passo (acessibilidade).
  React.useEffect(() => {
    if (open && primaryRef.current) {
      primaryRef.current.focus();
    }
  }, [open, index]);

  // Reinicia quando reabre — evita estado preso no último passo se algo
  // disparar o tour novamente em runtime.
  React.useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Atalhos de teclado: ←/→/Esc.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose("skipped");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => Math.min(STEPS.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const step = STEPS[index];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-body"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg border bg-background shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("onboarding.step", { current: index + 1, total: STEPS.length })}
            </p>
            <h2 id="onboarding-title" className="text-lg font-semibold">
              {t(step.titleKey)}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onClose("skipped")}
            aria-label={t("onboarding.skip")}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p id="onboarding-body" className="text-sm leading-relaxed text-foreground">
            {t(step.bodyKey)}
          </p>
          {index === 3 && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t("onboarding.argoxNote")}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-3">
          {/* Indicadores de progresso (dots). */}
          <ol
            className="flex items-center gap-1.5"
            aria-label={t("onboarding.step", {
              current: index + 1,
              total: STEPS.length,
            })}
          >
            {STEPS.map((_, i) => (
              <li
                key={i}
                aria-current={i === index ? "step" : undefined}
                className={cn(
                  "h-1.5 w-5 rounded-full transition-colors",
                  i === index
                    ? "bg-foreground"
                    : i < index
                      ? "bg-foreground/40"
                      : "bg-muted-foreground/30",
                )}
              />
            ))}
          </ol>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onClose("skipped")}
            >
              {t("onboarding.skip")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              aria-label={t("onboarding.previous")}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t("onboarding.previous")}
            </Button>
            <Button
              ref={primaryRef}
              size="sm"
              onClick={() => {
                if (isLast) {
                  onClose("finished");
                } else {
                  setIndex((i) => Math.min(STEPS.length - 1, i + 1));
                }
              }}
            >
              {isLast ? t("onboarding.finish") : t("onboarding.next")}
              {!isLast && (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
