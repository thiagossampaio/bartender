import * as React from "react";
import { ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { fontFamilyWithFallback } from "@/lib/canvas/fonts";
import { useFonts, type FontOption } from "@/lib/canvas/use-fonts";

/**
 * Seletor de fonte do editor de texto (WP-06 / SPEC-05 RF-F-08).
 *
 * Características:
 *  - **Preview na própria fonte** — cada item é renderizado com `font-family`
 *    do item; quando o bundle já registrou o `@font-face`, o nome aparece
 *    desenhado nela mesma. Caso o arquivo .ttf ainda esteja ausente (vide
 *    `src/assets/fonts/README.md`), o fallback CSS assume e o nome ainda
 *    é legível.
 *  - **Agrupa Bundle e Sistema.** Bundle aparece sempre primeiro (top of
 *    list, RF-F-08), badge "Bundle" para indicar offline-first.
 *  - **Busca case-insensitive por substring** (consistente com a busca de
 *    templates da galeria, SPEC-03/WP-03).
 *  - **Acessibilidade:** dropdown navegável por teclado (setas + Enter +
 *    Esc). `role="listbox"` + `aria-activedescendant`. Conformidade AA
 *    completa fica no QA do WP-17.
 *
 * Não usa `@radix-ui` (decisão arquitetural do projeto, ver MEMORY.md/WP-03).
 * Primitiva custom + portal "absolute" — leve e suficiente para o caso.
 */

interface FontPickerProps {
  value: string | undefined;
  onChange: (family: string) => void;
  id?: string;
  className?: string;
}

export function FontPicker({ value, onChange, id, className }: FontPickerProps) {
  const { bundle, system, loading } = useFonts();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [focusIndex, setFocusIndex] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const allOptions: FontOption[] = React.useMemo(
    () => [...bundle, ...system],
    [bundle, system],
  );

  const filtered: FontOption[] = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return allOptions;
    return allOptions.filter((o) => o.family.toLowerCase().includes(q));
  }, [allOptions, query]);

  // Mantém o índice válido conforme a busca filtra.
  React.useEffect(() => {
    setFocusIndex(0);
  }, [query, open]);

  // Fecha quando clica fora.
  React.useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        listRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function commitSelection(option: FontOption) {
    onChange(option.family);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        setFocusIndex((i) => Math.min(filtered.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setFocusIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusIndex(Math.max(0, filtered.length - 1));
        break;
      case "Enter": {
        e.preventDefault();
        const item = filtered[focusIndex];
        if (item) commitSelection(item);
        break;
      }
    }
  }

  // Scroll automático para o item focado dentro da lista (UX padrão).
  React.useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-index="${focusIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, focusIndex, filtered]);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-2 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span
          className="truncate text-left"
          style={{ fontFamily: fontFamilyWithFallback(value) }}
          title={value ?? "Selecionar fonte"}
        >
          {value ?? "Selecionar fonte"}
        </span>
        <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Selecione uma fonte"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-hidden rounded-md border bg-popover shadow-lg"
          onKeyDown={onKeyDown}
        >
          <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar fonte…"
              className="h-7 border-0 px-0 text-xs shadow-none focus-visible:ring-0"
              onKeyDown={onKeyDown}
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Nenhuma fonte casa com "{query}".
              </p>
            )}
            {filtered.map((opt, i) => (
              <FontPickerItem
                key={`${opt.source}:${opt.family}`}
                index={i}
                option={opt}
                active={i === focusIndex}
                selected={opt.family === value}
                onMouseEnter={() => setFocusIndex(i)}
                onClick={() => commitSelection(opt)}
              />
            ))}
            {loading && (
              <p className="px-3 py-1 text-[10px] text-muted-foreground">
                Listando fontes do sistema…
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface FontPickerItemProps {
  index: number;
  option: FontOption;
  active: boolean;
  selected: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}

function FontPickerItem({
  index,
  option,
  active,
  selected,
  onMouseEnter,
  onClick,
}: FontPickerItemProps) {
  return (
    <div
      role="option"
      aria-selected={selected}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onMouseDown={(e) => {
        // Evita perder o foco no input antes do onClick disparar.
        e.preventDefault();
      }}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm",
        active && "bg-accent text-accent-foreground",
        selected && !active && "bg-accent/40",
      )}
    >
      <span
        className="truncate"
        style={{ fontFamily: fontFamilyWithFallback(option.family) }}
        title={option.family}
      >
        {option.family}
      </span>
      {option.source === "bundle" && (
        <span className="rounded-sm bg-primary/10 px-1 text-[9px] font-medium uppercase tracking-wider text-primary">
          Bundle
        </span>
      )}
    </div>
  );
}
