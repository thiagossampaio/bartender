---
name: wp16-reliability
description: Decisões e gotchas do WP-16 (Autosave, Recovery, Logs, Lixeira)
metadata:
  type: project
---

# WP-16 — Confiabilidade

## Backend Rust

### Logging (`src-tauri/src/logs.rs`)
- Crate: `tracing` 0.1 + `tracing-subscriber` 0.3 (features `fmt`, `env-filter`)
  + `tracing-appender` 0.2. Sem `chrono` feature — `tracing-subscriber` formata
  `SystemTime` por padrão (suficiente; quem quiser fuso local pode adicionar
  depois sem mexer no resto).
- Paths via `app.path().app_log_dir()` — Tauri 2.x já resolve para
  `~/Library/Logs/<identifier>` (macOS) e `%LOCALAPPDATA%\<id>\logs\` (Win).
- Rotação diária via `tracing_appender::rolling::daily`; arquivos nomeados
  `etiquetador.log.YYYY-MM-DD`. Retenção 7 dias OR 10 MiB agregado, o que
  vier antes. GC roda no startup ANTES do appender abrir.
- Panic hook encadeado: escreve `tracing::error!` e chama o hook anterior
  (preserva backtrace do Rust em dev).
- Comandos: `logs_dir`, `log_event(level, message, target?)`. Frontend usa
  via `invoke("log_event", { level, message, target })`.

### Autosave (`src-tauri/src/autosave.rs`)
- Pasta: `app.path().app_cache_dir().join("autosave")`. Arquivo
  `autosave_<id>.json`. Escrita atômica (`*.tmp` → rename) para evitar
  parciais.
- Limite 8 MiB por snapshot. ID `<= 0` rejeitado.
- `AutosaveSnapshot { json, mtime_ms }` — campo `mtime_ms` em snake_case
  porque o serde default não converte; o frontend lê `raw.mtime_ms` direto.
- Comandos: `autosave_save`, `autosave_load`, `autosave_clear`, `autosave_dir`.
- Tauri converte arg names camelCase do JS para snake_case automaticamente:
  JS `{ templateId, canvasJson }` casa com Rust `template_id`/`canvas_json`.

## Frontend

### Logger (`src/lib/logger.ts`)
- `log.<level>(msg, ...rest)` + `log.scope("editor::autosave").info(...)`.
- Heurística Tauri: `"__TAURI_INTERNALS__" in window` (mesmo padrão do
  font-loader). Em browser puro → no-op para `invoke`, só `console.*`.
- `installGlobalErrorHandlers()` no `main.tsx` cobre `window.onerror` e
  `unhandledrejection`. ErrorBoundary chama `reportBoundaryError()` para
  React errors.

### ErrorBoundary (`src/components/ErrorBoundary.tsx`)
- Classe React (necessário para `componentDidCatch`).
- Dois modos: erro fatal (corta a árvore + recarregar) e erro global
  (overlay por cima sem perder o trabalho).
- "Copiar detalhes técnicos" via `navigator.clipboard.writeText` com fallback
  `execCommand("copy")`. ESLint `react-refresh/only-export-components`
  emite warnings na ErrorBoundary.tsx por causa dos helpers — aceitável.

### Autosave (`src/lib/autosave.ts`)
- Façade fina: `autosaveSave/Load/Clear`. `shouldOfferRecovery(mtime, updatedAt)`
  com `TOLERANCE_MS = 1500` para evitar falso-positivo (drift entre o
  `datetime('now')` do SQLite, que tem precisão de segundo, e o mtime em ms
  do arquivo).
- `dbTimestampToEpochMs` converte `YYYY-MM-DD HH:MM:SS` (UTC) → epoch ms.

### Editor integração (`src/components/editor/Editor.tsx`)
- Timer `setInterval(30_000)` enquanto editor aberto; só salva se `dirty`.
- Recovery check após `loadTemplate`: se snapshot mais novo que `updatedAt`,
  abre `RecoveryModal`. Aceitar substitui canvas + marca `dirty=true`
  (usuário decide quando confirmar via Salvar).
- `handleSave` e `handleSaveAsConfirm` chamam `autosaveClear()` após sucesso.

## Trash
- Já era SPEC-13 compliant desde WP-03 (sem auto-purge, `requireDoubleConfirm`
  em hard delete). Só adicionei mensagem explícita "permanecem aqui
  indefinidamente — não há purga automática" no header.

## Gotchas registrados
- `tracing::event!` exige `Level` em tempo de compilação. Para dispatch
  dinâmico de runtime → match expandindo cada arm com nível const.
- Variável `scope` (atalho para `scope = scope`) preferida sobre `target =
  tgt` para evitar confusão com a keyword `target:` da macro.
- `tracing-subscriber::fmt::time::ChronoLocal` exige feature `chrono` —
  evitada para não puxar crate adicional. Default `SystemTime` é suficiente
  para o MVP.
