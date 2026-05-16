import { Button } from "@/components/ui/button";

/**
 * Placeholder inicial (WP-01). A galeria de templates entra em WP-03.
 * Mantemos a janela leve para cumprir o target de cold start ≤ 3 s.
 */
export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Etiquetador</h1>
        <p className="text-muted-foreground">
          Aplicativo desktop offline-first para criação e impressão de etiquetas.
        </p>
        <p className="text-xs text-muted-foreground">
          Bootstrap WP-01 — Tauri 2.x + React + TypeScript + Vite + Tailwind +
          shadcn/ui
        </p>
      </div>
      <Button variant="default" disabled>
        Galeria de templates (disponível em WP-03)
      </Button>
    </main>
  );
}
