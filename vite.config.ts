import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tauri expõe a porta do dev server através de TAURI_DEV_HOST quando rodando via `tauri dev`.
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Tauri usa um schema custom (`tauri://`) — habilitar source maps inline ajuda o debug.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Ignorar o diretório do Rust para não disparar reload no frontend.
      ignored: ["**/src-tauri/**"],
    },
  },
  // Bundling: sem dependências de rede em runtime. Tudo local.
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
