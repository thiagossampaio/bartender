/**
 * Hook que controla a flag de "onboarding concluído" no `settings` SQLite
 * (WP-17 / SPEC-14 §"Comportamento esperado" item 4).
 *
 * Chave: `onboarding_completed_v1` (com `_v1` para permitir re-mostrar o
 * tour quando ele for atualizado de forma incompatível em uma release futura
 * — bumping o sufixo basta).
 *
 * Comportamento:
 *  - `status === "unknown"` durante o carregamento; o caller NÃO renderiza
 *    o tour até saber o estado real (evita flash do modal para usuários
 *    veteranos).
 *  - `markCompleted()` faz upsert imediato em `settings`; idempotente.
 *  - Erros de banco são logados via `log` mas NÃO bloqueiam a UI — se o
 *    `settings` falhar, o tour fica indefinidamente "ainda não concluído",
 *    mas o usuário sempre pode pular.
 */

import * as React from "react";

import { getSetting, setSetting } from "@/lib/db";
import { log } from "@/lib/logger";

const KEY = "onboarding_completed_v1";

const onboardingLog = log.scope("onboarding");

export type OnboardingStatus = "unknown" | "pending" | "completed";

export interface UseOnboardingState {
  status: OnboardingStatus;
  /** Marca o tour como concluído (persiste em `settings`). */
  markCompleted: () => Promise<void>;
  /** Re-exibe o tour explicitamente — usado em testes/manuais. */
  resetForDebug: () => Promise<void>;
}

export function useOnboardingState(): UseOnboardingState {
  const [status, setStatus] = React.useState<OnboardingStatus>("unknown");

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const value = await getSetting(KEY);
        if (cancelled) return;
        setStatus(value === "true" ? "completed" : "pending");
      } catch (err) {
        // Falha de leitura não pode bloquear o app — log e segue como pending,
        // o que no pior caso reexibe o tour para usuários veteranos uma vez.
        onboardingLog.warn("falha ao ler flag de onboarding", err);
        if (!cancelled) setStatus("pending");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markCompleted = React.useCallback(async () => {
    setStatus("completed");
    try {
      await setSetting(KEY, "true");
    } catch (err) {
      onboardingLog.warn("falha ao persistir conclusão do onboarding", err);
    }
  }, []);

  const resetForDebug = React.useCallback(async () => {
    setStatus("pending");
    try {
      await setSetting(KEY, "false");
    } catch (err) {
      onboardingLog.warn("falha ao resetar flag de onboarding", err);
    }
  }, []);

  return { status, markCompleted, resetForDebug };
}
