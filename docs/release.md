# Procedimento de Release

Pipeline 100% no GitHub Actions. Você nunca precisa rodar `tauri build` localmente para Windows/Linux — só taggear.

## TL;DR

```bash
# 1. Bump de versão (3 arquivos, todos com a MESMA versão).
#    Use search-and-replace ou um script seu.
#    - package.json:        "version": "0.1.0"
#    - src-tauri/Cargo.toml: version = "0.1.0"
#    - src-tauri/tauri.conf.json: "version": "0.1.0"

# 2. Commit + tag + push.
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: bump para 0.1.0"
git tag v0.1.0
git push origin main --tags

# 3. Acompanha a pipeline em:
#    https://github.com/thiagossampaio/bartender/actions

# 4. Quando os 4 jobs verdes, a release sai de "draft" automaticamente e
#    fica em:
#    https://github.com/thiagossampaio/bartender/releases/latest
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

A pipeline já lê os secrets — basta cadastrá-los em `Settings → Secrets and variables → Actions`. Sem secrets, o build sai sem assinatura (Windows mostra SmartScreen warning; macOS exige Ctrl+clique para abrir).

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
