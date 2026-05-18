# Procedimento de Release

Pipeline 100% no GitHub Actions. Você nunca precisa rodar `tauri build` localmente para Windows/Linux — só taggear.

## TL;DR — fluxo automatizado (recomendado)

Use o script `scripts/release.sh` (ou os targets do `Makefile`). Ele:

1. Valida que você está em `main`, com working tree limpo e em sync com `origin`.
2. Faz bump em `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json`.
3. Regenera `src-tauri/Cargo.lock`.
4. Roda os mesmos checks do `ci.yml` (typecheck + lint + build + audit + cargo check).
5. Cria commit `chore(release): vX.Y.Z` + tag anotada com changelog.
6. Faz push de `main` + tag — a tag dispara o workflow `release` no GitHub.

```bash
# Versão explícita
make release VERSION=0.1.1

# Ou bump semântico
make release-patch              # 0.1.0 → 0.1.1
make release-minor              # 0.1.0 → 0.2.0
make release-major              # 0.1.0 → 1.0.0

# Antes de rodar de verdade, sempre vale conferir
make release-dry-run VERSION=0.1.1
make release-dry-run BUMP=patch
```

Flags do script direto (`scripts/release.sh`):

| Flag | Efeito |
|---|---|
| `--version X.Y.Z` | Versão alvo explícita. |
| `--bump patch\|minor\|major` | Bump semver a partir do `package.json` atual. |
| `--dry-run` | Mostra o que faria, sem alterar nada. |
| `--skip-checks` | Pula typecheck/lint/build/cargo check. Use por sua conta. |
| `--no-push` | Cria commit+tag mas não dá push (review antes). |

Variáveis de ambiente:

- `SKIP_REMOTE_CHECK=1` — pula `git fetch` e diff vs `origin/main` (útil sem rede).

Acompanhe a pipeline:
- Actions: `https://github.com/thiagossampaio/bartender/actions`
- Release: `https://github.com/thiagossampaio/bartender/releases/latest`
- Site: `https://thiagossampaio.github.io/bartender/` (atualiza automaticamente quando a release publica).

## Fluxo manual (referência / fallback)

Se preferir manual, o procedimento original ainda funciona:

```bash
# 1. Bump de versão (3 arquivos, todos com a MESMA versão).
#    - package.json:        "version": "0.1.0"
#    - src-tauri/Cargo.toml: version = "0.1.0"
#    - src-tauri/tauri.conf.json: "version": "0.1.0"

# 2. Commit + tag + push.
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "chore(release): v0.1.0"
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main --tags
```

## Fluxo da pipeline

```
push de tag v0.1.0
      │
      ▼
┌───────────────┐
│   prepare     │  Valida que tag = package.json = Cargo.toml = tauri.conf.json
└──────┬────────┘
       ▼
┌───────────────┐
│ create-draft  │  Cria GitHub Release v0.1.0 em draft com release notes
└──────┬────────┘   auto-geradas (commits desde a última tag)
       ▼
┌──────────────────────────────────────────┐
│              build (matrix)              │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Windows  │  │  macOS   │  │  Linux  │ │  3 jobs paralelos
│  │  .msi    │  │ .dmg     │  │  .deb   │ │  ~12 min total
│  │          │  │ universal│  │ .AppImage│ │  com cache → ~4 min
│  └──────────┘  └──────────┘  └─────────┘ │
│   ↓ upload      ↓ upload      ↓ upload   │
│   └─────────────┴──────────────┘         │
│              ▼                           │
│      Assets na draft do passo 2          │
└──────────────────┬───────────────────────┘
                   ▼
            ┌──────────────┐
            │   publish    │  Promove draft → released, marca como Latest
            └──────────────┘
```

## Arquivos gerados

A versão é injetada pela CI; substitua `<v>` pela versão real (ex: `0.1.0`).

| Plataforma | Asset | Localização no runner |
|---|---|---|
| Windows 10/11 x64 | `Bartender_<v>_x64_pt-BR.msi` | `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/` |
| macOS universal | `Bartender_<v>_universal.dmg` | `src-tauri/target/universal-apple-darwin/release/bundle/dmg/` |
| macOS universal (raw .app) | `Bartender.app` (zipado) | `src-tauri/target/universal-apple-darwin/release/bundle/macos/` |
| Linux Debian/Ubuntu | `bartender_<v>_amd64.deb` | `src-tauri/target/release/bundle/deb/` |
| Linux AppImage | `bartender_<v>_amd64.AppImage` | `src-tauri/target/release/bundle/appimage/` |

A `tauri-action@v0` faz upload automaticamente — você só baixa pela aba **Releases** no GitHub.

## Re-rodar uma release que falhou

Cenário: pipeline rodou, Linux passou, macOS passou, Windows falhou por um problema transitório de runner.

1. **NÃO crie tag nova.** A draft v0.1.0 já existe e tem 2 dos 3 instaladores.
2. Vai em **Actions → release → Run workflow**.
3. Em "Tag para construir/republicar", digita `v0.1.0`.
4. Clica "Run workflow". A pipeline reusa a mesma tag e a mesma draft — só recria o asset que falhou.

> O job `prepare` reusa a versão validada. O `create-draft` é idempotente (atualiza a draft existente). O `build` da matrix faz upload _replace_ — o asset antigo é sobrescrito.

## Tag retraída / release sem efeito

Se quiser remover uma release inteira (ex: bug crítico descoberto após publish):

```bash
# Apaga release + tag no remoto
gh release delete v0.1.0 --yes --cleanup-tag

# Apaga a tag local
git tag -d v0.1.0
```

## Assinatura digital (futura)

A pipeline detecta automaticamente se os secrets de signing estão configurados (passo "Detectar credenciais de signing" em `release.yml`). O comportamento:

| Estado dos secrets | Comportamento |
|---|---|
| **Vazios ou ausentes** (default) | Build prossegue sem assinatura. Usuários abrem com Ctrl+clique (macOS) ou "Executar assim mesmo" (Windows SmartScreen). |
| **Conjunto macOS completo** (`APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD` + `APPLE_SIGNING_IDENTITY`) | DMG assinado com Developer ID. |
| **Conjunto macOS completo + Apple ID** (acima + `APPLE_ID` + `APPLE_PASSWORD` + `APPLE_TEAM_ID`) | DMG assinado e notarizado. |
| **`TAURI_SIGNING_CERTIFICATE_THUMBPRINT`** preenchida | MSI assinado (cert precisa estar no Windows runner). |

> **Importante:** **NÃO cadastre os secrets com valor placeholder ou vazio.** O guard do workflow só ativa o signing se TODOS os secrets do conjunto correspondente tiverem valor real. Se você cadastrou `APPLE_CERTIFICATE` mas não tem o `.p12` ainda, **apague o secret** — não deixe ele cadastrado vazio.

### macOS (Apple Developer Program — ~US$99/ano)

| Secret | Conteúdo |
|---|---|
| `APPLE_CERTIFICATE` | Certificado .p12 codificado em base64 |
| `APPLE_CERTIFICATE_PASSWORD` | Senha do .p12 |
| `APPLE_SIGNING_IDENTITY` | Ex: `Developer ID Application: Seu Nome (XXXXXXXXXX)` |
| `APPLE_ID` | Email da conta Apple Developer |
| `APPLE_PASSWORD` | App-specific password (não a senha real do iCloud) |
| `APPLE_TEAM_ID` | Team ID de 10 caracteres |

### Windows (certificado EV/Standard — vários fornecedores)

| Secret | Conteúdo |
|---|---|
| `TAURI_SIGNING_CERTIFICATE_THUMBPRINT` | Thumbprint hex do certificado instalado |

> Para signing **inline** (cert dentro do CI sem máquina Windows pré-configurada), é preciso lógica adicional. Documentaremos quando o cert for adquirido.

## Site institucional (GitHub Pages)

Logo após o `release.yml` concluir com sucesso, o workflow `pages.yml`
dispara automaticamente (via `workflow_run`) e rebuilda o site
`https://thiagossampaio.github.io/bartender/` injetando a versão recém-publicada
nos links de download.

Você não precisa fazer nada manual. Para forçar um rebuild:

```bash
gh workflow run pages.yml
```

Detalhes: [`site/README.md`](../site/README.md) e o workflow em
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml).

## Custos / quotas

- **Free plan privado:** 2.000 minutos/mês de Actions. Cada release consome ~30 min sem cache, ~10 min com cache. Dá tranquilo para releases semanais.
- **Free plan público:** ilimitado.
- **Linux runners são gratuitos** (1×); **macOS = 10× minutos**; **Windows = 2× minutos**. Ou seja, 1 release ≈ 60 minutos de quota efetiva. Trate macOS como o custo dominante.

## Validar localmente antes de taggear

```bash
# Frontend (todos os checks que o CI roda)
npm run typecheck
npm run lint
npm run build
make audit-bundle

# Backend
cd src-tauri && cargo test --lib
```

Se tudo verde local, a release tem ~95% de chance de passar na CI. Falhas residuais costumam ser deps de Linux (apt) ou signing transitório.
