# Etiquetador — atalhos locais de build.
#
# Os comandos `build-win` e `build-mac` produzem instaladores assinados.
# Cross-compile não é suportado: cada SO deve ser buildado na sua plataforma nativa.

.PHONY: install dev build build-frontend build-mac build-win typecheck lint clean audit-bundle

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
audit-bundle:
	@echo "Procurando referências http(s):// no bundle (excluindo allowlist)..."
	@if grep -RnE 'https?://[a-zA-Z0-9]' dist 2>/dev/null \
		| grep -vE 'reactjs\.org/docs/error-decoder|www\.w3\.org|www\.apple\.com/DTDs|github\.com/konvajs/|konvajs\.github\.io/docs/|konvajs\.org/docs/'; then \
		echo "FALHA: URLs externas detectadas fora da allowlist."; \
		exit 1; \
	else \
		echo "OK: bundle livre de endpoints externos (auditoria SPEC-01)."; \
	fi

clean:
	rm -rf node_modules dist src-tauri/target src-tauri/gen
