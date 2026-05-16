import { Gallery } from "@/components/gallery/Gallery";
import { Trash } from "@/components/trash/Trash";
import { useTemplatesStore } from "@/lib/stores/templates-store";

/**
 * Entry point (WP-03). A galeria é a tela inicial; alternamos para a Lixeira
 * via store quando o usuário clica no botão correspondente. Quando o Editor
 * entrar (WP-04), este componente cresce com um router mais robusto (provável
 * `react-router` ou um state machine no store).
 */
export default function App() {
  const view = useTemplatesStore((s) => s.view);
  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      {view === "gallery" ? <Gallery /> : <Trash />}
    </div>
  );
}
