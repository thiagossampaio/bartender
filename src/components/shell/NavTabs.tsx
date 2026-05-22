import { History as HistoryIcon, LayoutGrid, Menu as MenuIcon, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTemplatesStore, type AppView } from "@/lib/stores/templates-store";
import { cn } from "@/lib/utils";

interface TabDef {
  view: Exclude<AppView, "editor">;
  label: string;
  icon: LucideIcon;
}

const TABS: ReadonlyArray<TabDef> = [
  { view: "gallery", label: "Templates", icon: LayoutGrid },
  { view: "history", label: "Histórico", icon: HistoryIcon },
  { view: "trash", label: "Lixeira", icon: Trash2 },
];

/**
 * Grupo de navegação principal da toolbar. Estado ativo derivado do store.
 *
 * Estratégia responsiva (CSS-only, sem JS):
 *  - `≥md`: linha horizontal de Tabs com ícone (label visível em `≥lg`).
 *  - `<md`: dropdown "Menu" com os mesmos itens (overflow pattern).
 */
export function NavTabs() {
  const view = useTemplatesStore((s) => s.view);
  const setView = useTemplatesStore((s) => s.setView);

  return (
    <>
      <div className="hidden items-center gap-0.5 md:flex">
        {TABS.map((tab) => {
          const active = view === tab.view;
          const Icon = tab.icon;
          return (
            <Tooltip key={tab.view}>
              <TooltipTrigger asChild>
                <Button
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setView(tab.view)}
                  aria-current={active ? "page" : undefined}
                  aria-label={tab.label}
                  className={cn(
                    "h-8 gap-1.5 px-2.5",
                    active && "shadow-sm",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden lg:inline">{tab.label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{tab.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="h-8 w-8"
            aria-label="Abrir menu de navegação"
          >
            <MenuIcon className="h-4 w-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[10rem]">
            {TABS.map((tab) => {
              const active = view === tab.view;
              const Icon = tab.icon;
              return (
                <DropdownMenuItem
                  key={tab.view}
                  onClick={() => setView(tab.view)}
                  className={cn("gap-2", active && "bg-accent text-accent-foreground")}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
