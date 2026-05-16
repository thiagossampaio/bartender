import { Editor } from "@/components/editor/Editor";
import { Gallery } from "@/components/gallery/Gallery";
import { History } from "@/components/history/History";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { useOnboardingState } from "@/components/onboarding/useOnboardingState";
import { Trash } from "@/components/trash/Trash";
import { useTemplatesStore } from "@/lib/stores/templates-store";

/**
 * Entry point.
 *
 * WP-03 alternava entre Galeria e Lixeira via store. WP-04 acrescenta a view
 * `editor`; WP-15 adiciona a view `history`. Quando um router mais robusto
 * for necessário (deep-links, histórico de navegação), trocamos por
 * `react-router` — por ora este switch enum-based é o suficiente.
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
      {view === "gallery" && <Gallery />}
      {view === "trash" && <Trash />}
      {view === "editor" && <Editor />}
      {view === "history" && <History />}
      <OnboardingTour
        open={onboarding.status === "pending"}
        onClose={() => {
          void onboarding.markCompleted();
        }}
      />
    </div>
  );
}
