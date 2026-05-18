#!/usr/bin/env bash
#
# Release automatizado do Bartender.
#
# Resumo do que faz:
#   1. Valida estado do repo (branch main, working tree limpo, sync com remote).
#   2. Calcula a nova versão (explícita ou bump semver).
#   3. Atualiza as 3 fontes de verdade: package.json, src-tauri/Cargo.toml,
#      src-tauri/tauri.conf.json — depois atualiza Cargo.lock.
#   4. Roda os pré-checks do CI localmente (typecheck, lint, build frontend,
#      auditoria offline-first, cargo check).
#   5. Cria commit `chore(release): vX.Y.Z` + tag anotada.
#   6. Faz push de main + tag (a tag dispara o workflow `release`).
#
# Uso:
#   scripts/release.sh --version 0.1.1
#   scripts/release.sh --bump patch        # minor | major | patch
#   scripts/release.sh --bump minor --dry-run
#   scripts/release.sh --version 0.1.1 --skip-checks
#   scripts/release.sh --version 0.1.1 --no-push   # commita+tag sem subir
#
# Variáveis de ambiente:
#   SKIP_REMOTE_CHECK=1    Pula validação `git fetch && diff vs origin/main`.

set -euo pipefail

# ─── cores ────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  BOLD=$(tput bold) DIM=$(tput dim) RED=$(tput setaf 1) GREEN=$(tput setaf 2)
  YELLOW=$(tput setaf 3) BLUE=$(tput setaf 4) RESET=$(tput sgr0)
else
  BOLD="" DIM="" RED="" GREEN="" YELLOW="" BLUE="" RESET=""
fi

info()  { printf "%s▸%s %s\n" "$BLUE" "$RESET" "$*"; }
ok()    { printf "%s✓%s %s\n" "$GREEN" "$RESET" "$*"; }
warn()  { printf "%s!%s %s\n" "$YELLOW" "$RESET" "$*"; }
fail()  { printf "%s✗%s %s\n" "$RED" "$RESET" "$*" >&2; exit 1; }
step()  { printf "\n%s▶ %s%s\n" "$BOLD" "$*" "$RESET"; }

# ─── parsing de args ──────────────────────────────────────────────────────────
VERSION=""
BUMP=""
DRY_RUN=0
SKIP_CHECKS=0
NO_PUSH=0

usage() {
  cat <<EOF
${BOLD}Uso:${RESET}
  $0 --version X.Y.Z    [opções]
  $0 --bump patch|minor|major    [opções]

${BOLD}Opções:${RESET}
  --dry-run        Mostra o que faria sem alterar nada.
  --skip-checks    Pula typecheck/lint/build/cargo check (use por sua conta).
  --no-push        Cria commit+tag mas não dá push (review local antes).
  -h, --help       Mostra esta ajuda.

${BOLD}Exemplos:${RESET}
  $0 --bump patch
  $0 --version 0.2.0
  $0 --version 1.0.0 --dry-run
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)      VERSION="${2:?--version exige um valor}"; shift 2 ;;
    --bump)         BUMP="${2:?--bump exige patch|minor|major}"; shift 2 ;;
    --dry-run)      DRY_RUN=1; shift ;;
    --skip-checks)  SKIP_CHECKS=1; shift ;;
    --no-push)      NO_PUSH=1; shift ;;
    -h|--help)      usage; exit 0 ;;
    *)              fail "Argumento desconhecido: $1 (--help para ajuda)" ;;
  esac
done

if [[ -z "$VERSION" && -z "$BUMP" ]]; then
  usage; exit 1
fi
if [[ -n "$VERSION" && -n "$BUMP" ]]; then
  fail "Use --version OU --bump, não os dois."
fi

# ─── localização do repo (script pode ser chamado de qualquer pwd) ────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ─── ferramentas obrigatórias ─────────────────────────────────────────────────
for cmd in node git; do
  command -v "$cmd" >/dev/null || fail "Ferramenta '$cmd' não encontrada no PATH."
done

# Cargo costuma ficar em ~/.cargo/bin/ mas seu shell rc (~/.zshrc, ~/.bashrc)
# pode não exportar quando `make` invoca um subshell não-interativo. Tentamos
# carregar ~/.cargo/env transparente antes de exigir o binário.
if ! command -v cargo >/dev/null && [[ -f "$HOME/.cargo/env" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi
if ! command -v cargo >/dev/null && [[ -x "$HOME/.cargo/bin/cargo" ]]; then
  export PATH="$HOME/.cargo/bin:$PATH"
fi

# cargo é exigido apenas para o passo de checks; tolerado sem em --skip-checks.
if [[ $SKIP_CHECKS -eq 0 ]]; then
  command -v cargo >/dev/null || fail "Ferramenta 'cargo' não encontrada (procurei ~/.cargo/env e ~/.cargo/bin). Use --skip-checks se intencional ou ajuste seu PATH."
fi

# ─── estado do repo ───────────────────────────────────────────────────────────
step "Validando estado do repositório"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$BRANCH" == "main" ]] || fail "Você está na branch '$BRANCH'. Releases devem sair da 'main'."

if ! git diff --quiet || ! git diff --cached --quiet; then
  git status --short >&2
  fail "Working tree sujo. Commit ou stash antes de criar a release."
fi

if [[ "${SKIP_REMOTE_CHECK:-0}" != "1" ]]; then
  info "Sincronizando refs com origin (git fetch)…"
  git fetch origin --quiet
  LOCAL=$(git rev-parse @)
  REMOTE=$(git rev-parse '@{u}' 2>/dev/null || echo "")
  if [[ -n "$REMOTE" && "$LOCAL" != "$REMOTE" ]]; then
    BASE=$(git merge-base @ '@{u}')
    if [[ "$LOCAL" == "$BASE" ]]; then
      fail "Branch local está atrás de origin/main. Rode 'git pull' antes."
    elif [[ "$REMOTE" == "$BASE" ]]; then
      warn "Você tem commits locais não enviados. Considere 'git push' antes da release."
    else
      fail "main local divergiu de origin/main. Resolva antes de continuar."
    fi
  fi
fi
ok "Repo limpo e sincronizado."

# ─── descobre versão atual ────────────────────────────────────────────────────
CURRENT=$(node -p "require('./package.json').version")
CARGO_VER=$(grep -E '^version[[:space:]]*=' src-tauri/Cargo.toml | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
CONF_VER=$(node -p "require('./src-tauri/tauri.conf.json').version")

step "Versões atuais"
printf "  package.json       %s\n" "$CURRENT"
printf "  Cargo.toml         %s\n" "$CARGO_VER"
printf "  tauri.conf.json    %s\n" "$CONF_VER"

if [[ "$CURRENT" != "$CARGO_VER" || "$CURRENT" != "$CONF_VER" ]]; then
  fail "Versões fora de sync ANTES do bump. Acerte manualmente antes de rodar o release."
fi
ok "Versões em sync."

# ─── calcula a nova versão ────────────────────────────────────────────────────
if [[ -n "$BUMP" ]]; then
  case "$BUMP" in
    major|minor|patch) ;;
    *) fail "--bump aceita patch|minor|major (recebido: '$BUMP')." ;;
  esac
  NEW=$(node -e "
    const [maj, min, pat] = process.argv[1].split('.').map(Number);
    const bump = process.argv[2];
    if (bump === 'major') console.log((maj + 1) + '.0.0');
    else if (bump === 'minor') console.log(maj + '.' + (min + 1) + '.0');
    else console.log(maj + '.' + min + '.' + (pat + 1));
  " "$CURRENT" "$BUMP")
else
  NEW="$VERSION"
fi

# valida semver
if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
  fail "Versão alvo inválida (semver): '$NEW'"
fi
if [[ "$NEW" == "$CURRENT" ]]; then
  fail "Versão alvo igual à atual ($NEW). Aborte ou escolha outra."
fi

TAG="v$NEW"
step "Versão alvo"
printf "  %s → %s%s%s   (tag: %s%s%s)\n" "$CURRENT" "$BOLD" "$NEW" "$RESET" "$BOLD" "$TAG" "$RESET"

# valida que a tag não existe local nem remoto
if git rev-parse "$TAG" >/dev/null 2>&1; then
  fail "Tag '$TAG' já existe localmente. Apague antes (git tag -d $TAG) ou escolha outra versão."
fi
if [[ "${SKIP_REMOTE_CHECK:-0}" != "1" ]] && git ls-remote --tags origin "refs/tags/$TAG" | grep -q "$TAG"; then
  fail "Tag '$TAG' já existe no remote. Escolha outra versão."
fi

# ─── dry-run? ─────────────────────────────────────────────────────────────────
if [[ $DRY_RUN -eq 1 ]]; then
  step "DRY-RUN — nenhuma alteração será feita"
  echo "  • package.json:       $CURRENT → $NEW"
  echo "  • Cargo.toml:         $CARGO_VER → $NEW"
  echo "  • tauri.conf.json:    $CONF_VER → $NEW"
  echo "  • Cargo.lock:         atualizado via 'cargo check'"
  echo "  • Commit:             chore(release): $TAG"
  echo "  • Tag:                $TAG (anotada)"
  if [[ $NO_PUSH -eq 0 ]]; then
    echo "  • Push:               origin main + $TAG"
  else
    echo "  • Push:               (--no-push — pulado)"
  fi
  exit 0
fi

# ─── confirmação interativa ───────────────────────────────────────────────────
if [[ -t 0 ]]; then
  printf "\n%sProsseguir com release %s%s? [y/N]%s " "$BOLD" "$BOLD" "$TAG" "$RESET"
  read -r CONFIRM
  case "$CONFIRM" in
    y|Y|yes|YES) ;;
    *) info "Abortado pelo usuário."; exit 0 ;;
  esac
fi

# ─── bump dos arquivos ────────────────────────────────────────────────────────
step "Atualizando arquivos de versão"

# package.json — node como editor preserva indentação 2-spaces sem reescrever ordem.
node -e "
  const fs = require('fs');
  const path = 'package.json';
  const json = JSON.parse(fs.readFileSync(path, 'utf8'));
  json.version = '$NEW';
  fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
"
ok "package.json"

# tauri.conf.json — mesma estratégia. Mantém ordem dos campos.
node -e "
  const fs = require('fs');
  const path = 'src-tauri/tauri.conf.json';
  const json = JSON.parse(fs.readFileSync(path, 'utf8'));
  json.version = '$NEW';
  fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
"
ok "src-tauri/tauri.conf.json"

# Cargo.toml — sed apenas na PRIMEIRA linha 'version = "..."' (a do [package]).
# `-i` portátil entre GNU sed (Linux) e BSD sed (macOS): usa arquivo temporário.
TMP=$(mktemp)
awk -v new="$NEW" '
  BEGIN { done = 0 }
  /^version[[:space:]]*=[[:space:]]*"[^"]+"/ && !done {
    sub(/"[^"]+"/, "\"" new "\"")
    done = 1
  }
  { print }
' src-tauri/Cargo.toml > "$TMP"
mv "$TMP" src-tauri/Cargo.toml
ok "src-tauri/Cargo.toml"

# Cargo.lock — `cargo check --locked` falharia; usamos `cargo check` sem --locked
# para regenerar a entrada do crate `bartender` no lockfile.
if command -v cargo >/dev/null; then
  info "Regenerando Cargo.lock…"
  ( cd src-tauri && cargo check --offline --quiet 2>/dev/null || cargo check --quiet )
  ok "src-tauri/Cargo.lock"
else
  warn "cargo ausente — Cargo.lock NÃO foi regenerado. O job 'prepare' do release.yml vai falhar até que você o regenere."
fi

# ─── checks de CI locais ──────────────────────────────────────────────────────
if [[ $SKIP_CHECKS -eq 0 ]]; then
  step "Rodando pré-checks (espelho do ci.yml)"

  info "npm run typecheck"
  npm run typecheck

  info "npm run lint"
  npm run lint

  info "npm run build (Vite)"
  npm run build

  info "make audit-bundle (offline-first)"
  make audit-bundle

  info "cargo check --locked"
  ( cd src-tauri && cargo check --locked )

  ok "Todos os checks passaram."
else
  warn "Pré-checks pulados (--skip-checks)."
fi

# ─── commit + tag ─────────────────────────────────────────────────────────────
step "Criando commit e tag"

git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock 2>/dev/null || true
git commit -m "chore(release): $TAG"
ok "commit criado"

# Tag anotada com a mensagem padrão + lista de commits desde a tag anterior
# (se houver). Útil quando o GitHub Release ainda não foi gerado.
PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || true)
if [[ -n "$PREV_TAG" ]]; then
  CHANGES=$(git log --pretty="format:- %s" "$PREV_TAG..HEAD")
else
  CHANGES=$(git log --pretty="format:- %s" -n 20)
fi

git tag -a "$TAG" -m "Bartender $TAG

Changes:
$CHANGES"
ok "tag '$TAG' criada"

# ─── push ─────────────────────────────────────────────────────────────────────
if [[ $NO_PUSH -eq 1 ]]; then
  step "Push pulado (--no-push)"
  echo "  Para enviar manualmente:"
  echo "    git push origin main"
  echo "    git push origin $TAG"
  exit 0
fi

step "Fazendo push"
git push origin main
ok "main enviada"
git push origin "$TAG"
ok "tag '$TAG' enviada"

# ─── pós-release ──────────────────────────────────────────────────────────────
REPO_SLUG=$(git remote get-url origin | sed -E 's|.*github.com[:/]([^/]+/[^/.]+)(\.git)?|\1|')
step "Release lançada"
echo
echo "  Acompanhe a pipeline em:"
echo "    ${BLUE}https://github.com/${REPO_SLUG}/actions${RESET}"
echo
echo "  Quando o job 'publish' terminar, a release fica em:"
echo "    ${BLUE}https://github.com/${REPO_SLUG}/releases/tag/${TAG}${RESET}"
echo
echo "  E o site é atualizado automaticamente em:"
echo "    ${BLUE}https://thiagossampaio.github.io/bartender/${RESET}"
