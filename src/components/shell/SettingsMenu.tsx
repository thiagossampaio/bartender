import * as React from "react";
import { Info, Settings as SettingsIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import pkg from "../../../package.json";

const APP_VERSION = (pkg as { version?: string }).version ?? "0.0.0";

/**
 * Menu "Configurações" da AppToolbar.
 *
 * Hoje contém apenas "Sobre" (mostra versão da app). Funciona como ponto de
 * entrada estável para adições futuras (theme toggle, abrir pasta de dados,
 * preferências) sem precisar mexer no layout da toolbar.
 */
export function SettingsMenu() {
  const [aboutOpen, setAboutOpen] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="h-8 w-8"
          aria-label="Configurações"
          title="Configurações"
        >
          <SettingsIcon className="h-4 w-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          <DropdownMenuItem onClick={() => setAboutOpen(true)} className="gap-2">
            <Info className="h-4 w-4" aria-hidden="true" />
            Sobre o Bartender
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogHeader>
          <DialogTitle>Bartender</DialogTitle>
          <DialogDescription>
            Aplicativo desktop offline-first para criação e impressão de
            etiquetas.
          </DialogDescription>
        </DialogHeader>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Versão</dt>
          <dd className="font-mono">{APP_VERSION}</dd>
        </dl>
      </Dialog>
    </>
  );
}
