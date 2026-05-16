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
  Decisão WP-03: **NÃO usar @radix-ui** — primitivas customizadas (Dialog, DropdownMenu, etc.)
  são leves, mantêm CSP estrito e dispensam dep nova. Padrão: arquivo por primitiva, sempre
  React.forwardRef quando possível, `cn()` para merge de classes.
- **State:** Zustand. Stores em `src/lib/stores/<feature>-store.ts` (criado em WP-03).
- **Forms:** react-hook-form + zod + @hookform/resolvers (zod ainda não usado;
  o NewTemplateModal/RenameModal usam validação manual leve por enquanto).
- **Icons:** `lucide-react` (instalado desde WP-01).
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
│   ├── App.tsx         # Componente raiz (alterna Gallery/Trash via store em WP-03)
│   ├── components/
│   │   ├── ui/         # Primitivas shadcn/ui (button, input, label, card, dialog, dropdown-menu)
│   │   ├── gallery/    # WP-03: Gallery, TemplateCard, NewTemplateModal, RenameModal, ConfirmModal
│   │   └── trash/      # WP-03: Trash
│   ├── lib/
│   │   ├── utils.ts        # `cn()` helper (clsx + tailwind-merge)
│   │   ├── db.ts           # Façade tipada do SQLite (WP-02) — usar em vez de chamar o plugin direto
│   │   ├── templates.ts    # WP-03: serviço CRUD de templates (façade sobre dbQuery/dbExecute)
│   │   └── stores/         # Zustand stores
│   │       └── templates-store.ts  # WP-03: galeria/lixeira/CRUD
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
- **Operações sobre templates** (WP-03 em diante) SEMPRE via `@/lib/templates`,
  nunca SQL inline em componentes. O serviço encapsula naming snake_case → camelCase
  e regras como pickDuplicateName.

## Decisões arquiteturais por WP

### WP-03 — Padrão de comandos
- WP-03 lista "Comandos Tauri" no plano, mas seguimos o **padrão estabelecido por WP-02**:
  CRUD vive no frontend (`@/lib/templates.ts`) usando `dbQuery`/`dbExecute`. Justificativa:
  o plugin-sql já oferece SQL parametrizado seguro; duplicar a ponte no Rust só faria sentido
  se houvesse lógica não-trivial de auditoria (não há). Quando WP-04+ trouxer regras de
  negócio (autosave, geração de PDF), aí vale a pena migrar para comandos Rust.
- Não usar `@radix-ui` para Dialog/Dropdown — primitivas customizadas em `components/ui/`
  são suficientes e mais leves.

### WP-05 — Editor: Undo/Redo, atalhos, save, thumbnail
- Histórico undo/redo no `editor-store` é ring buffer simples (`past[]`/`future[]`)
  com snapshots rasos `{canvas, objects, selectedIds}`. Limite `HISTORY_LIMIT = 50`.
  Toda mutação que altera canvas chama `pushHistory()` (zera `future`).
- Atalhos centralizados em `useEditorShortcuts` (hook global em document.keydown).
  Suporta ⌘ no macOS e Ctrl no resto (ambos aceitos sempre). Ignora inputs/textarea,
  exceto Ctrl/⌘+S que precisa funcionar sempre. Inclui +Z/+Shift+Z/+Y, +C/X/V/D/A,
  +S/+Shift+S, +/−/0, Delete, Esc, setas (Shift = 10mm).
- Geração de thumbnail: `generateThumbnailPng()` em `lib/canvas/thumbnail.ts` —
  monta `Konva.Stage` off-screen (div absolute oculto), renderiza objetos sem
  zoom/grid/transformer, `stage.toDataURL({ pixelRatio })` → `Uint8Array`. Lado
  maior limitado a 256px. Persistido no BLOB `templates.thumbnail_png`.
- TemplateCard carrega thumbnail via `templatesGetThumbnail(id)` que devolve
  `Uint8Array | null` (BLOB do SQLite vem como `number[]`); converte para
  ObjectURL com `thumbnailToObjectUrl()` e revoga no cleanup. Cache invalida
  quando `updatedAt` muda.
- `templatesSaveAs(sourceId, newName, canvasJson, thumbnailPng?)` clona
  dimensões/dpi/orientation do source mas usa o `canvas_json` em memória; faz
  desconflito de nome via `pickDuplicateName()`.
- Gotcha TS: `new Blob([uint8Array])` falha em libs recentes (ArrayBufferLike vs
  ArrayBuffer). Copiar para ArrayBuffer fresh antes (`new ArrayBuffer(n)` →
  `Uint8Array(buf).set(bytes)`).
- Gotcha Konva: `Layer.add(node)` exige `Group | Shape`, não o base `Konva.Node`
  retornado por funções genéricas. Cast explícito quando necessário.

### WP-06 — Sistema Tipográfico
- **Catálogo declarativo:** `src/lib/canvas/fonts.ts` lista as 15 famílias do
  bundle (`BUNDLE_FONTS`) com `cssFallback` por família — quando o `.ttf` está
  ausente em `src/assets/fonts/`, o navegador usa o fallback CSS e a UI continua
  funcional. Default global = `Inter` (`DEFAULT_FONT_FAMILY`).
- **Arquivos `.ttf` NÃO commitados:** `src/assets/fonts/README.md` documenta a
  origem canônica de cada um. CI/release público deve baixar antes do build.
- **Registro `@font-face` em runtime:** `font-loader.ts` usa
  `import.meta.glob('/src/assets/fonts/*.{ttf,otf,woff,woff2}', { eager: true, query: '?url' })`
  + Web `FontFace` API. Isso evita falha de build quando os arquivos não
  existem — diferente de declarar `@font-face` em CSS estático, que faria o
  Vite reclamar de URLs não resolvidas.
- **Hook `useFonts()`:** mescla bundle (sempre) + sistema (via `invoke("fonts_list_system")`).
  Detecta Tauri por `"__TAURI_INTERNALS__" in window`; em browser puro usa
  `COMMON_SYSTEM_FONTS` como fallback. NÃO use `document.fonts.values()` para
  listar fontes do SO — Web API bloqueia isso por privacidade desde 2022.
- **Backend `fonts.rs`:** comando `fonts_list_system` via crate `font-kit`
  (cobre DirectWrite/Core Text/fontconfig). `BTreeSet` deduplica e ordena.
  `Ok(vec![])` em erro raro (sem fontes) — frontend ainda mostra o bundle.
- **Auto-shrink (RF-F-10):** loop iterativo até 24 passos em `TextObjectNode`
  com `Konva.Text.measureSize` (cria nó desanexado, mede `getClientRect`,
  `destroy`). Limite inferior 4 pt. Apenas reduz `fontSize` visual — o valor
  persistido permanece o desejado.
- **`fontFamilyWithFallback(family)`:** sempre use isso ao passar `fontFamily`
  para Konva (`Text`, thumbnail). Garante fallback CSS válido quando o usuário
  selecionou uma fonte do bundle ainda não baixada.
- **PropertiesPanel:** Bold/Italic/Underline/Strike são `ToggleChip` com
  `aria-pressed`. Alinhamento idem (4 botões). Letter-spacing em px,
  line-height multiplicador. Toggle "Auto-shrink" como switch ARIA.
- **Cargo.toml:** adiciona `font-kit` + `fontdue`. `fontdue` é placeholder
  para WP-10 (pipeline raster compartilhado, mitigação R02) — registrado
  agora para evitar re-discussão.

### WP-04 — Editor (Konva)
- **Konva 9.x + react-konva 18.2.16** (NÃO usar react-konva ^19, que exige React 19).
- Pixel base do canvas: **`MM_TO_PX = 4`** (em `src/lib/canvas/units.ts`). Zoom é um Konva
  `scale` independente — toda a serialização permanece em mm, sem depender do zoom/tela.
- Conversão pt→px: `fontSize * 1.333 * zoom` (Konva mede em px; 1 pt ≈ 1.333 px a 96 dpi).
- O `editor-store` (Zustand) **não** chama o banco. A página `Editor` faz `templatesGet` +
  `templatesGetCanvasJson`, popula o store via `loadTemplate`. `closeEditor` no
  templates-store recarrega a galeria. Save persistido entra em WP-05.
- Tipo `barcode`/`qrcode` aparecem no schema desde já (round-trip do `canvas_json`) mas o
  **render real** fica para WP-07 — no editor mostramos placeholder amarelo "WP-07".
- Histórico undo/redo + atalhos completos + thumbnail entram em WP-05. WP-04 entrega
  apenas atalhos básicos (Delete, Backspace, setas, Esc) gerenciados no `CanvasArea`.
- Layout do editor: 3 colunas via flex (Toolbar 176px / CanvasArea flex-1 / PropertiesPanel 288px).
- **App.tsx** é um simples switch enum-based em 3 views (`gallery|trash|editor`). Quando
  adicionar mais views ou deep-links, migrar para `react-router`.

### Auditoria offline-first com Konva
- Konva minificado contém URLs de documentação (github.com/konvajs/..., konvajs.github.io/docs/...,
  konvajs.org/docs/...) que são impressas em warnings — NÃO são requisições.
- `Makefile audit-bundle` foi atualizado para incluir essas no allowlist.
- **Cuidado:** evite hard-coded strings com `https://` em defaults de objetos do canvas
  (ex.: QR Code placeholder). Use texto neutro tipo `"QR_PLACEHOLDER"`.

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

## SQLite gotchas registradas
- Plugin-sql usa placeholders `$1, $2, ...` (estilo Postgres/sqlx), não `?`.
- `INSERT` retorna `lastInsertId: number | undefined`; verificar antes de usar.
- `datetime('now')` retorna `YYYY-MM-DD HH:MM:SS` em UTC sem 'Z' — para formatar
  em JS, trocar espaço por 'T' e anexar 'Z' antes do `new Date(...)`.
- FK em `print_history` referencia `templates.id` mas SEM `ON DELETE`; `templates_hard_delete`
  remove explicitamente as linhas de `print_history` associadas antes do DELETE do template
  (defensivo — se `PRAGMA foreign_keys=ON` estiver ligado um dia, a operação continua atômica).
