import * as React from "react";
import { ChevronDown, Crosshair, Printer as PrinterIcon, TestTube2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PrinterToolsModal,
  type PrinterToolMode,
} from "@/components/history/PrinterToolsModal";

/**
 * Botão "Impressora" da AppToolbar (SPEC-12 itens 3 e 4).
 *
 * Antes vivia inline em `Gallery.tsx`; foi promovido para a AppShell e fica
 * disponível em todas as views. Abre o `PrinterToolsModal` reutilizando o
 * fluxo já existente para Calibrar / Imprimir página de teste.
 *
 * Não tem Tooltip envolvendo o trigger: o chevron + aria-label já comunicam
 * "menu desdobrável"; em `≥lg` o label "Impressora" aparece inline.
 */
export function PrinterMenuButton() {
  const [tool, setTool] = React.useState<PrinterToolMode | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="h-8 w-auto gap-1 px-2 text-foreground"
          aria-label="Menu da impressora"
          title="Impressora"
        >
          <PrinterIcon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden text-sm font-medium lg:inline">Impressora</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[14rem]">
          <DropdownMenuItem
            onClick={() => setTool("calibrate")}
            className="gap-2"
          >
            <Crosshair className="h-4 w-4" aria-hidden="true" />
            Calibrar impressora…
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setTool("test")}
            className="gap-2"
          >
            <TestTube2 className="h-4 w-4" aria-hidden="true" />
            Imprimir página de teste…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <PrinterToolsModal
        open={tool !== null}
        mode={tool ?? "calibrate"}
        onOpenChange={(open) => {
          if (!open) setTool(null);
        }}
      />
    </>
  );
}
