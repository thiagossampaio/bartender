import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initI18n } from "./lib/i18n";
import { installGlobalErrorHandlers, log } from "./lib/logger";
import "./styles/globals.css";

// Inicializa o i18next antes de qualquer render React (WP-17 / SPEC-14).
// Como o backend é estático (JSON importado), a inicialização é síncrona
// e o app nunca pisca em chaves brutas.
initI18n();

// Instala handlers globais o quanto antes — qualquer rejeição assíncrona
// ou erro síncrono fora do React (event handlers, callbacks de Tauri) será
// canalizado para o `ErrorBoundary` e para o log do backend.
installGlobalErrorHandlers();
log.info("etiquetador frontend inicializado");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
