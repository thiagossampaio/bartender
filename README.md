# Etiquetador

Aplicativo desktop offline-first para criação, edição e impressão de etiquetas.
Stack: **Tauri 2.x + React + TypeScript + Vite + Tailwind CSS + shadcn/ui**.

> **Status atual:** WP-01 (Bootstrap). A galeria, o editor e a impressão entram nas WPs seguintes — veja [`specs/work-plan.md`](./specs/work-plan.md).

## Pré-requisitos

| Ferramenta | Versão mínima | Observações |
|---|---|---|
| Node.js | 20 LTS | Recomendado via [nvm](https://github.com/nvm-sh/nvm) |
| npm | 10+ | Acompanha o Node 20 |
| Rust toolchain | 1.77+ | Instale via [rustup](https://rustup.rs/): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Tauri CLI | 2.x | Instalado como devDependency (`@tauri-apps/cli`) — não é necessário `cargo install tauri-cli` |

### Pré-requisitos específicos por SO

**macOS (12 Monterey ou superior):**

- Xcode Command Line Tools: `xcode-select --install`
- Para builds universais (Intel + Apple Silicon):
  - `rustup target add aarch64-apple-darwin x86_64-apple-darwin`
- Para notarização Apple (R04): conta Apple Developer ativa e variáveis de ambiente:
  - `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`, `APPLE_SIGNING_IDENTITY`.

**Windows 10 (1809) / 11 x64:**

- [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) com workload "Desktop development with C++".
- [WebView2 Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (geralmente já instalado em Win 10/11 atualizado).
- Para assinatura de instalador: certificado EV/standard de Code Signing. Configure a thumbprint em `src-tauri/tauri.conf.json > bundle.windows.certificateThumbprint` ou exporte `TAURI_SIGNING_CERTIFICATE_THUMBPRINT`.

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
# Janela do app em modo dev (HMR + DevTools).
make dev
# ou:
npm run tauri:dev
```

> Cold start alvo: ≤ 3 s (validação completa em [WP-17](./specs/work-plan.md#wp-17--polimento-i18n-pt-br-onboarding-acessibilidade-aa-atalhos-finais-qa-hardware)).

## Build de produção

| SO | Comando | Saída |
|---|---|---|
| macOS | `make build-mac` | `src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg` |
| Windows | `make build-win` | `src-tauri/target/release/bundle/msi/*.msi` |

> Cross-compile não é suportado. Use a plataforma alvo para cada build.

## Auditoria de bundle offline-first

```bash
make build-frontend
make audit-bundle
```

A meta é que **zero URLs externas** apareçam no bundle final (sem CDN, sem
telemetria, sem auto-update — todos requisitos do SPEC-01).

## Estrutura do projeto

```
.
├── index.html                  # Entry HTML (Vite)
├── package.json                # Scripts e deps do frontend
├── postcss.config.js           # Tailwind + Autoprefixer
├── tailwind.config.js          # Tema shadcn/ui
├── tsconfig.json               # TS config (alias `@/*` → `src/*`)
├── vite.config.ts              # Config Vite + integração Tauri
├── Makefile                    # Atalhos de build
├── src/                        # Frontend React
│   ├── App.tsx                 # Placeholder inicial
│   ├── main.tsx                # ReactDOM root
│   ├── components/ui/          # Primitivas shadcn/ui (button.tsx)
│   ├── lib/utils.ts            # `cn()` helper
│   └── styles/globals.css      # Tailwind layers + tokens
├── src-tauri/                  # Backend Rust + config Tauri
│   ├── Cargo.toml
│   ├── tauri.conf.json         # Bundle, CSP, identifier
│   ├── entitlements.plist      # Hardened Runtime macOS
│   ├── Info.plist              # Metadados macOS
│   ├── capabilities/           # Permissões por janela
│   ├── icons/                  # Ícones (placeholders por enquanto)
│   └── src/                    # main.rs, lib.rs
├── specs/                      # Spec e work-plan
└── docs/                       # PRD
```

## Versionamento

Adota [SemVer](https://semver.org/). Versões devem ser mantidas em sync entre
`package.json` e `src-tauri/Cargo.toml` antes de cada release.

## Auto-update

**Desabilitado por design.** Atualizações são distribuídas como novos
instaladores. Veja `bundle.createUpdaterArtifacts = false` em
`src-tauri/tauri.conf.json`.

## Próximas WPs

Consulte [`specs/work-plan.md`](./specs/work-plan.md) para o roteiro completo
(WP-02 banco SQLite → WP-03 galeria → WP-04 editor → ... → WP-17 polimento).
