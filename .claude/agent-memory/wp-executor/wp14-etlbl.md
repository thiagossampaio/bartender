---
name: wp14-etlbl
description: WP-14 Import/Export .etlbl — formato ZIP + manifest sha256 + schema serde strict + sanitização de imagens
metadata:
  type: project
---

# WP-14 — Import/Export `.etlbl`

## Decisões de design

- **Pacote ZIP** com `template.json` (objeto JSON, não string!), `manifest.json`,
  `thumbnail.png` (opcional) e diretório `assets/` (vazio no MVP — reservado
  para futura externalização de imagens grandes).
- **Imagens inline mantidas como data URLs** no campo `src` dos `image` objects
  do `canvas_json`. Garante round-trip 100 % fidelidade com a representação
  interna (banco também armazena data URLs inline). Sanitização ocorre por
  decodificar e revalidar cada data URL como PNG/JPEG/SVG.
- **Hash sha256** cobre `template.json` bytes + qualquer arquivo em `assets/`
  (ordem lexicográfica do nome). Como `assets/` é vazio no MVP, é o sha256 do
  conteúdo JSON canônico. Comparação em tempo constante.
- **Schema strict:** `#[serde(deny_unknown_fields)]` em TODOS os structs
  aninhados (`TemplateJson`, `CanvasJson`, `CanvasDef`, `BaseFields`, `Binding`,
  todos os `*Obj` por tipo). Tag `type` discriminado em `CanvasObject` —
  rejeita tipos desconhecidos por design (defesa em profundidade PRD §6.5).
- **`origin_app_version`** registrado no `template.json` como informacional;
  a regra de compatibilidade real é `manifest.schema_version`. Forward-compat:
  app rejeita pacote com `schema_version > ETLBL_SCHEMA_VERSION` (=1).
- **Path traversal:** entradas do ZIP com `..` ou caminho absoluto rejeitadas
  no `inspect`.

## Arquitetura backend × frontend

- Rust faz **apenas** validação de pacote (hash, schema, sanitização) e
  geração/leitura do ZIP. Não toca o banco. Justificativa: o acesso SQLite
  vive no JS via `tauri-plugin-sql` (decisão WP-02/03), evita replicar o
  handle só para `.etlbl`.
- Frontend (`src/lib/etlbl.ts`) orquestra: lê do banco para export, chama o
  Rust, depois grava no banco no import (com resolução de conflito).

## Comandos Tauri

- `etlbl_export(payload: ExportPayload) -> Result<String, EtlblError>` —
  retorna o caminho gravado.
- `etlbl_inspect(file_path: String) -> Result<InspectResult, EtlblError>` —
  valida tudo e devolve dados prontos para o frontend confirmar conflito.

## Resolução de conflito de nome (modal 3 opções)

- **Substituir**: UPDATE in-place mantendo `id` (preserva FKs de
  `print_history`). `version` é incrementada.
- **Manter ambos**: INSERT com sufixo " (N)" começando em 2 (cobre múltiplos
  imports do mesmo arquivo).
- **Cancelar**: no-op.

Detecção via `findActiveByName(name)` — só considera ativos (não-deletados).

## Gotchas registradas

- **`zip` crate 0.6 sem `default-features`** + apenas `features=["deflate"]`
  evita OpenSSL/dep nativa pesada. Não preciso de bzip2/zstd para arquivos
  de etiqueta pequenos.
- **`epoch_to_civil`** implementado inline (Howard Hinnant) porque o projeto
  não usa `chrono`. Suficiente para timestamp ISO-8601 no `manifest.exported_at`.
- **`percent_decode` mínimo** implementado para data URLs SVG não-base64.
  Não dependo de `percent-encoding` crate (não está no Cargo).
- **PNG 1x1 hardcoded** nos testes para validar pipeline real do `image` crate
  sem depender de assets externos.
- **Sanitização SVG superficial:** apenas confere UTF-8 + presença de tag
  `<svg`. Não rodamos parser XML/HTML por enquanto (Konva tolera SVG
  malformado, e o objetivo aqui é bloquear payloads claramente não-SVG).

## Validações executadas

- `npm run typecheck` ok
- `npm run lint` ok (só pre-existing warning button.tsx)
- `npm run build` ok (1.96 MB bundle, idem antes)
- `make audit-bundle` ok
- `cargo check` NÃO rodado — Rust toolchain ausente neste host (documentado
  em preexisting-issues.md). Os testes unitários em `etlbl.rs` cobrem
  round-trip, hash mismatch, schema unknown field, schema version não
  suportada, ZIP corrompido, imagens inválidas/válidas — quem rodar
  `cargo test` deve ver verde.
