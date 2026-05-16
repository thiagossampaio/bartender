/**
 * `useFonts()` hook (WP-06 / SPEC-05).
 *
 * Centraliza a obtenção da lista final de famílias disponíveis no FontPicker:
 *
 *  1. As 15 do bundle (`BUNDLE_FONTS`) sempre aparecem, mesmo offline.
 *  2. As do sistema operacional vêm assíncronas via comando Tauri
 *     `fonts_list_system` (RF-F-01).
 *  3. Em ambientes não-Tauri (vite dev no browser puro, testes unitários),
 *     caímos no `COMMON_SYSTEM_FONTS` para não bloquear a UI.
 *
 * Também dispara o registro dos `@font-face` (uma única vez por sessão) via
 * `registerBundleFonts()`.
 *
 * Decisão: NÃO usamos `document.fonts.values()` para descobrir fontes do
 * sistema — essa API só lista as já registradas pela página, não as
 * instaladas no SO (e listar fontes do SO via Web é bloqueado por privacidade
 * desde 2022). Daí a necessidade do comando Rust.
 */

import * as React from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  BUNDLE_FONTS,
  COMMON_SYSTEM_FONTS,
  type BundleFont,
} from "@/lib/canvas/fonts";
import { registerBundleFonts } from "@/lib/canvas/font-loader";

export interface FontOption {
  family: string;
  source: "bundle" | "system";
  /** Presente para itens do bundle — útil para o rótulo do picker. */
  bundle?: BundleFont;
}

interface UseFontsResult {
  /** Itens do bundle (sempre 15, ordem do PRD §5.3). */
  bundle: readonly FontOption[];
  /** Itens do sistema operacional (deduplicados, ordenados, sem repetir bundle). */
  system: readonly FontOption[];
  /** True enquanto `fonts_list_system` ainda não respondeu. */
  loading: boolean;
}

const BUNDLE_OPTIONS: readonly FontOption[] = BUNDLE_FONTS.map((b) => ({
  family: b.family,
  source: "bundle" as const,
  bundle: b,
}));

const BUNDLE_FAMILY_SET = new Set(BUNDLE_FONTS.map((b) => b.family));

const DEFAULT_SYSTEM: readonly FontOption[] = COMMON_SYSTEM_FONTS.map((f) => ({
  family: f,
  source: "system" as const,
}));

/** Detecta se estamos rodando dentro do Tauri (vs. browser puro / testes). */
function isInTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function useFonts(): UseFontsResult {
  const [system, setSystem] = React.useState<readonly FontOption[]>(DEFAULT_SYSTEM);
  const [loading, setLoading] = React.useState<boolean>(isInTauri());

  React.useEffect(() => {
    let cancelled = false;
    void registerBundleFonts();

    if (!isInTauri()) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const families = await invoke<string[]>("fonts_list_system");
        if (cancelled) return;
        // Remove duplicatas com bundle (já listamos no topo) e ordena.
        const filtered = families
          .filter((f) => f.trim().length > 0)
          .filter((f) => !BUNDLE_FAMILY_SET.has(f));
        // Remove duplicatas case-sensitive — a maioria das fontes vem únicas
        // do font-kit, mas guard rail barato.
        const dedup = Array.from(new Set(filtered));
        dedup.sort((a, b) => a.localeCompare(b, "pt-BR"));
        setSystem(dedup.map((f) => ({ family: f, source: "system" as const })));
      } catch {
        // Falha de IPC ou backend antigo — mantemos o `DEFAULT_SYSTEM`.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { bundle: BUNDLE_OPTIONS, system, loading };
}
