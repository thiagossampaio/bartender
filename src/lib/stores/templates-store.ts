/**
 * Templates store (WP-03).
 *
 * Concentra o estado da Galeria e da Lixeira para evitar prop-drilling entre
 * `Gallery`, `Trash`, `NewTemplateModal`, `RenameModal` e `ConfirmDeleteModal`.
 *
 * O store NÃO é fonte da verdade — o SQLite é. Sempre que uma operação muta o
 * banco (`templatesCreate`, `templatesSoftDelete`, ...), o action re-carrega
 * do banco (`refresh`) para refletir invariantes que o SQL aplica (ex.: ordem
 * por `updated_at` desc, índices). Isso simplifica edge cases vs. patches
 * locais e mantém a UX consistente com o que o editor (WP-04+) lê depois.
 */

import { create } from "zustand";

import {
  type CreateTemplateInput,
  type TemplateRow,
  templatesCreate,
  templatesDuplicate,
  templatesHardDelete,
  templatesList,
  templatesListTrashed,
  templatesRename,
  templatesRestore,
  templatesSearch,
  templatesSoftDelete,
} from "@/lib/templates";

export type AppView = "gallery" | "trash" | "editor";

interface TemplatesState {
  view: AppView;
  /** Templates ativos exibidos na galeria (já filtrados por `searchTerm`). */
  active: TemplateRow[];
  /** Templates deletados exibidos na lixeira. */
  trashed: TemplateRow[];
  /** Id do template aberto no editor (`null` quando view !== 'editor'). */
  editingId: number | null;
  /** Termo de busca atual (substring, case-insensitive). */
  searchTerm: string;
  /** True enquanto a lista está sendo (re)carregada do banco. */
  loading: boolean;
  /** Mensagem de erro da última operação; `null` quando ok. */
  error: string | null;

  setView: (view: AppView) => void;
  setSearchTerm: (term: string) => void;
  /** Carrega a lista correspondente à `view` atual a partir do banco. */
  refresh: () => Promise<void>;

  /** Abre o editor para um template existente (carrega no editor-store). */
  openEditor: (id: number) => void;
  /** Volta para a galeria fechando o editor. */
  closeEditor: () => void;

  createTemplate: (input: CreateTemplateInput) => Promise<TemplateRow>;
  duplicateTemplate: (id: number) => Promise<TemplateRow>;
  renameTemplate: (id: number, name: string) => Promise<TemplateRow>;
  softDeleteTemplate: (id: number) => Promise<void>;
  restoreTemplate: (id: number) => Promise<void>;
  hardDeleteTemplate: (id: number) => Promise<void>;
}

function describeError(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  if (typeof e === "string") {
    return e;
  }
  return "Erro inesperado.";
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  view: "gallery",
  active: [],
  trashed: [],
  editingId: null,
  searchTerm: "",
  loading: false,
  error: null,

  setView: (view) => {
    set({ view, error: null });
    // Recarrega ao trocar de view para refletir mudanças que aconteceram
    // enquanto o usuário estava no outro lado (ex.: restaurou e voltou).
    void get().refresh();
  },

  openEditor: (id) => {
    set({ view: "editor", editingId: id, error: null });
  },

  closeEditor: () => {
    set({ view: "gallery", editingId: null, error: null });
    void get().refresh();
  },

  setSearchTerm: (term) => {
    set({ searchTerm: term });
    void get().refresh();
  },

  refresh: async () => {
    const { view, searchTerm } = get();
    // O editor não precisa da lista global; carrega seu próprio template via
    // `templatesGetCanvasJson`. Refresh aqui seria desperdício.
    if (view === "editor") return;
    set({ loading: true, error: null });
    try {
      if (view === "gallery") {
        const rows = searchTerm.trim().length > 0
          ? await templatesSearch(searchTerm)
          : await templatesList();
        set({ active: rows });
      } else {
        const rows = await templatesListTrashed();
        set({ trashed: rows });
      }
    } catch (e) {
      set({ error: describeError(e) });
    } finally {
      set({ loading: false });
    }
  },

  createTemplate: async (input) => {
    set({ error: null });
    try {
      const row = await templatesCreate(input);
      await get().refresh();
      return row;
    } catch (e) {
      set({ error: describeError(e) });
      throw e;
    }
  },

  duplicateTemplate: async (id) => {
    set({ error: null });
    try {
      const row = await templatesDuplicate(id);
      await get().refresh();
      return row;
    } catch (e) {
      set({ error: describeError(e) });
      throw e;
    }
  },

  renameTemplate: async (id, name) => {
    set({ error: null });
    try {
      const row = await templatesRename(id, name);
      await get().refresh();
      return row;
    } catch (e) {
      set({ error: describeError(e) });
      throw e;
    }
  },

  softDeleteTemplate: async (id) => {
    set({ error: null });
    try {
      await templatesSoftDelete(id);
      await get().refresh();
    } catch (e) {
      set({ error: describeError(e) });
      throw e;
    }
  },

  restoreTemplate: async (id) => {
    set({ error: null });
    try {
      await templatesRestore(id);
      await get().refresh();
    } catch (e) {
      set({ error: describeError(e) });
      throw e;
    }
  },

  hardDeleteTemplate: async (id) => {
    set({ error: null });
    try {
      await templatesHardDelete(id);
      await get().refresh();
    } catch (e) {
      set({ error: describeError(e) });
      throw e;
    }
  },
}));
