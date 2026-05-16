import { Editor } from "@/components/editor/Editor";
import { Gallery } from "@/components/gallery/Gallery";
import { Trash } from "@/components/trash/Trash";
import { useTemplatesStore } from "@/lib/stores/templates-store";

/**
 * Entry point.
 *
 * WP-03 alternava entre Galeria e Lixeira via store. WP-04 acrescenta a view
 * `editor`. Quando um router mais robusto for necessário (deep-links,
 * histórico de navegação), trocamos por `react-router` — por ora este
 * switch enum-based é o suficiente.
 */
export default function App() {
  const view = useTemplatesStore((s) => s.view);
  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      {view === "gallery" && <Gallery />}
      {view === "trash" && <Trash />}
      {view === "editor" && <Editor />}
    </div>
  );
}
