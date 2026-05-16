import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalErrorHandlers, log } from "./lib/logger";
import "./styles/globals.css";

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
