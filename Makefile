# Bartender — atalhos locais de build.
#
# Os comandos `build-win` e `build-mac` produzem instaladores assinados.
# Cross-compile não é suportado: cada SO deve ser buildado na sua plataforma nativa.

.PHONY: install dev build build-frontend build-mac build-win typecheck lint clean audit-bundle \
        release release-dry-run release-patch release-minor release-major

install:
	npm install

dev:
	npm run tauri:dev

build-frontend:
	npm run build

build:
	npm run tauri:build

# macOS: gera .dmg universal (Intel + Apple Silicon) notarizado quando creds
# `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_SIGNING_IDENTITY`
# estiverem exportadas no ambiente (mitigação R04).
build-mac:
	npm run tauri:build:mac

# Windows: gera .msi assinado quando a thumbprint do certificado estiver
# configurada em `src-tauri/tauri.conf.json > bundle.windows.certificateThumbprint`
# OU exportada via `TAURI_SIGNING_CERTIFICATE_THUMBPRINT`.
build-win:
	npm run tauri:build:win

typecheck:
	npm run typecheck

lint:
	npm run lint

# Auditoria simples de URLs/strings de rede no bundle final (cumpre o critério
# de aceite "auditoria de bundle confirma zero CDN/endpoint" do SPEC-01).
# Roda DEPOIS de `make build-frontend`.
#
# Allowlist (não são requisições de rede, apenas strings de documentação ou
# namespaces XML em libs conhecidas):
#   - reactjs.org/docs/error-decoder.html  → URL impressa pelo React quando
#     há erro minificado. Nunca é fetchada.
#   - www.w3.org/...                       → namespaces XML/SVG/XHTML.
#   - www.apple.com/DTDs/...               → DTD do plist do macOS.
#   - github.com/konvajs/react-konva/...   → links para issues impressos em
#     mensagens de erro do react-konva quando o usuário usa API errada.
#   - konvajs.github.io/docs/...           → docs do Konva impressos em warnings.
#   - konvajs.org/docs/...                 → idem (CORS/Tainted Canvas help).
#   - fonts.google.com/download            → string literal em barcode.ps do
#     bwip-js (instrução para baixar Inter para uso PostScript). Nunca fetched.
#   - github.com/rsms/inter/releases/...   → idem (instrução no docstring).
#   - id.gs1.org/01/...                    → exemplo de payload GS1 em
#     comentário/teste do bwip-js. Não é uma requisição.
#   - goo.gl/0bis e www.abc.net            → exemplos de payload em testes do
#     bwip-js para QR/maxicode. Não fetchadas.
#   - github.com/mholt/PapaParse           → URL do projeto do papaparse impressa
#     em constante de configuração (WP-12). Nunca fetchada.
#   - schemas.openxmlformats.org/..., purl.oclc.org/..., schemas.microsoft.com/...,
#     sheetjs.com, sheetjs.openxmlformats.org → namespaces XML do OOXML (XLSX) e
#     identificadores do SheetJS impressos em strings literais do parser xlsx (WP-12).
#     São identificadores XMLNS, não endpoints de rede.
audit-bundle:
	@echo "Procurando referências http(s):// no bundle (excluindo allowlist)..."
	@if grep -RnE 'https?://[a-zA-Z0-9]' dist 2>/dev/null \
		| grep -vE 'reactjs\.org/docs/error-decoder|www\.w3\.org|www\.apple\.com/DTDs|github\.com/konvajs/|konvajs\.github\.io/docs/|konvajs\.org/docs/|fonts\.google\.com/download|github\.com/rsms/inter/releases|id\.gs1\.org/|goo\.gl/0bis|www\.abc\.net|github\.com/mholt/PapaParse|purl\.oclc\.org/|schemas\.microsoft\.com/|schemas\.openxmlformats\.org/|sheetjs\.com|sheetjs\.openxmlformats\.org'; then \
		echo "FALHA: URLs externas detectadas fora da allowlist."; \
		exit 1; \
	else \
		echo "OK: bundle livre de endpoints externos (auditoria SPEC-01)."; \
	fi

clean:
	rm -rf node_modules dist src-tauri/target src-tauri/gen

# ─── Release ────────────────────────────────────────────────────────────────
#
# Pipeline automatizada de release. O script `scripts/release.sh`:
#   1. Valida estado do repo (main, clean, sync com origin).
#   2. Faz bump nas 3 fontes de verdade (package.json, Cargo.toml, tauri.conf.json).
#   3. Regenera Cargo.lock.
#   4. Roda os mesmos checks do ci.yml (typecheck + lint + build + audit + cargo check).
#   5. Cria commit `chore(release): vX.Y.Z` + tag anotada.
#   6. Faz push de main + tag — a tag dispara o workflow `release` no GitHub.
#
# Uso:
#   make release VERSION=0.1.1           # versão explícita
#   make release-patch                   # 0.1.0 → 0.1.1
#   make release-minor                   # 0.1.0 → 0.2.0
#   make release-major                   # 0.1.0 → 1.0.0
#   make release-dry-run VERSION=0.1.1   # mostra o que faria sem aplicar

release:
	@[ -n "$(VERSION)" ] || { echo "Uso: make release VERSION=X.Y.Z"; exit 1; }
	@scripts/release.sh --version $(VERSION)

release-dry-run:
	@if [ -n "$(VERSION)" ]; then \
		scripts/release.sh --version $(VERSION) --dry-run; \
	elif [ -n "$(BUMP)" ]; then \
		scripts/release.sh --bump $(BUMP) --dry-run; \
	else \
		echo "Uso: make release-dry-run VERSION=X.Y.Z  ou  make release-dry-run BUMP=patch|minor|major"; exit 1; \
	fi

release-patch:
	@scripts/release.sh --bump patch

release-minor:
	@scripts/release.sh --bump minor

release-major:
	@scripts/release.sh --bump major
