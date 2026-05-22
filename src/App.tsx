import { Editor } from "@/components/editor/Editor";
import { Gallery } from "@/components/gallery/Gallery";
import { History } from "@/components/history/History";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { useOnboardingState } from "@/components/onboarding/useOnboardingState";
import { AppShell } from "@/components/shell/AppShell";
import { Trash } from "@/components/trash/Trash";
import { useTemplatesStore } from "@/lib/stores/templates-store";

/**
 * Entry point.
 *
 * Views (Gallery / Trash / Editor / History) ficam envoltas em `AppShell`,
 * que renderiza a toolbar superior unificada (Brand + navegação + impressora
 * + configurações). Cada view continua responsável pelo seu conteúdo e
 * pelas ações contextuais (busca, importar, salvar, etc.).
 *
 * WP-17 acopla aqui o `OnboardingTour`: na primeira execução, lemos
 * `settings.onboarding_completed_v1` e exibimos o tour por cima da view
 * atual (sempre a Galeria, já que essa é a tela inicial pós-launch).
 */
export default function App() {
  const view = useTemplatesStore((s) => s.view);
  const onboarding = useOnboardingState();
  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <AppShell>
        {view === "gallery" && <Gallery />}
        {view === "trash" && <Trash />}
        {view === "editor" && <Editor />}
        {view === "history" && <History />}
      </AppShell>
      <OnboardingTour
        open={onboarding.status === "pending"}
        onClose={() => {
          void onboarding.markCompleted();
        }}
      />
    </div>
  );
}
