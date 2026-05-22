import { Separator } from "@/components/ui/separator";
import { Brand } from "@/components/shell/Brand";
import { NavTabs } from "@/components/shell/NavTabs";
import { PrinterMenuButton } from "@/components/shell/PrinterMenuButton";
import { SettingsMenu } from "@/components/shell/SettingsMenu";
import { useTemplatesStore } from "@/lib/stores/templates-store";

/**
 * Toolbar fixa no topo de todas as views. Estilo software desktop
 * (VS Code / Figma): altura compacta, grupos lógicos separados por
 * `Separator`, ações universais sempre acessíveis.
 *
 * Variantes:
 *  - **default**: Brand | NavTabs (Templates/Histórico/Lixeira) | … | Printer | Settings
 *  - **editor**:  Brand | … | Printer | Settings  (sem NavTabs — o Editor
 *    tem seu próprio back-button com dirty-check via `requestClose`)
 */
export function AppToolbar() {
  const view = useTemplatesStore((s) => s.view);
  const isEditor = view === "editor";

  return (
    <header
      role="banner"
      className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background px-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Brand />
        {!isEditor && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <NavTabs />
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        <PrinterMenuButton />
        <Separator orientation="vertical" className="h-6" />
        <SettingsMenu />
      </div>
    </header>
  );
}
