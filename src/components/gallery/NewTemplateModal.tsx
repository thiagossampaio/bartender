import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type CreateTemplateInput,
  type Orientation,
  TEMPLATE_PRESETS,
} from "@/lib/templates";

/**
 * Modal "Novo template" (SPEC-03 §"Comportamento esperado" item 2 + RF-T-02).
 *
 * Campos:
 * - Nome (obrigatório, trimado, mínimo 1 char).
 * - Preset 50×30 / 40×25 / 100×50 OU dimensões customizadas em mm.
 * - DPI (default 203 — Argox OS-214 Plus). Range 100–600.
 * - Orientação portrait (default) / landscape.
 *
 * Validação leve via estado local (sem zod aqui) para manter o modal simples
 * e auditável; quando a tela do editor (WP-04) entrar, podemos extrair um
 * schema zod compartilhado.
 */

const DEFAULT_PRESET_ID = TEMPLATE_PRESETS[0].id; // "50x30"

interface NewTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateTemplateInput) => Promise<void>;
}

type PresetSelection = (typeof TEMPLATE_PRESETS)[number]["id"] | "custom";

interface FormState {
  name: string;
  preset: PresetSelection;
  customWidth: string;
  customHeight: string;
  dpi: string;
  orientation: Orientation;
}

const INITIAL_STATE: FormState = {
  name: "",
  preset: DEFAULT_PRESET_ID,
  customWidth: "",
  customHeight: "",
  dpi: "203",
  orientation: "portrait",
};

export function NewTemplateModal({
  open,
  onOpenChange,
  onSubmit,
}: NewTemplateModalProps) {
  const [state, setState] = React.useState<FormState>(INITIAL_STATE);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Reseta o formulário sempre que o modal abre, para evitar resíduos.
  React.useEffect(() => {
    if (open) {
      setState(INITIAL_STATE);
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function resolveDimensions(): { widthMm: number; heightMm: number } | null {
    if (state.preset === "custom") {
      const w = Number.parseFloat(state.customWidth);
      const h = Number.parseFloat(state.customHeight);
      if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
      if (w <= 0 || h <= 0) return null;
      if (w > 500 || h > 500) return null; // Sanidade — etiquetas térmicas raras > 500 mm.
      return { widthMm: w, heightMm: h };
    }
    const preset = TEMPLATE_PRESETS.find((p) => p.id === state.preset);
    if (!preset) return null;
    return { widthMm: preset.widthMm, heightMm: preset.heightMm };
  }

  function resolveDpi(): number | null {
    const dpi = Number.parseInt(state.dpi, 10);
    if (!Number.isFinite(dpi)) return null;
    if (dpi < 100 || dpi > 600) return null;
    return dpi;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const name = state.name.trim();
    if (name.length === 0) {
      setSubmitError("Informe um nome para o template.");
      return;
    }
    const dims = resolveDimensions();
    if (!dims) {
      setSubmitError(
        "Informe dimensões válidas em mm (largura e altura entre 0 e 500).",
      );
      return;
    }
    const dpi = resolveDpi();
    if (!dpi) {
      setSubmitError("DPI deve estar entre 100 e 600.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name,
        widthMm: dims.widthMm,
        heightMm: dims.heightMm,
        dpi,
        orientation: state.orientation,
      });
      onOpenChange(false);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Erro ao criar template.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Novo template</DialogTitle>
          <DialogDescription>
            Defina nome, dimensões em milímetros, DPI e orientação. Você pode
            ajustar tudo depois no editor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nt-name">Nome</Label>
            <Input
              id="nt-name"
              value={state.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Ex.: Etiqueta SKU pequena"
              autoComplete="off"
              required
              maxLength={120}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nt-preset">Tamanho</Label>
            <select
              id="nt-preset"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={state.preset}
              onChange={(e) => update("preset", e.target.value as PresetSelection)}
            >
              {TEMPLATE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Personalizado…</option>
            </select>
          </div>

          {state.preset === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nt-w">Largura (mm)</Label>
                <Input
                  id="nt-w"
                  type="number"
                  step="0.1"
                  min="1"
                  max="500"
                  value={state.customWidth}
                  onChange={(e) => update("customWidth", e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nt-h">Altura (mm)</Label>
                <Input
                  id="nt-h"
                  type="number"
                  step="0.1"
                  min="1"
                  max="500"
                  value={state.customHeight}
                  onChange={(e) => update("customHeight", e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nt-dpi">DPI</Label>
              <Input
                id="nt-dpi"
                type="number"
                step="1"
                min="100"
                max="600"
                value={state.dpi}
                onChange={(e) => update("dpi", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nt-orientation">Orientação</Label>
              <select
                id="nt-orientation"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={state.orientation}
                onChange={(e) =>
                  update("orientation", e.target.value as Orientation)
                }
              >
                <option value="portrait">Retrato</option>
                <option value="landscape">Paisagem</option>
              </select>
            </div>
          </div>

          {submitError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Criando…" : "Criar template"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
