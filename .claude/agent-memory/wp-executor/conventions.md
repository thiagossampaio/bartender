---
name: conventions
description: Convenções do projeto Etiquetador (Bartender) — stack Tauri 2.x, layout, scripts, padrões de import
metadata:
  type: project
---

# Convenções do projeto Etiquetador (Bartender)

## Stack confirmada (decisões fixadas em SPEC-01)

- **Desktop runtime:** Tauri 2.x (Rust + Webview). Electron foi descartado (R07).
- **Frontend:** React 18 + TypeScript 5 + Vite 5.
- **UI:** Tailwind CSS 3 + shadcn/ui (primitivas adicionadas sob demanda em `src/components/ui/`).
- **State:** Zustand (uso real começa em WP-03/04).
- **Forms:** react-hook-form + zod + @hookform/resolvers.
- **SQLite (WP-02):** `tauri-plugin-sql` (Rust 2.0.3 / JS `@tauri-apps/plugin-sql` 2.4.0).
  Migrations via `tauri_plugin_sql::Migration { version, description, sql, kind: MigrationKind::Up }`,
  registradas em `Builder::default().add_migrations(DB_URL, vec![...])`. O plugin
  rastreia em `_sqlx_migrations` (idempotência garantida).
  Conexão JS: `Database.load("sqlite:etiquetador.db")` — mesmo URL declarado no Rust.
- **PDF (futuro WP-08):** crate `printpdf`.
- **Barcodes (futuro WP-07):** `bwip-js` no frontend.
- **Versões:** `package.json` e `src-tauri/Cargo.toml` versionados em sync (SemVer).

## Layout do repo

```
/                       # Raiz contém package.json, vite.config.ts, tsconfig.json, Makefile, README.md
├── index.html          # Entry HTML (não em /public)
├── src/                # Frontend
│   ├── main.tsx        # ReactDOM root
│   ├── App.tsx         # Componente raiz
│   ├── components/ui/  # Primitivas shadcn/ui
│   ├── lib/utils.ts    # `cn()` helper (clsx + tailwind-merge)
│   ├── lib/db.ts       # Façade tipada do SQLite (WP-02) — usar em vez de chamar o plugin direto
│   └── styles/globals.css  # @tailwind layers + tokens HSL
├── src-tauri/          # Backend Rust + config Tauri
│   ├── Cargo.toml      # Lib name = `etiquetador_lib`
│   ├── tauri.conf.json # `productName: Etiquetador`, identifier: io.etiquetador.app
│   ├── migrations/     # SQL migrations (WP-02): 001_initial.sql, 002_soft_delete.sql
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs      # Builder + setup; registra plugins + comandos
│   │   └── db.rs       # WP-02: paths por SO, permissões, migrations(), comando `db_path`
│   ├── capabilities/default.json   # inclui sql:default + sql:allow-load/execute/select/close
│   ├── entitlements.plist (macOS Hardened Runtime)
│   ├── Info.plist
│   └── icons/          # PNG/ICO/ICNS (placeholders no WP-01)
├── specs/{work-plan.md, specs.md}
└── docs/prd.md
```

## Padrões de import

- Path alias `@/*` → `src/*` (configurado em `tsconfig.json` + `vite.config.ts`).
- Componentes shadcn/ui usam `import { cn } from "@/lib/utils"`.
- Acesso ao banco SEMPRE via `@/lib/db` (`getDatabase`, `dbQuery`, `dbExecute`,
  `getSetting`, `setSetting`, `dbPath`) — nunca importar `@tauri-apps/plugin-sql` direto.

## Scripts npm

| Script | O que faz |
|---|---|
| `npm run dev` | Vite dev server na porta 1420 (porta esperada pelo Tauri) |
| `npm run build` | `tsc --noEmit && vite build` → `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint em `.ts/.tsx` |
| `npm run tauri:dev` | Janela do app em modo dev |
| `npm run tauri:build` | Bundler completo (requer Rust toolchain) |
| `npm run tauri:build:mac` | `.dmg` universal Apple |
| `npm run tauri:build:win` | `.msi` x86_64-pc-windows-msvc |

## Makefile (atalhos)

`make install`, `make dev`, `make build`, `make build-mac`, `make build-win`,
`make typecheck`, `make lint`, `make audit-bundle`, `make clean`.

## CSP

CSP estrita em `index.html` + `tauri.conf.json`:
`default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'`.
No `tauri.conf.json` adicionamos `asset:` e `https://asset.localhost` para o
asset protocol do Tauri (necessário para imagens locais carregadas via JS).

## Auto-update

**Desabilitado.** `bundle.createUpdaterArtifacts = false` em `tauri.conf.json`.
Não declarar `updater` no `plugins:` do builder Rust.

## Offline-first

Nenhuma URL externa em runtime. `make audit-bundle` valida o bundle Vite. A
allowlist permite apenas strings de doc/namespace conhecidas (React error
decoder, w3.org XML namespaces, apple.com DTDs).

## Path do banco SQLite (WP-02)

- macOS: `~/Library/Application Support/io.etiquetador.app/etiquetador.db`
  (Tauri 2.x usa o `identifier` no `app_data_dir`, não o `productName` puro;
  é o comportamento padrão e SPEC-02 §"Comportamento esperado" tolera).
- Windows: `%APPDATA%\io.etiquetador.app\etiquetador.db` análogo.
- Permissões 0700 (dir) e 0600 (arquivo) aplicadas em Unix no `setup()`.
  Em Windows os ACLs do `%APPDATA%` já restringem.
