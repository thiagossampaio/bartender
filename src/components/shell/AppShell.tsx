import * as React from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AppToolbar } from "@/components/shell/AppToolbar";

/**
 * Wrapper de layout global: toolbar no topo + área da view abaixo.
 *
 * O `TooltipProvider` envolve toda a árvore para que qualquer botão da app
 * (toolbar, sub-bars das views, etc.) possa usar Tooltip sem reinstanciar
 * o provider.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={150}>
      <div className="flex h-full w-full flex-col">
        <AppToolbar />
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </TooltipProvider>
  );
}
