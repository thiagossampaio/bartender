# Especificações Estruturadas — Bartender

> Documento derivado de [`docs/prd.md`](../docs/prd.md) v1.0 (15 de maio de 2026).
> Todas as SPECs abaixo são autocontidas: o leitor não precisa abrir o PRD para implementar.
> Decisões de stack ambíguas no PRD foram fixadas na opção recomendada e suas alternativas movidas para "Riscos e Pontos Desconhecidos" do [Work Plan](./work-plan.md).

## Índice

- [SPEC-01 — Bootstrap, Infraestrutura e Build](#spec-01--bootstrap-infraestrutura-e-build)
- [SPEC-02 — Modelo de Dados e Persistência SQLite](#spec-02--modelo-de-dados-e-persistência-sqlite)
- [SPEC-03 — Gestão de Templates (Galeria, CRUD, Soft Delete)](#spec-03--gestão-de-templates-galeria-crud-soft-delete)
- [SPEC-04 — Editor de Layout WYSIWYG (Canvas Konva)](#spec-04--editor-de-layout-wysiwyg-canvas-konva)
- [SPEC-05 — Sistema Tipográfico](#spec-05--sistema-tipográfico)
- [SPEC-06 — Códigos de Barras 1D/2D](#spec-06--códigos-de-barras-1d2d)
- [SPEC-07 — Fontes de Dados (CSV/XLSX) e Impressão em Lote](#spec-07--fontes-de-dados-csvxlsx-e-impressão-em-lote)
- [SPEC-08 — Pré-visualização e Exportação PDF](#spec-08--pré-visualização-e-exportação-pdf)
- [SPEC-09 — Impressão via Driver do SO e Detecção de Impressoras](#spec-09--impressão-via-driver-do-so-e-detecção-de-impressoras)
- [SPEC-10 — Geração e Envio Raw PPLB/ZPL](#spec-10--geração-e-envio-raw-pplbzpl)
- [SPEC-11 — Import/Export de Templates (.etlbl)](#spec-11--importexport-de-templates-etlbl)
- [SPEC-12 — Histórico de Impressões, Calibração e Página de Teste](#spec-12--histórico-de-impressões-calibração-e-página-de-teste)
- [SPEC-13 — Confiabilidade (Autosave, Recovery, Logs, Lixeira)](#spec-13--confiabilidade-autosave-recovery-logs-lixeira)
- [SPEC-14 — Usabilidade (Atalhos, i18n, Onboarding, Acessibilidade, Performance)](#spec-14--usabilidade-atalhos-i18n-onboarding-acessibilidade-performance)

---

## SPEC-01 — Bootstrap, Infraestrutura e Build

**Objetivo**
> Estabelecer a base técnica do app (Tauri 2.x + React + TypeScript), o pipeline de build e os instaladores assinados/notarizados para Windows e macOS, garantindo distribuição offline-first sem auto-update.

**Contexto**
> Esta SPEC é o pré-requisito de todas as demais: sem app rodando não há editor, banco, impressão. Resolve o requisito de aplicação desktop standalone, single-user, 100% offline (PRD §1.3 e §3).

**Comportamento esperado**
> 1. Usuário baixa instalador da plataforma (`.msi` no Windows, `.dmg` no macOS).
> 2. Instala sem warnings de segurança (instaladores assinados; em macOS, notarizado pela Apple para passar Gatekeeper).
> 3. Ao abrir, janela inicial aparece em até 3 s (cold start) em hardware moderno.
> 4. App funciona com Wi-Fi/Ethernet desligados (verificável por auditoria).
> 5. Atualizações são manuais via download de novo instalador (sem auto-update).

**Regras de negócio**
> - DEVE usar **Tauri 2.x** (Rust + Webview nativo + frontend web). Alternativa Electron + electron-forge é registrada como [risco R07](./work-plan.md#riscos-e-pontos-desconhecidos).
> - DEVE compilar para **Windows 10 (1809) x64** e **macOS 12 Monterey universal** (Intel x64 + Apple Silicon).
> - DEVE gerar instaladores `.msi` (WiX, Tauri bundler nativo) no Windows e `.dmg` universal notarizado no macOS.
> - DEVE adotar **versionamento semântico** (`major.minor.patch`).
> - DEVE manter **auto-update DESABILITADO** (offline-first, single-user).
> - NÃO DEVE conter telemetria nem nenhuma requisição de rede após a instalação.
> - NÃO DEVE depender de CDN: todas as fontes do bundle (ver [SPEC-05](#spec-05--sistema-tipográfico)) e libs JS são bundled localmente.
> - SE plataforma é Apple Silicon, ENTÃO o `.dmg` deve ser universal (Intel + ARM); Rosetta 2 será requerida apenas para o driver Argox no macOS.

**Critérios de aceite**
> - DADO Windows 10/11 x64 limpo QUANDO executo o `.msi` ENTÃO o app instala sem warning de segurança.
> - DADO macOS 12+ (Intel ou Apple Silicon) QUANDO abro o `.dmg` e movo para Applications ENTÃO o Gatekeeper aceita o app sem bloqueio.
> - DADO o app instalado QUANDO abro pela primeira vez em hardware moderno ENTÃO a janela aparece em até 3 s.
> - DADO o app rodando QUANDO desligo Wi-Fi e Ethernet por uma sessão completa ENTÃO o app continua funcional.
> - DADO o build QUANDO inspeciono o bundle (auditoria de strings de URL e dependências de rede) ENTÃO não há nenhum endpoint embutido.

**Estado atual**
> Repositório vazio (apenas `docs/prd.md` e `.git`). Nenhum projeto, configuração de Tauri, build ou CI existe.

**Mudanças necessárias**
> - **Bootstrap:** projeto Tauri 2.x com template React + TypeScript + Vite.
> - **UI base:** Tailwind CSS + shadcn/ui configurados.
> - **State:** Zustand instalado (uso a partir de [SPEC-03](#spec-03--gestão-de-templates-galeria-crud-soft-delete) e [SPEC-04](#spec-04--editor-de-layout-wysiwyg-canvas-konva)).
> - **Forms:** react-hook-form + zod instalados.
> - **Bundler:** Tauri bundler configurado para `.msi` (Windows) e `.dmg` universal (macOS).
> - **Assinatura/Notarização:** entitlements Apple configurados; certificados de assinatura Windows configurados; notarização testada cedo (mitigação [risco R04](./work-plan.md#riscos-e-pontos-desconhecidos)).
> - **CI/Build:** pipeline reproduzível (recomendado GitHub Actions; mínimo: scripts locais).
> - **Versionamento:** `package.json` e `Cargo.toml` versionados em sync.
> - **README:** pré-requisitos e comando de build documentados.

**Definição de pronto**
> - [ ] Tauri 2.x + React + TypeScript + Vite + Tailwind + shadcn/ui rodando.
> - [ ] Build Windows produz `.msi` assinado.
> - [ ] Build macOS produz `.dmg` universal notarizado.
> - [ ] Cold start ≤ 3 s validado em hardware moderno (Win 10 + macOS 12).
> - [ ] Auditoria do bundle confirma zero requisições de rede.
> - [ ] Auto-update desabilitado.
> - [ ] README com pré-requisitos e build.
> - [ ] Código revisado por outro membro do time.

---

## SPEC-02 — Modelo de Dados e Persistência SQLite

**Objetivo**
> Implementar o banco SQLite local com migrations versionadas para persistir templates, histórico de impressões, impressoras conhecidas e configurações.

**Contexto**
> Toda persistência do app passa por este schema. Single-user, sem cloud sync; o arquivo `.db` reside em diretório padrão por SO. Pré-requisito para [SPEC-03](#spec-03--gestão-de-templates-galeria-crud-soft-delete), [SPEC-09](#spec-09--impressão-via-driver-do-so-e-detecção-de-impressoras), [SPEC-12](#spec-12--histórico-de-impressões-calibração-e-página-de-teste) e [SPEC-13](#spec-13--confiabilidade-autosave-recovery-logs-lixeira).

**Comportamento esperado**
> 1. Na primeira execução, o app cria o arquivo `bartender.db` no diretório padrão do SO e roda todas as migrations.
> 2. Em execuções subsequentes, roda apenas migrations novas (idempotência).
> 3. Atualizações do app preservam dados (migrations não destrutivas).
> 4. Se schema corrompido, exibe diálogo claro indicando o caminho do arquivo.

**Regras de negócio**
> - DEVE usar **SQLite via plugin Tauri (`tauri-plugin-sql`)**.
> - DEVE armazenar o banco em:
>   - **Windows:** `%APPDATA%\Bartender\bartender.db`
>   - **macOS:** `~/Library/Application Support/Bartender/bartender.db`
> - DEVE usar migrations versionadas (recomendado **`sqlx::migrate!`**; alternativa `refinery` registrada como [risco R11](./work-plan.md#riscos-e-pontos-desconhecidos)).
> - DEVE preservar dados entre upgrades (migrations idempotentes).
> - DEVE aplicar permissões de arquivo restritas ao usuário do SO.
> - NÃO DEVE permitir escrita concorrente de múltiplos processos do app.

**Schema obrigatório (reproduzido fiel ao PRD §4.2)**
>
> ```sql
> CREATE TABLE templates (
>     id              INTEGER PRIMARY KEY AUTOINCREMENT,
>     name            TEXT    NOT NULL,
>     description     TEXT,
>     width_mm        REAL    NOT NULL,
>     height_mm       REAL    NOT NULL,
>     dpi             INTEGER NOT NULL DEFAULT 203,   -- Argox OS-214 Plus = 203 dpi
>     orientation     TEXT    NOT NULL DEFAULT 'portrait', -- 'portrait' | 'landscape'
>     background_color TEXT   DEFAULT '#FFFFFF',
>     canvas_json     TEXT    NOT NULL,
>     thumbnail_png   BLOB,
>     created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
>     updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
>     version         INTEGER NOT NULL DEFAULT 1
> );
> CREATE INDEX idx_templates_name ON templates(name);
>
> CREATE TABLE print_history (
>     id              INTEGER PRIMARY KEY AUTOINCREMENT,
>     template_id     INTEGER NOT NULL,
>     printer_name    TEXT    NOT NULL,
>     mode            TEXT    NOT NULL,    -- 'driver' | 'raw_pplb' | 'raw_zpl'
>     quantity        INTEGER NOT NULL,
>     data_source     TEXT,                -- 'manual' | 'csv' | 'xlsx'
>     source_path     TEXT,
>     printed_at      TEXT    NOT NULL DEFAULT (datetime('now')),
>     FOREIGN KEY (template_id) REFERENCES templates(id)
> );
>
> CREATE TABLE printers (
>     id              INTEGER PRIMARY KEY AUTOINCREMENT,
>     system_name     TEXT    NOT NULL UNIQUE,
>     friendly_name   TEXT,
>     model           TEXT,                -- 'Argox OS-214 Plus', 'Zebra ZD220', etc.
>     language        TEXT,                -- 'PPLB' | 'PPLA' | 'ZPL' | 'DRIVER'
>     default_dpi     INTEGER DEFAULT 203,
>     is_default      INTEGER NOT NULL DEFAULT 0,
>     last_used_at    TEXT
> );
>
> CREATE TABLE settings (
>     key   TEXT PRIMARY KEY,
>     value TEXT NOT NULL
> );
> ```
>
> Adicionalmente, para suportar a **lixeira** (mitigação [risco R06](./work-plan.md#riscos-e-pontos-desconhecidos), referência cruzada com [SPEC-03](#spec-03--gestão-de-templates-galeria-crud-soft-delete)): coluna `deleted_at TEXT NULL` em `templates`, introduzida em **migration v2**.

**Critérios de aceite**
> - DADO um sistema sem o banco QUANDO abro o app pela primeira vez ENTÃO o arquivo `.db` é criado no path correto e todas as migrations rodam.
> - DADO o banco já existe na versão N QUANDO instalo uma versão do app com migrations adicionais ENTÃO as migrations adicionais rodam e dados anteriores ficam preservados.
> - DADO o banco corrompido QUANDO abro o app ENTÃO um diálogo de erro explica o problema e indica o caminho do arquivo.
> - DADO uma migration aplicada QUANDO ela é re-executada por engano ENTÃO não causa erro (idempotência).

**Estado atual**
> Não há banco nem migrations.

**Mudanças necessárias**
> - **Backend (Rust):** integrar `tauri-plugin-sql` com feature `sqlite`.
> - Diretório `migrations/` com `001_initial.sql` (schema acima) e `002_soft_delete.sql` (`ALTER TABLE templates ADD COLUMN deleted_at TEXT NULL`).
> - Comandos Tauri `db_query`, `db_execute` expostos ao frontend.
> - Inicialização do path do banco por SO.
> - Setting `schema_version` para tracking interno.
> - Permissões de arquivo restritas (validar via `ls -l`/ACL).

**Definição de pronto**
> - [ ] Plugin SQLite integrado e testado em Windows e macOS.
> - [ ] Schema completo aplicado via migration v1.
> - [ ] Migration v2 (`deleted_at` em `templates`) preparada.
> - [ ] Path do banco correto por SO.
> - [ ] Permissões de arquivo restritas.
> - [ ] Testes unitários cobrindo round-trip de cada tabela.
> - [ ] Código revisado.

---

## SPEC-03 — Gestão de Templates (Galeria, CRUD, Soft Delete)

**Objetivo**
> Permitir ao usuário listar, criar, duplicar, renomear, buscar e excluir templates, com lixeira para recuperação de exclusões acidentais.

**Contexto**
> Tela inicial do app após onboarding. Persiste na tabela `templates` definida em [SPEC-02](#spec-02--modelo-de-dados-e-persistência-sqlite). Cobre RF-T-01 a RF-T-09 do PRD §5.1 e o fluxo 9.1. Lixeira é mitigação para [risco R06](./work-plan.md#riscos-e-pontos-desconhecidos).

**Comportamento esperado**
> 1. Ao abrir o app, exibe Galeria com cards (thumbnail + nome + dimensões + data de modificação) ordenada por `updated_at` desc.
> 2. Botão **"Novo template"** abre modal: nome, dimensões (presets 50×30, 40×25, 100×50, ou custom em mm), DPI (default 203), orientação (portrait/landscape).
> 3. Campo de busca filtra por nome (case-insensitive, busca por substring — ver [risco R09](./work-plan.md#riscos-e-pontos-desconhecidos) sobre granularidade da busca).
> 4. Menu de contexto em cada card: **Duplicar**, **Renomear**, **Exportar** (delegado a [SPEC-11](#spec-11--importexport-de-templates-etlbl)), **Excluir**.
> 5. **Excluir** abre confirmação. Após confirmar, template vai para a lixeira (`deleted_at` preenchido).
> 6. Item separado de menu **"Lixeira"** lista deletados; permite **Restaurar** ou **Excluir definitivamente** (hard delete).
> 7. Botão **"Importar"** delegado a [SPEC-11](#spec-11--importexport-de-templates-etlbl).

**Regras de negócio (RF-T-01 a RF-T-09)**
> - DEVE listar templates com thumbnail, nome, dimensões e data de modificação (RF-T-01).
> - DEVE criar template a partir de presets ou dimensões custom em mm (RF-T-02).
> - PODE duplicar template existente (RF-T-03).
> - DEVE renomear template (RF-T-04).
> - DEVE excluir com confirmação (RF-T-05).
> - PODE buscar por nome — busca case-insensitive por substring (RF-T-06).
> - DEVE exportar para `.etlbl` — implementado em [SPEC-11](#spec-11--importexport-de-templates-etlbl) (RF-T-07).
> - DEVE importar `.etlbl` — implementado em [SPEC-11](#spec-11--importexport-de-templates-etlbl) (RF-T-08).
> - PODE versionar via `updated_at` e `version++` a cada salvamento (RF-T-09).
> - DEVE soft-delete (preencher `deleted_at`); NÃO remove fisicamente do banco.
> - SE template está com `deleted_at != NULL`, ENTÃO NÃO aparece na galeria; PODE ser restaurado pela lixeira ou removido fisicamente via "Excluir definitivamente".

**Critérios de aceite**
> - DADO galeria vazia QUANDO clico "Novo template", informo nome "T1", dimensões 50×30 mm, DPI 203, portrait ENTÃO um novo template aparece na galeria.
> - DADO um template "T1" QUANDO clico Duplicar ENTÃO surge "T1 (cópia)" com mesmo `canvas_json`.
> - DADO 5 templates com nomes variados QUANDO digito "te" na busca ENTÃO apenas templates com "te" no nome (case-insensitive) aparecem.
> - DADO um template QUANDO clico Excluir e confirmo ENTÃO ele some da galeria e aparece na Lixeira.
> - DADO um template na lixeira QUANDO clico Restaurar ENTÃO ele volta à galeria com seus dados intactos.
> - DADO um template na lixeira QUANDO clico "Excluir definitivamente" e confirmo ENTÃO ele é removido fisicamente do banco.

**Estado atual**
> Nenhuma UI nem comando. Tabela `templates` definida em [SPEC-02](#spec-02--modelo-de-dados-e-persistência-sqlite).

**Mudanças necessárias**
> - **Frontend:** páginas `Gallery` e `Trash`; modais `NewTemplateModal` e `RenameModal`. State via Zustand.
> - **Backend (Rust):** comandos Tauri `templates_list`, `templates_create`, `templates_duplicate`, `templates_rename`, `templates_soft_delete`, `templates_restore`, `templates_hard_delete`, `templates_search`.
> - **Thumbnail inicial** em branco (placeholder) na criação; substituído após primeira renderização do editor ([SPEC-04](#spec-04--editor-de-layout-wysiwyg-canvas-konva)).

**Definição de pronto**
> - [ ] Galeria renderiza thumbnails reais.
> - [ ] CRUD completo via UI.
> - [ ] Lixeira funcional (soft delete + restore + hard delete).
> - [ ] Busca por nome funcionando.
> - [ ] Confirmações em ações destrutivas.
> - [ ] Testes unitários para os comandos backend.
> - [ ] Código revisado.

---

## SPEC-04 — Editor de Layout WYSIWYG (Canvas Konva)

**Objetivo**
> Editor visual baseado em Konva.js que permite criar e editar etiquetas com posicionamento pixel-perfect, suportando texto, barcodes, imagens e formas geométricas.

**Contexto**
> Núcleo da experiência. O canvas serializa para `canvas_json` (formato definido no PRD §4.3, reproduzido abaixo) e é persistido em `templates.canvas_json` ([SPEC-02](#spec-02--modelo-de-dados-e-persistência-sqlite)). Cobre RF-E-01 a RF-E-20 do PRD §5.2 e o fluxo 9.1.

**Comportamento esperado**
> 1. Ao abrir um template, o canvas carrega o `canvas_json` e renderiza todos os objetos.
> 2. Toolbar lateral com tipos de objeto: **Texto, Barcode** (delegado a [SPEC-06](#spec-06--códigos-de-barras-1d2d)), **QR Code** (idem), **Imagem, Retângulo, Linha, Elipse**.
> 3. Ao clicar/arrastar um tipo no canvas, novo objeto é criado.
> 4. Objeto selecionado mostra handles para mover, redimensionar (com Shift mantém proporção), rotacionar.
> 5. Painel de propriedades à direita exibe X, Y, largura, altura, rotação, propriedades específicas do tipo.
> 6. Múltiplos objetos selecionáveis (Shift+click, lasso); permite alinhar e distribuir.
> 7. Atalhos: Ctrl/⌘ +C/+V/+X/+D/+Z/+Shift+Z/+S/+Shift+S, setas (passos de 1 mm), Shift+setas (passos de 10 mm), Delete.
> 8. Régua superior e lateral em mm. Grid configurável (1 mm ou 5 mm) com snap on/off.
> 9. Zoom em níveis fixos (25, 50, 75, 100, 150, 200, 400 %) e via Ctrl/⌘ +/-.
> 10. Indicação visual `•` no título da janela quando há mudanças não salvas.
> 11. Imagens (PNG, JPG, SVG) podem ser inseridas por drag-and-drop ou colagem.

**Regras de negócio (RF-E-01 a RF-E-20)**
> - Canvas DEVE estar em mm fiel à etiqueta real (RF-E-01).
> - Régua DEVE estar em mm (RF-E-02).
> - Grid DEVE ser configurável 1 ou 5 mm com snap on/off (RF-E-03).
> - Zoom DEVE ter os níveis fixos listados + atalhos `Ctrl/⌘ +/-` (RF-E-04).
> - DEVE inserir objeto de texto (RF-E-05).
> - DEVE inserir objeto de código de barras 1D (RF-E-06) — comportamento detalhado em [SPEC-06](#spec-06--códigos-de-barras-1d2d).
> - DEVE inserir objeto QR Code 2D (RF-E-07) — comportamento detalhado em [SPEC-06](#spec-06--códigos-de-barras-1d2d).
> - DEVE inserir objeto imagem (PNG, JPG, SVG) por arrastar arquivo ou colar (RF-E-08).
> - PODE inserir formas: retângulo, linha, elipse (RF-E-09).
> - DEVE permitir mover por mouse (drag) e teclado (setas, Shift+setas para passos maiores) (RF-E-10).
> - DEVE redimensionar com handles; Shift mantém proporção (RF-E-11).
> - DEVE rotacionar livre ou em múltiplos de 90° (RF-E-12).
> - DEVE ter painel de propriedades por seleção: X, Y, largura, altura, rotação (RF-E-13).
> - PODE alinhar entre múltiplos selecionados: esquerda, centro, direita, topo, meio, base (RF-E-14).
> - PODE distribuir entre 3+ objetos (horizontal/vertical) (RF-E-15).
> - PODE reordenar camadas: trazer para frente, mandar para trás, +1, -1 (RF-E-16).
> - DEVE ter undo/redo de pelo menos 50 estados (RF-E-17).
> - DEVE suportar atalhos: Ctrl/⌘+C, +V, +X, +D, +Z, +Shift+Z, Delete (RF-E-18).
> - DEVE salvar com Ctrl/⌘+S e indicar "não salvo" no título com `•` (RF-E-19).
> - PODE "Salvar como" com Ctrl/⌘+Shift+S, clonando como novo template (RF-E-20).

**Formato `canvas_json` (reproduzido fiel ao PRD §4.3)**
>
> ```json
> {
>   "version": 1,
>   "units": "mm",
>   "canvas": {
>     "width": 50,
>     "height": 30,
>     "dpi": 203,
>     "background": "#FFFFFF"
>   },
>   "objects": [
>     {
>       "id": "obj_1",
>       "type": "text",
>       "x": 2, "y": 2, "width": 46, "height": 6,
>       "rotation": 0,
>       "fontFamily": "Arial",
>       "fontSize": 12,
>       "fontWeight": "bold",
>       "fontStyle": "normal",
>       "textAlign": "left",
>       "color": "#000000",
>       "content": "{{ produto }}",
>       "binding": { "field": "produto", "fallback": "Camisa" }
>     },
>     {
>       "id": "obj_2",
>       "type": "barcode",
>       "x": 2, "y": 12, "width": 46, "height": 12,
>       "symbology": "CODE128",
>       "value": "{{ sku }}",
>       "showText": true,
>       "binding": { "field": "sku" }
>     },
>     {
>       "id": "obj_3",
>       "type": "text",
>       "x": 2, "y": 26,
>       "fontFamily": "Arial",
>       "fontSize": 10,
>       "content": "R$ {{ preco }}"
>     }
>   ]
> }
> ```
>
> Tipos de objeto suportados: `text`, `barcode`, `qrcode`, `image`, `rectangle`, `line`, `ellipse`. Cada objeto pode ter `binding: { field, fallback }` para campos dinâmicos (placeholders `{{ campo }}`).

**Critérios de aceite**
> - DADO um template novo 50×30 mm QUANDO arrasto Texto e digito "Hello" ENTÃO o objeto aparece no canvas e é persistido no `canvas_json` ao salvar.
> - DADO um objeto selecionado QUANDO arrasto handle de canto com Shift pressionado ENTÃO redimensiona mantendo proporção.
> - DADO 3 objetos selecionados QUANDO clico "alinhar à esquerda" ENTÃO os 3 ficam com mesmo X mínimo.
> - DADO realizei 60 ações QUANDO faço undo 50 vezes ENTÃO restauro pelo menos 50 estados anteriores.
> - DADO modifiquei o canvas e o título mostra `•` QUANDO pressiono Ctrl/⌘+S ENTÃO o `•` desaparece e o template é salvo.
> - DADO grid em 1 mm com snap on QUANDO movo um objeto via mouse ENTÃO posições aderem à grade.
> - DADO arrasto um arquivo PNG sobre o canvas QUANDO solto ENTÃO um objeto image é criado com o PNG.

**Estado atual**
> Nenhum editor implementado. Konva.js não está integrado.

**Mudanças necessárias**
> - **Frontend:** integrar Konva.js. Páginas/componentes: `Editor`, `Toolbar`, `CanvasArea`, `PropertiesPanel`, `Rulers`, `ZoomControls`.
> - **State:** editor store em Zustand (objetos, seleção, histórico undo/redo, zoom, grid, snap).
> - **Serialização:** funções `canvasToJson()` e `jsonToCanvas()`.
> - **Backend (Rust):** comando Tauri `template_save(id, canvas_json, thumbnail_png)`.
> - **Thumbnail:** geração off-screen (canvas Konva.toDataURL) ao salvar.

**Definição de pronto**
> - [ ] Todos os RF-E-XX funcionais.
> - [ ] `canvas_json` compatível com schema PRD §4.3.
> - [ ] Undo/redo ≥ 50 estados.
> - [ ] Atalhos cross-platform (Ctrl no Win, ⌘ no macOS).
> - [ ] Performance ≥ 60 FPS com 100 objetos (Layer caching do Konva).
> - [ ] Thumbnail gerado e salvo a cada save.
> - [ ] Testes E2E para criar/editar/salvar/abrir template.
> - [ ] Código revisado.

---

## SPEC-05 — Sistema Tipográfico

**Objetivo**
> Disponibilizar amplo catálogo de fontes (sistema + bundle) com estilos, alinhamentos, espaçamentos e auto-shrink — resolvendo a "pobreza tipográfica" do Word identificada no PRD §1.1.

**Contexto**
> Usado por objetos `text` do editor ([SPEC-04](#spec-04--editor-de-layout-wysiwyg-canvas-konva)). O bundle garante riqueza tipográfica mesmo em sistemas com poucas fontes; o catálogo do sistema permite total customização. Cobre RF-F-01 a RF-F-10 do PRD §5.3 e §6.4 (offline).

**Comportamento esperado**
> 1. No painel de propriedades de um texto, dropdown lista as 15+ fontes do bundle no topo (etiquetadas como "Bundle"), seguidas pelas fontes do sistema.
> 2. Cada item do dropdown é renderizado **com a própria fonte** (preview).
> 3. Estilos (Bold, Italic, Underline, Strikethrough) são botões toggle.
> 4. Tamanho aceita decimal (4 a 200 pt).
> 5. Cor via paleta + input HEX custom.
> 6. Alinhamentos: esquerda, centro, direita, justificado.
> 7. Texto com múltiplas linhas faz wrap automático dentro do bounding box.
> 8. Auto-shrink (toggle por objeto) reduz a fonte progressivamente até caber.

**Regras de negócio (RF-F-01 a RF-F-10 + §6.4)**
> - DEVE listar **todas** as fontes do sistema (RF-F-01).
> - DEVE empacotar **15+ fontes adicionais** licenciadas para uso comercial (RF-F-02). Lista mínima do PRD: Inter, Roboto, Open Sans, Montserrat, Poppins, Lato, Oswald, Bebas Neue, Playfair Display, Source Code Pro, JetBrains Mono, Libre Barcode 39, Libre Barcode 128. Todas SIL Open Font License.
> - DEVE suportar Bold, Italic, Underline, Strikethrough por objeto de texto (RF-F-03).
> - DEVE permitir tamanho 4 a 200 pt com decimal (ex.: 7.5) (RF-F-04).
> - PODE permitir cor custom (paleta + HEX) (RF-F-05).
> - DEVE permitir alinhamento esquerda/centro/direita/justificado (RF-F-06).
> - PODE permitir letter-spacing e line-height (RF-F-07).
> - PODE renderizar preview do nome da fonte com a própria fonte no seletor (RF-F-08).
> - DEVE quebrar texto automaticamente dentro do bounding box (RF-F-09).
> - PODE auto-shrink por objeto (RF-F-10).
> - NÃO DEVE buscar fontes via CDN (PRD §6.4 — fontes Google empacotadas como `.ttf`/`.woff2`).

**Critérios de aceite**
> - DADO um sistema sem "Inter" instalada QUANDO seleciono Inter no dropdown ENTÃO a fonte do bundle é usada e renderiza corretamente.
> - DADO um texto "Hello" QUANDO toggle Bold ENTÃO o texto fica negrito no canvas e no PDF gerado.
> - DADO um texto longo num bounding box pequeno com auto-shrink ON QUANDO renderizo ENTÃO a fonte é reduzida até caber.
> - DADO o app rodando offline QUANDO listo as fontes ENTÃO as 15+ do bundle aparecem mesmo sem internet.
> - DADO o seletor aberto QUANDO olho a lista ENTÃO cada nome de fonte é renderizado com a própria fonte.

**Estado atual**
> Nenhuma integração de fontes. Sistema de propriedades inicial vem com [SPEC-04](#spec-04--editor-de-layout-wysiwyg-canvas-konva).

**Mudanças necessárias**
> - **Backend (Rust):** comando `fonts_list_system()` usando `rust-fontconfig` + APIs nativas (CTFontCollection no macOS, DirectWrite/GDI no Windows).
> - **Bundle:** incluir 15 `.ttf`/`.woff2` em `assets/fonts/` empacotados no app.
> - **Frontend:** `@font-face` local; dropdown com previews; mesclar bundle + sistema.
> - **Wrap e auto-shrink:** Konva nativo para wrap; auto-shrink via loop binário de tamanho.
> - **Render unificado:** para o Modo B do PPLB ([SPEC-10](#spec-10--geração-e-envio-raw-pplbzpl)), usar `fontdue` ou `ab_glyph` no Rust, garantindo paridade pixel a pixel com o preview (mitigação [risco R02](./work-plan.md#riscos-e-pontos-desconhecidos)).

**Definição de pronto**
> - [ ] Todas as 15 fontes do bundle funcionais.
> - [ ] Lista de fontes do sistema correta em Win e macOS.
> - [ ] Estilos e alinhamentos ok.
> - [ ] Wrap e auto-shrink validados.
> - [ ] Pipeline de render unificado entre preview e PPLB raster.
> - [ ] Auditoria offline confirma zero CDN.
> - [ ] Código revisado.

---

## SPEC-06 — Códigos de Barras 1D/2D

**Objetivo**
> Suportar criação, validação e renderização vetorial de códigos de barras 1D e 2D com binding a campos dinâmicos.

**Contexto**
> Objetos `barcode` e `qrcode` no `canvas_json` ([SPEC-04](#spec-04--editor-de-layout-wysiwyg-canvas-konva)). Renderizado pelo editor, exportado em PDF ([SPEC-08](#spec-08--pré-visualização-e-exportação-pdf)) e impresso via comandos nativos PPLB/ZPL ou raster ([SPEC-10](#spec-10--geração-e-envio-raw-pplbzpl)). Cobre RF-B-01 a RF-B-08 do PRD §5.4.

**Comportamento esperado**
> 1. Ao inserir um Barcode/QR, dropdown lista as simbologias suportadas.
> 2. Painel de propriedades inclui: simbologia, valor (literal ou `{{ campo }}`), altura, módulo (espessura da barra), nível de correção (apenas QR), mostrar/ocultar HRT (Human Readable Text).
> 3. Validação em tempo real do valor conforme simbologia, com badge vermelho e mensagem.
> 4. Cálculo automático de dígito verificador onde aplicável (EAN-13, EAN-8, UPC-A, UPC-E, ITF mod-10).
> 5. Renderização vetorial (SVG) sempre que possível.

**Regras de negócio (RF-B-01 a RF-B-08)**
> - DEVE suportar 1D: **CODE128, CODE39, EAN-13, EAN-8, UPC-A, UPC-E, ITF (Interleaved 2 of 5), Codabar** (RF-B-01).
> - DEVE suportar 2D: **QR Code, Data Matrix, PDF417** (RF-B-02).
> - DEVE permitir mostrar/ocultar HRT (RF-B-03).
> - DEVE permitir configurar altura, módulo, nível de correção QR (RF-B-04).
> - DEVE validar valor em tempo real conforme simbologia (RF-B-05). Ex.: EAN-13 exige 12 ou 13 dígitos numéricos.
> - DEVE renderizar em alta resolução vetorial (RF-B-06).
> - DEVE calcular dígito verificador automaticamente onde aplicável (RF-B-07).
> - DEVE permitir vincular valor a campo de fonte de dados via `binding.field` (RF-B-08).
> - SE simbologia 1D nativa estiver disponível na impressora-alvo, ENTÃO preferir comando nativo da impressora (delegado a [SPEC-10](#spec-10--geração-e-envio-raw-pplbzpl)).

**Critérios de aceite**
> - DADO simbologia EAN-13 QUANDO informo "789123456789" (12 dígitos) ENTÃO o 13º (verificador) é calculado e o barcode renderiza.
> - DADO simbologia EAN-13 QUANDO informo "ABC" ENTÃO badge de erro mostra "EAN-13 exige apenas dígitos numéricos".
> - DADO um QR Code QUANDO seleciono nível H de correção ENTÃO o QR fica mais denso e suporta corrupção até 30%.
> - DADO um barcode com `binding.field = "sku"` QUANDO o template é impresso com dado SKU=123 ENTÃO o barcode codifica "123".
> - DADO toggle "Mostrar HRT" off QUANDO renderizo ENTÃO não há texto embaixo do barcode.

**Estado atual**
> Nada implementado.

**Mudanças necessárias**
> - **Frontend:** integrar **bwip-js** (Barcode Writer in Pure JavaScript) — suporta todas as simbologias do PRD, mantida, produz SVG/Canvas. Recomendação do PRD §5.4. Alternativa `bwip-rs` registrada como [risco R11](./work-plan.md#riscos-e-pontos-desconhecidos).
> - Componente `<BarcodeRenderer />` para canvas Konva e para preview no PDF.
> - Validadores por simbologia (zod).
> - Calculadora de dígito verificador.
> - Painel de propriedades específico para barcode/QR.

**Definição de pronto**
> - [ ] Todas as simbologias 1D/2D do PRD funcionais.
> - [ ] Validações com feedback em tempo real.
> - [ ] Vetorial em PDF (barcode nítido em qualquer zoom).
> - [ ] Binding a campos dinâmicos validado.
> - [ ] Testes unitários para validadores e dígito verificador.
> - [ ] Código revisado.

---

## SPEC-07 — Fontes de Dados (CSV/XLSX) e Impressão em Lote

**Objetivo**
> Importar planilhas (CSV/XLSX), mapear colunas a placeholders do template e imprimir em lote com filtros e quantidades — resolvendo o caso de uso C4 ("imprimir lote a partir de planilha", alta frequência).

**Contexto**
> Recurso "data-driven printing" inspirado no BarTender (PRD §5.5). Conecta o editor (placeholders em [SPEC-04](#spec-04--editor-de-layout-wysiwyg-canvas-konva)) aos modos de impressão ([SPEC-09](#spec-09--impressão-via-driver-do-so-e-detecção-de-impressoras), [SPEC-10](#spec-10--geração-e-envio-raw-pplbzpl)) e ao histórico ([SPEC-12](#spec-12--histórico-de-impressões-calibração-e-página-de-teste)). Cobre RF-D-01 a RF-D-08 e o fluxo 9.2 do PRD.

**Comportamento esperado (Wizard de Impressão em Lote, PRD §9.2)**
> 1. **Fonte de dados:** "Planilha (CSV ou Excel)" → seleciona arquivo via diálogo nativo.
> 2. **Preview:** tabela paginada com colunas detectadas (1ª linha como cabeçalho).
> 3. **Mapeamento:** para cada placeholder `{{ campo }}` do template, dropdown lista colunas; usuário escolhe correspondência.
> 4. **Filtro/quantidade:** opções "todas as linhas / range (ex: 10-50) / seleção manual"; quantidade por linha (coluna específica ou valor fixo).
> 5. **Validação:** valores inválidos para barcodes (ex.: EAN com letra) listados antes de imprimir; bloqueia avanço se houver erro crítico.
> 6. **Preview do lote:** carrossel das primeiras 10 etiquetas + total ("523 etiquetas serão impressas").
> 7. **Destino:** escolha de impressora detectada e modo (driver ou nativo PPLB/ZPL) — coberto em [SPEC-09](#spec-09--impressão-via-driver-do-so-e-detecção-de-impressoras) e [SPEC-10](#spec-10--geração-e-envio-raw-pplbzpl).
> 8. Botões finais: **"Exportar PDF"** ou **"Imprimir"**.
> 9. Após impressão, mensagem de sucesso e registro em [SPEC-12](#spec-12--histórico-de-impressões-calibração-e-página-de-teste).

**Regras de negócio (RF-D-01 a RF-D-08)**
> - DEVE importar **CSV UTF-8** com separador `,` ou `;` (auto-detectado) (RF-D-01).
> - DEVE importar **XLSX** (1ª planilha, 1ª linha como cabeçalho) (RF-D-02).
> - DEVE mostrar preview paginado dos dados (RF-D-03).
> - DEVE permitir mapear cada placeholder a uma coluna via dropdown (RF-D-04).
> - PODE permitir filtro de linhas (todas, range, seleção manual) (RF-D-05).
> - PODE permitir quantidade por linha (coluna ou valor fixo) (RF-D-06).
> - DEVE detectar e listar valores inválidos antes de imprimir (RF-D-07).
> - PODE salvar mapeamento da planilha junto ao template para reuso (RF-D-08) — Could; ver [risco R10](./work-plan.md#riscos-e-pontos-desconhecidos) sobre escopo.
> - SE arquivo malformado, ENTÃO mostrar erro claro sem crash.

**Critérios de aceite**
> - DADO um CSV com 100 linhas e 4 colunas QUANDO importo ENTÃO o preview mostra as 100 linhas paginadas.
> - DADO um template com placeholders `{{ produto }}`, `{{ sku }}`, `{{ preco }}` QUANDO mapeio para colunas "Nome", "Code", "Valor" ENTÃO o preview do lote mostra dados corretos.
> - DADO uma coluna SKU contém "ABC123" e está mapeada a barcode EAN-13 QUANDO valido ENTÃO o erro aparece e o avanço é bloqueado.
> - DADO XLSX com 100 SKUs QUANDO mapeio 4 placeholders e gero preview e PDF ENTÃO o tempo total é ≤ 30 s.

**Estado atual**
> Nada implementado.

**Mudanças necessárias**
> - **Frontend:** componente `BatchPrintWizard` com steps (Zustand para estado).
> - **Parsers:** `papaparse` (CSV) e `xlsx`/`exceljs` (XLSX) no frontend.
> - **Backend (Rust):** comando opcional para parse pesado de XLSX se necessário; fallback é tudo no frontend.
> - **Tabela `template_mappings`:** apenas se RF-D-08 entrar no MVP. Não criada por padrão (Could).

**Definição de pronto**
> - [ ] Wizard funcional end-to-end com CSV e XLSX.
> - [ ] Validação por simbologia funcionando.
> - [ ] Preview do lote com carrossel.
> - [ ] Performance ≤ 30 s para 100 SKUs com PDF.
> - [ ] Tratamento de erros de parsing.
> - [ ] Código revisado.

---

## SPEC-08 — Pré-visualização e Exportação PDF

**Objetivo**
> Gerar pré-visualização fiel (proporção mm-correta na tela) e exportar etiquetas individuais ou lotes como PDF vetorial.

**Contexto**
> Usado tanto fora do wizard de lote (preview de etiqueta única) quanto dentro do wizard ([SPEC-07](#spec-07--fontes-de-dados-csvxlsx-e-impressão-em-lote)). Garante "pré-visualização realista" prometida no PRD §1.2. Cobre RF-P-01 a RF-P-07 do PRD §5.6.

**Comportamento esperado**
> 1. Botão "Pré-visualizar" abre modal com etiqueta em proporção real.
> 2. Para lote, navegação entre páginas (primeira/anterior/próxima/última + ir para nº).
> 3. Botão "Exportar PDF" abre diálogo de save nativo.
> 4. Nome de arquivo sugerido: `{{ template_name }}_YYYY-MM-DD_HHmm.pdf`.

**Regras de negócio (RF-P-01 a RF-P-07)**
> - DEVE renderizar em proporção real mm-correta (RF-P-01).
> - DEVE permitir navegação entre páginas no lote (RF-P-02).
> - DEVE exportar etiqueta única como PDF de 1 página (RF-P-03).
> - DEVE exportar lote completo como PDF multipágina (RF-P-04).
> - DEVE gerar PDF vetorial — texto selecionável, barcodes nítidos em qualquer zoom (RF-P-05).
> - PODE sugerir nome do arquivo `{{ template_name }}_YYYY-MM-DD_HHmm.pdf` (RF-P-06).
> - DEVE usar diálogo de save nativo do SO (RF-P-07).

**Critérios de aceite**
> - DADO etiqueta 50×30 mm em zoom 100% num monitor 96 dpi QUANDO abro o preview ENTÃO a etiqueta mede aproximadamente 50×30 mm fisicamente na tela.
> - DADO lote de 500 etiquetas QUANDO peço PDF ENTÃO o arquivo é gerado em ≤ 15 s (PRD §6.1).
> - DADO PDF gerado QUANDO abro em viewer e dou zoom 800% ENTÃO texto e barcodes permanecem nítidos (vetorial).
> - DADO clico "Exportar PDF" QUANDO o diálogo abre ENTÃO o nome sugerido é `MeuTemplate_2026-05-15_1432.pdf`.
> - DADO preview de lote de 500 etiquetas QUANDO meço ENTÃO carrega em ≤ 10 s (PRD §6.1).

**Estado atual**
> Nada implementado.

**Mudanças necessárias**
> - **Backend (Rust):** integrar **`printpdf`** (recomendado pelo PRD §3.3; alternativa `genpdf` registrada como [risco R11](./work-plan.md#riscos-e-pontos-desconhecidos)) para geração vetorial.
> - Comando Tauri `pdf_export(canvas_json[], output_path)` que aceita 1 ou N etiquetas.
> - **Frontend:** componente `PreviewModal` com navegação.
> - Conversão `canvas_json` → primitivas PDF (texto, retângulo, linha, elipse; imagens rasterizadas conforme necessário; barcodes via SVG do bwip-js convertido para path PDF, ou re-render no Rust).

**Definição de pronto**
> - [ ] Preview com proporção fiel mm-correta.
> - [ ] PDF single e multipágina vetorial.
> - [ ] Performance ≤ 15 s para 500 etiquetas (PDF).
> - [ ] Performance ≤ 10 s para preview de 500 etiquetas.
> - [ ] Diálogo de save nativo.
> - [ ] Código revisado.

---

## SPEC-09 — Impressão via Driver do SO e Detecção de Impressoras

**Objetivo**
> Modo A: imprimir via driver nativo do SO (raster), suportando qualquer impressora compatível com o SO. Detectar impressoras instaladas e identificar Argox/Zebra automaticamente.

**Contexto**
> Modo padrão para impressoras genéricas (PRD §3.4 Modo A). Para Argox/Zebra, o app prefere Modo B ([SPEC-10](#spec-10--geração-e-envio-raw-pplbzpl)), mas Modo A é fallback. Cobre RF-I-01, RF-I-02, RF-I-04, RF-I-05, RF-I-08 do PRD §5.7.

**Comportamento esperado**
> 1. Wizard de impressão lista impressoras detectadas no SO.
> 2. Cada impressora exibe: nome do sistema, friendly name, modelo (se conhecido), badge "Argox" ou "Zebra" se identificada.
> 3. Para Argox/Zebra, toggle **"Modo nativo (PPLB/ZPL)"** aparece e fica **ON por padrão** (delegado a [SPEC-10](#spec-10--geração-e-envio-raw-pplbzpl)).
> 4. Para outras impressoras, modo é fixo "Driver do SO".
> 5. Quantidade total de cópias.
> 6. Detecta erros do spooler (offline, sem papel) quando o driver expõe e mostra mensagem clara.
> 7. Cada impressão registra em [SPEC-12](#spec-12--histórico-de-impressões-calibração-e-página-de-teste).

**Regras de negócio (RF-I-01..02, RF-I-04..05, RF-I-08 + §3.4 Modo A)**
> - DEVE listar impressoras instaladas no SO (RF-I-01).
> - PODE identificar Argox/Zebra pelo nome/modelo (RF-I-02). Matching por substring (`"argox"`, `"os-214"`, `"zebra"`, `"zd220"`, etc.).
> - DEVE oferecer Modo nativo ON por padrão para Argox/Zebra (RF-I-03 — coberto também em [SPEC-10](#spec-10--geração-e-envio-raw-pplbzpl)).
> - DEVE usar driver do SO para outras impressoras (RF-I-04).
> - DEVE permitir definir quantidade total de cópias (RF-I-05).
> - PODE detectar e mostrar erros do spooler (RF-I-08).
> - SE Windows, ENTÃO usar **Windows Print Spooler API** via crate `printers` (ou comando do sistema).
> - SE macOS, ENTÃO usar **CUPS** via `lpr`/IPP (ou subprocess).
> - DEVE persistir impressoras detectadas na tabela `printers` ([SPEC-02](#spec-02--modelo-de-dados-e-persistência-sqlite)).

**Critérios de aceite**
> - DADO Windows 11 com Argox e impressora HP instaladas QUANDO abro o wizard ENTÃO ambas aparecem; Argox tem badge "Argox" e modo nativo on; HP usa driver SO.
> - DADO uma impressora offline QUANDO tento imprimir ENTÃO mensagem clara é exibida (quando driver expõe status).
> - DADO clico "Imprimir" no modo driver QUANDO o spooler aceita o job ENTÃO a impressão sai e o registro vai ao histórico ([SPEC-12](#spec-12--histórico-de-impressões-calibração-e-página-de-teste)).
> - DADO macOS 12+ com Argox via CUPS QUANDO listo impressoras ENTÃO Argox aparece corretamente.

**Estado atual**
> Nada implementado.

**Mudanças necessárias**
> - **Backend (Rust):** crate `printers` para Windows; integração CUPS para macOS (libcups via FFI ou subprocess `lpr`).
> - Comandos Tauri: `printers_list()`, `printers_print_raster(printer_name, pdf_bytes, copies)`, `printers_get_status(printer_name)`.
> - Lógica de auto-detecção Argox/Zebra (matching por substring no `system_name`/`friendly_name`/`model`).
> - Cache em tabela `printers` ([SPEC-02](#spec-02--modelo-de-dados-e-persistência-sqlite)) com `last_used_at`.

**Definição de pronto**
> - [ ] Lista correta em Win e macOS.
> - [ ] Identificação Argox/Zebra funcional.
> - [ ] Impressão raster via driver SO funciona em ambos os SOs.
> - [ ] Tratamento de erros do spooler.
> - [ ] Cache em `printers` table.
> - [ ] Código revisado.

---

## SPEC-10 — Geração e Envio Raw PPLB/ZPL

**Objetivo**
> Modo B: gerar código nativo PPLB (Argox) ou ZPL (Zebra) a partir do `canvas_json` e enviar raw à impressora — resolvendo o problema central de etiquetas saindo deslocadas (PRD §1.1, §3.4 e [risco R03](./work-plan.md#riscos-e-pontos-desconhecidos)).

**Contexto**
> É o modo padrão para Argox/Zebra. [SPEC-09](#spec-09--impressão-via-driver-do-so-e-detecção-de-impressoras) cuida da detecção; esta SPEC, da geração + envio. Cobre RF-I-03 e §7 do PRD.

**Comportamento esperado**
> 1. Quando usuário escolhe "Modo nativo" no wizard, o sistema gera PPLB (Argox) ou ZPL (Zebra) a partir do `canvas_json`.
> 2. Texto com fontes embarcadas Argox (5 fontes alfanuméricas, 1,25–6,0 mm): usar comando `A`.
> 3. Texto com fonte custom (qualquer outra): rasterizar em PNG via `fontdue`/`ab_glyph` no Rust e enviar via PPLB Binary Raster.
> 4. Barcode: comando nativo se simbologia suportada (CODE128, EAN-13, QR via `b` na Argox e `^BQ` na Zebra). Cair para raster como fallback.
> 5. Rotação: 0/90/180/270° suportadas em modo raw.
> 6. Envio: spool raw via **`RawPrintJob`** (Windows Win32) ou **`lp -o raw -d <printer>`** (macOS).

**Características da Argox OS-214 Plus (reproduzido fiel ao PRD §7.1)**
> | Característica | Valor |
> |---|---|
> | Resolução | 203 dpi (8 dots/mm) |
> | Velocidade | 2–3 ips (51–76 mm/s) |
> | Largura máxima de impressão | 4,16" (105 mm) |
> | Comprimento máximo | 43" (1092 mm) |
> | Linguagens (emulações) | **PPLA** e **PPLB** (a versão Pro adiciona PPLZ) |
> | Interfaces | Centronics paralela, RS-232, USB |
> | Sensor de mídia | Gap / black mark reflective |
> | Fontes internas | 5 fontes alfanuméricas (1,25 mm a 6,0 mm) |
> | Drivers oficiais | Windows (Vista a 11, Server 2016), macOS (M1+ com Rosetta 2, CUPS 2.1+), Linux (CUPS 2.1+) |

**Regras de negócio**
> - DEVE gerar **PPLB** conforme manual oficial Argox. MVP suporta apenas PPLB; PPLA listado como [risco R08](./work-plan.md#riscos-e-pontos-desconhecidos).
> - DEVE gerar **ZPL** conforme spec Zebra Link-OS.
> - DEVE converter mm → dots respeitando o `dpi` do template (Argox = 203 dpi = 8 dots/mm).
> - DEVE preferir comandos nativos para texto, barcodes (CODE128, EAN-13, etc.) e QR Code; cair para raster apenas quando necessário.
> - DEVE rasterizar fontes customizadas via `fontdue`/`ab_glyph` no Rust com pipeline unificado ao preview (mitigação [risco R02](./work-plan.md#riscos-e-pontos-desconhecidos), referência cruzada com [SPEC-05](#spec-05--sistema-tipográfico)).
> - DEVE ter **testes unitários** cobrindo: posicionamento mm→dots, rotação 0/90/180/270, fontes embarcadas vs raster, barcodes nativos vs raster, QR Code (PPLB `b`, ZPL `^BQ`).
> - SE Windows, ENTÃO enviar via `RawPrintJob` (Win32 API).
> - SE macOS, ENTÃO enviar via `lp -o raw -d <printer>` ou libcups.
> - DEVE registrar impressão em `print_history` com `mode = 'raw_pplb'` ou `'raw_zpl'` ([SPEC-12](#spec-12--histórico-de-impressões-calibração-e-página-de-teste)).
> - SE driver Argox em Apple Silicon falhar (R01), ENTÃO PODE oferecer caminho alternativo USB direto via crate `rusb` (PRD §11).

**Exemplo PPLB para etiqueta de roupa 50×30 mm a 203 dpi (reproduzido fiel ao PRD §7.2)**
>
> ```
> N
> q400          ; largura em dots (50mm * 8)
> Q240,24       ; comprimento em dots + gap
> S2            ; speed 2 ips
> D8            ; darkness
> A20,10,0,3,1,1,N,"Camiseta Polo"
> A20,50,0,2,1,1,N,"Tam: M"
> A20,80,0,2,1,1,N,"R$ 89,90"
> B20,120,0,1,2,2,80,B,"7891234567890"   ; EAN-13
> P1            ; print 1 copy
> ```

**Exemplo ZPL equivalente (reproduzido fiel ao PRD §7.2)**
>
> ```
> ^XA
> ^PW400
> ^LL240
> ^FO20,10^A0N,30,30^FDCamiseta Polo^FS
> ^FO20,50^A0N,20,20^FDTam: M^FS
> ^FO20,80^A0N,25,25^FDR$ 89,90^FS
> ^FO20,120^BEN,80,Y,N^FD7891234567890^FS
> ^PQ1
> ^XZ
> ```

**Pontos críticos macOS (reproduzido fiel ao PRD §7.3)**
> 1. Usuário precisa baixar e instalar o driver oficial Argox para macOS antes do primeiro uso.
> 2. Em Apple Silicon, **Rosetta 2 obrigatória** (`softwareupdate --install-rosetta`).
> 3. A impressora aparecerá em System Preferences → Printers & Scanners; o app a detectará via CUPS.
> 4. Para envio raw: `lp -o raw -d <printer>` ou via libcups.

**Critérios de aceite**
> - DADO etiqueta 50×30 mm em template DPI 203 QUANDO o engine PPLB gera o código ENTÃO `q400` e `Q240,24` aparecem (50×8=400, 30×8=240).
> - DADO Argox OS-214 Plus conectada via USB QUANDO imprimo no modo PPLB **3 vezes consecutivas com mesma calibração** ENTÃO as 3 etiquetas saem **alinhadas, sem desalinhamento** (critério crítico do PRD §12.3).
> - DADO Zebra ZD220 (qualquer Link-OS) QUANDO imprimo no modo ZPL ENTÃO a etiqueta sai correta (PRD §12.4).
> - DADO texto com fonte "Inter" (não embarcada na Argox) QUANDO gero PPLB ENTÃO o texto é rasterizado e enviado como gráfico via Binary Raster.
> - DADO texto rotacionado 90° QUANDO gero PPLB ENTÃO o comando de rotação correto é incluído.
> - DADO PPLB gerado QUANDO inspeciono ENTÃO comando nativo é usado para CODE128, EAN-13 e QR Code.

**Estado atual**
> Nada implementado.

**Mudanças necessárias**
> - **Backend (Rust):** módulo `pplb` (gerador a partir de `canvas_json`); sem crate pronta — escrever conforme manual Argox.
> - **Backend (Rust):** módulo `zpl`; usar crate **`zpl-rs`** quando aplicável (PRD §3.4); senão escrever manualmente.
> - **Pipeline raster** compartilhado com [SPEC-05](#spec-05--sistema-tipográfico) (`fontdue`/`ab_glyph`).
> - **Envio raw:** implementar `RawPrintJob` (Win32) e `lp -o raw` (macOS).
> - **Testes unitários extensivos** para os geradores (posicionamento, rotação, fontes, barcodes, QR).
> - **Caminho alternativo USB direto** (crate `rusb`) preparado como fallback para R01.

**Definição de pronto**
> - [ ] Gerador PPLB cobrindo todos os tipos de objeto.
> - [ ] Gerador ZPL cobrindo todos os tipos de objeto.
> - [ ] Envio raw funcional em Win e macOS.
> - [ ] Testes unitários ≥ 80% cobertura no módulo de geração.
> - [ ] Validado em hardware real (Argox OS-214 Plus + ao menos 1 Zebra Link-OS).
> - [ ] Caminho USB direto via `rusb` documentado e testado como fallback.
> - [ ] Código revisado.

---

## SPEC-11 — Import/Export de Templates (.etlbl)

**Objetivo**
> Permitir backup e portabilidade de templates entre instalações via formato proprietário `.etlbl`.

**Contexto**
> Não há cloud sync; a portabilidade é só por arquivo. Endereça RF-T-07, RF-T-08 e fluxos 9.3/9.4 do PRD. Formato definido em §4.4.

**Comportamento esperado**
> 1. Galeria → menu de contexto → **"Exportar"** → diálogo de save nativo → salva `.etlbl`.
> 2. Galeria → **"Importar"** → diálogo de open → seleciona `.etlbl` → validação. Se nome existe: modal "**Substituir** / **Manter ambos** (renomear) / **Cancelar**".
> 3. Template aparece na galeria.

**Regras de negócio (RF-T-07, RF-T-08, §4.4 e §6.5)**
> - Extensão DEVE ser `.etlbl` (bartender label).
> - Formato interno DEVE ser ZIP contendo:
>   - `template.json` — metadata + `canvas_json`
>   - `assets/` — imagens embarcadas referenciadas no canvas
>   - `thumbnail.png` — preview gerado no momento do export
>   - `manifest.json` — `schema_version`, `app_version`, `hash` (sha256 sobre `template.json` + `assets/`)
> - Import DEVE validar:
>   - **Schema** do `template.json` (zod no front, serde com `deny_unknown_fields` no Rust — PRD §6.5).
>   - **Hash** do manifest contra o conteúdo do ZIP.
>   - **Sanitização** de imagens (revalidar como PNG/JPG/SVG válido — PRD §6.5).
> - Conflito de nome DEVE oferecer **Substituir / Manter ambos** (sufixo "(N)") **/ Cancelar**.
> - Versionamento DEVE permitir retrocompatibilidade futura (`schema_version` no manifest).
> - NÃO DEVE executar código embutido no template (PRD §6.5: nenhum campo é avaliado como expressão arbitrária).

**Critérios de aceite**
> - DADO um template com imagem embedded QUANDO exporto e importo em outra instalação ENTÃO o canvas é idêntico ao original (incluindo imagens) — critério PRD §12.6.
> - DADO `.etlbl` com hash inválido QUANDO importo ENTÃO erro claro "arquivo corrompido".
> - DADO `.etlbl` com nome já existente QUANDO importo ENTÃO modal de conflito aparece com 3 opções.
> - DADO `.etlbl` com `template.json` contendo campos desconhecidos QUANDO importo ENTÃO erro de schema.
> - DADO `.etlbl` cuja imagem embarcada não é PNG/JPG/SVG válido QUANDO importo ENTÃO erro de sanitização.

**Estado atual**
> Nada implementado.

**Mudanças necessárias**
> - **Backend (Rust):** módulo `etlbl` para empacotar/desempacotar ZIP (crate `zip`), gerar/validar hash (crate `sha2`), serializar/desserializar com serde + `deny_unknown_fields`.
> - Comandos Tauri: `template_export(id, output_path)`, `template_import(file_path) -> ImportResult`.
> - **Frontend:** modal de conflito de nome.

**Definição de pronto**
> - [ ] Export gera ZIP válido com manifest e hash.
> - [ ] Import valida hash + schema + sanitização.
> - [ ] Modal de conflito funcional.
> - [ ] Round-trip 100% fidelidade incluindo imagens.
> - [ ] Testes para arquivo corrompido, schema inválido, hash inválido.
> - [ ] Código revisado.

---

## SPEC-12 — Histórico de Impressões, Calibração e Página de Teste

**Objetivo**
> Registrar todas as impressões para auditoria/reimpressão, oferecer calibração de impressora e impressão de página de teste.

**Contexto**
> Conecta os modos de impressão ([SPEC-09](#spec-09--impressão-via-driver-do-so-e-detecção-de-impressoras), [SPEC-10](#spec-10--geração-e-envio-raw-pplbzpl)) à tabela `print_history` ([SPEC-02](#spec-02--modelo-de-dados-e-persistência-sqlite)). Calibração é mitigação para [risco R03](./work-plan.md#riscos-e-pontos-desconhecidos) (etiquetas deslocadas — PRD §11). Cobre RF-I-06, RF-I-07, RF-I-09 e §7.4 do PRD.

**Comportamento esperado**
> 1. **Histórico:** menu lateral "Histórico" exibe lista paginada por `printed_at` desc com colunas: data, template, impressora, modo, quantidade, fonte de dados.
> 2. **Reimpressão:** botão "Reimprimir" em cada entrada — disponível se template ainda existe e (se `data_source` for csv/xlsx) `source_path` ainda existe; senão, desabilitado com tooltip "fonte original indisponível".
> 3. **Calibração:** menu "Impressora" → "Calibrar" → escolhe impressora detectada Argox/Zebra → envia comando.
>    - **Argox PPLB:** comando `U` (auto-sense).
>    - **Zebra ZPL:** `~JC`.
> 4. **Página de teste:** menu "Impressora" → "Imprimir página de teste" → gera etiqueta com nome do modelo + DPI + status do driver e envia.

**Regras de negócio (RF-I-06, RF-I-07, RF-I-09 + §7.4)**
> - DEVE registrar cada impressão (template_id, printer_name, mode, quantity, data_source, source_path, printed_at) (RF-I-07).
> - PODE imprimir página de teste com nome do modelo e configurações da impressora (RF-I-06).
> - PODE permitir reimpressão (RF-I-09).
> - SE template foi removido permanentemente (hard delete), ENTÃO reimpressão fica indisponível.
> - SE `source_path` não existir mais (CSV/XLSX deletado), ENTÃO reimpressão indisponível com mensagem clara.
> - DEVE oferecer calibração para impressoras detectadas como Argox/Zebra.

**Critérios de aceite**
> - DADO uma impressão concluída QUANDO abro o histórico ENTÃO a entrada aparece com todos os campos preenchidos.
> - DADO uma entrada do histórico cujo template ainda existe QUANDO clico "Reimprimir" ENTÃO o wizard reabre com mesmo template e dados.
> - DADO entrada cujo template foi removido permanentemente QUANDO olho ENTÃO botão "Reimprimir" está desabilitado com tooltip explicativo.
> - DADO Argox conectada QUANDO clico "Calibrar" ENTÃO a impressora executa auto-sense (alimenta etiqueta para detectar gap).
> - DADO Zebra conectada QUANDO clico "Calibrar" ENTÃO o comando `~JC` é enviado.
> - DADO clico "Página de teste" para Argox QUANDO confirmo ENTÃO uma etiqueta com nome do modelo é impressa.

**Estado atual**
> Nada implementado.

**Mudanças necessárias**
> - **Frontend:** página `History` com tabela paginada; modais de "Imprimir página de teste" e "Calibrar".
> - **Backend (Rust):** comandos `history_list(page, limit)`, `history_reprint(history_id)`, `printer_calibrate(printer_id)`, `printer_test_page(printer_id)`.
> - Geração da etiqueta de teste (template hard-coded ou gerado a partir das specs do printer).

**Definição de pronto**
> - [ ] Histórico paginado funcional.
> - [ ] Reimpressão validando existência de template e source.
> - [ ] Calibração testada em hardware Argox e Zebra.
> - [ ] Página de teste testada em hardware.
> - [ ] Código revisado.

---

## SPEC-13 — Confiabilidade (Autosave, Recovery, Logs, Lixeira)

**Objetivo**
> Garantir que o usuário não perca trabalho por crash, exclusão acidental ou erro silencioso.

**Contexto**
> Cobre PRD §6.2 (Confiabilidade) e §6.5 (Segurança). Mitigações para [riscos R06](./work-plan.md#riscos-e-pontos-desconhecidos) (exclusão acidental). A lixeira foi modelada em [SPEC-02](#spec-02--modelo-de-dados-e-persistência-sqlite) e [SPEC-03](#spec-03--gestão-de-templates-galeria-crud-soft-delete); aqui estabelecemos as garantias operacionais (sem auto-purga).

**Comportamento esperado**
> 1. **Autosave:** a cada 30 s, se há mudanças não salvas no editor, persiste em snapshot temporário (`autosave_<template_id>.json` em diretório de cache do app).
> 2. **Recovery:** ao abrir um template, se autosave for mais recente que `updated_at` do template, modal "**Recuperar trabalho não salvo?** [Sim] [Descartar]".
> 3. **Logs:** todos os erros não tratados são logados em arquivo rotativo:
>    - **macOS:** `~/Library/Logs/Bartender/`
>    - **Windows:** `%LOCALAPPDATA%\Bartender\logs\`
> 4. **Diálogo de erro:** nenhum crash silencioso. Erro mostra modal com mensagem amigável + botão "Copiar detalhes técnicos".
> 5. **Lixeira:** itens permanecem indefinidamente até purga manual via "Excluir definitivamente".
> 6. **Validação de import:** `.etlbl` validado por hash + schema (em [SPEC-11](#spec-11--importexport-de-templates-etlbl)). Aqui, garantir captura de exceções e mensagem clara.

**Regras de negócio (PRD §6.2 e §6.5)**
> - DEVE autosalvar a cada 30 s quando há mudanças não salvas.
> - DEVE oferecer recovery na abertura se autosave > `updated_at`.
> - DEVE logar todos os erros não tratados.
> - NÃO DEVE permitir crash silencioso.
> - DEVE sanitizar imports `.etlbl` (PRD §6.5; ver [SPEC-11](#spec-11--importexport-de-templates-etlbl)).
> - SE soft delete de template, ENTÃO mantém indefinidamente até purga manual.
> - DEVE rotacionar logs (recomendação: 7 dias ou 10 MB, o que vier antes).

**Critérios de aceite**
> - DADO trabalho sem salvar há 31 s QUANDO inspeciono o cache ENTÃO há um arquivo `autosave_<id>.json` recente.
> - DADO crash do app deixou autosave QUANDO reabro o template ENTÃO modal de recovery aparece.
> - DADO um erro Rust não capturado QUANDO ocorre ENTÃO modal mostra mensagem e o stack vai ao log.
> - DADO 8 dias de uso QUANDO inspeciono pasta de logs ENTÃO logs antigos foram rotacionados.
> - DADO `.etlbl` corrompido QUANDO importo ENTÃO erro claro sem crash.

**Estado atual**
> Nada implementado.

**Mudanças necessárias**
> - **Frontend:** timer de autosave; modal de recovery; ErrorBoundary global; handler `unhandledRejection`.
> - **Backend (Rust):** logger via `tracing` ou `log` + `simplelog`; rotação por tamanho/data; panic handler global.
> - Configuração de paths de logs por SO.

**Definição de pronto**
> - [ ] Autosave a cada 30 s validado.
> - [ ] Recovery testado em cenário de crash.
> - [ ] Logs com rotação funcional.
> - [ ] Diálogo de erro consistente.
> - [ ] Sanitização de import validada.
> - [ ] Lixeira testada (purge manual).
> - [ ] Código revisado.

---

## SPEC-14 — Usabilidade (Atalhos, i18n, Onboarding, Acessibilidade, Performance)

**Objetivo**
> Garantir uma experiência consistente, acessível, em PT-BR, com onboarding curto e performance dentro dos targets do PRD.

**Contexto**
> Polimento final. Cobre PRD §6.1 (performance), §6.3 (usabilidade), §6.7 (acessibilidade). Aplica-se em camada cruzando todo o app.

**Comportamento esperado**
> 1. **Atalhos:** consistentes entre Windows (`Ctrl`) e macOS (`⌘`); todos os do PRD funcionais.
> 2. **i18n:** UI em PT-BR. `i18next` configurado para futuras línguas, mas só PT-BR no MVP.
> 3. **Tooltips:** todos os controles do toolbar têm tooltip.
> 4. **Onboarding:** na primeira execução, tour de 3-4 passos (Galeria → Editor → Imprimir → Histórico).
> 5. **Acessibilidade:** contraste mínimo AA; navegação por teclado nas funções principais.
> 6. **Performance:**
>    - Cold start ≤ 3 s.
>    - Editor com 100 objetos sem queda perceptível de FPS.
>    - Preview de 500 etiquetas ≤ 10 s.
>    - PDF de 500 etiquetas ≤ 15 s.

**Regras de negócio (PRD §6.1, §6.3, §6.7)**
> - DEVE usar `Ctrl` em Windows e `⌘` em macOS para todos os atalhos.
> - DEVE ter UI 100% PT-BR no MVP, com `i18next` preparado para futuro.
> - DEVE ter tooltips em todos os controles do toolbar.
> - DEVE exibir tour de 3-4 passos na primeira execução.
> - DEVE ter contraste AA na UI.
> - DEVE ter navegação por teclado nas funções principais.
> - NÃO requer leitor de tela no MVP (single-user com perfil conhecido).
> - DEVE atender targets de performance (PRD §6.1).

**Critérios de aceite**
> - DADO Win 11 QUANDO pressiono Ctrl+S ENTÃO salva; em macOS QUANDO pressiono ⌘+S ENTÃO também salva.
> - DADO toda a UI QUANDO inspeciono ENTÃO há strings em PT-BR (sem placeholders cruas).
> - DADO primeira execução QUANDO abro o app ENTÃO o tour de 3-4 passos aparece.
> - DADO contrast checker QUANDO valida a UI ENTÃO atinge AA WCAG.
> - DADO editor com 100 objetos QUANDO interajo ENTÃO mantém ≥ 60 FPS.
> - DADO cold start QUANDO meço em hardware moderno ENTÃO ≤ 3 s.
> - DADO lote de 500 etiquetas QUANDO gero PDF ENTÃO ≤ 15 s.
> - DADO lote de 500 etiquetas QUANDO gero preview ENTÃO ≤ 10 s.

**Estado atual**
> Nenhuma camada de polimento aplicada.

**Mudanças necessárias**
> - Configurar `i18next` + arquivo `pt-BR.json` com todas as strings.
> - Componente `OnboardingTour` (recomendado `react-joyride` ou similar).
> - Auditoria de tooltips e atalhos (varredura UI).
> - Auditoria de contraste (axe-core ou Lighthouse).
> - Profiling de performance no editor (Konva caching; virtualização se necessário).
> - QA com hardware real (Argox + Zebra) para validar targets de impressão.

**Definição de pronto**
> - [ ] Todos os atalhos cross-platform funcionais.
> - [ ] 100% das strings em PT-BR.
> - [ ] Onboarding na primeira execução.
> - [ ] Tooltips em todos os controles.
> - [ ] Auditoria AA passou.
> - [ ] Targets de performance validados (cold start, FPS, preview, PDF).
> - [ ] QA em hardware real concluído (Argox OS-214 Plus + Zebra Link-OS).
> - [ ] Código revisado.

---

**Fim das especificações.** Para o desdobramento em pacotes de trabalho, consulte [`work-plan.md`](./work-plan.md).
