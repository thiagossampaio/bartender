import { Tags } from "lucide-react";

import { useTemplatesStore } from "@/lib/stores/templates-store";
import { cn } from "@/lib/utils";

/**
 * Marca "Bartender" no canto esquerdo da toolbar. Click leva à galeria
 * (equivalente ao "home" do app). Wordmark + glifo discreto, sem asset
 * externo — mantém o footprint minimalista.
 */
export function Brand({ className }: { className?: string }) {
  const setView = useTemplatesStore((s) => s.setView);
  return (
    <button
      type="button"
      onClick={() => setView("gallery")}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold tracking-tight",
        "transition-colors hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label="Ir para a galeria de templates"
    >
      <Tags className="h-4 w-4 text-primary" aria-hidden="true" />
      <span>Bartender</span>
    </button>
  );
}
