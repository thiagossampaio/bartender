# Work Plan — Etiquetador

> Plano de execução baseado em [`./specs.md`](./specs.md), derivado de [`docs/prd.md`](../docs/prd.md).
> Todos os WPs entregam valor independentemente (merge/deploy/validação isolada). Estimativas entre **4 e 5 dias** de trabalho cada. Princípio condutor: **infraestrutura antes de interface** (banco → backend → frontend → integração → polimento).
> Total estimado: **≈ 70 dias úteis** (~14 semanas), aderente à estimativa de 13 semanas do PRD §10.

## Sumário

| WP | Título | Spec | Estimativa | Depende de |
|---|---|---|---|---|
| [WP-01](#wp-01--bootstrap-tauri--react--builds-vazios-assinados) | Bootstrap Tauri + React + builds vazios assinados | [SPEC-01](./specs.md#spec-01--bootstrap-infraestrutura-e-build) | 4d | — |
| [WP-02](#wp-02--schema-sqlite--migrations--plugin-tauri-plugin-sql) | Schema SQLite + migrations + plugin tauri-plugin-sql | [SPEC-02](./specs.md#spec-02--modelo-de-dados-e-persistência-sqlite) | 4d | WP-01 |
| [WP-03](#wp-03--galeria-de-templates--crud-básico) | Galeria de Templates + CRUD básico | [SPEC-03](./specs.md#spec-03--gestão-de-templates-galeria-crud-soft-delete) | 5d | WP-02 |
| [WP-04](#wp-04--editor-canvas-konva--objetos-básicos--painel-de-propriedades) | Editor: Canvas Konva + objetos básicos + painel de propriedades | [SPEC-04](./specs.md#spec-04--editor-de-layout-wysiwyg-canvas-konva) | 5d | WP-02 |
| [WP-05](#wp-05--editor-undoredo--atalhos--salvarcarregar--thumbnail) | Editor: Undo/Redo + Atalhos + Salvar/Carregar + thumbnail | [SPEC-04](./specs.md#spec-04--editor-de-layout-wysiwyg-canvas-konva) | 4d | WP-04 |
| [WP-06](#wp-06--sistema-tipográfico-system-fonts--bundle-15--estilos) | Sistema Tipográfico (system fonts + bundle 15+ + estilos) | [SPEC-05](./specs.md#spec-05--sistema-tipográfico) | 4d | WP-04 |
| [WP-07](#wp-07--códigos-de-barras-1d2d-bwip-js--validação--binding) | Códigos de Barras 1D/2D (bwip-js + validação + binding) | [SPEC-06](./specs.md#spec-06--códigos-de-barras-1d2d) | 5d | WP-04 |
| [WP-08](#wp-08--pré-visualização-fiel--exportação-pdf-vetorial-single--multipágina) | Pré-visualização fiel + Exportação PDF vetorial (single + multipágina) | [SPEC-08](./specs.md#spec-08--pré-visualização-e-exportação-pdf) | 5d | WP-05, WP-06, WP-07 |
| [WP-09](#wp-09--detecção-de-impressoras--impressão-via-driver-do-so) | Detecção de impressoras + impressão via Driver do SO | [SPEC-09](./specs.md#spec-09--impressão-via-driver-do-so-e-detecção-de-impressoras) | 5d | WP-02 |
| [WP-10](#wp-10--tradução-canvas_json--pplb-argox--envio-raw--testes-unitários) | Tradução canvas_json → PPLB (Argox) + envio raw + testes unitários | [SPEC-10](./specs.md#spec-10--geração-e-envio-raw-pplbzpl) | 5d | WP-09 |
| [WP-11](#wp-11--tradução-canvas_json--zpl-zebra--envio-raw--testes-unitários) | Tradução canvas_json → ZPL (Zebra) + envio raw + testes unitários | [SPEC-10](./specs.md#spec-10--geração-e-envio-raw-pplbzpl) | 4d | WP-09 |
| [WP-12](#wp-12--importação-csvxlsx--ui-de-mapeamento-de-placeholders) | Importação CSV/XLSX + UI de mapeamento de placeholders | [SPEC-07](./specs.md#spec-07--fontes-de-dados-csvxlsx-e-impressão-em-lote) | 5d | WP-05 |
| [WP-13](#wp-13--wizard-de-impressão-em-lote-filtroquantidadepreviewdestino) | Wizard de Impressão em Lote (filtro/quantidade/preview/destino) | [SPEC-07](./specs.md#spec-07--fontes-de-dados-csvxlsx-e-impressão-em-lote) | 5d | WP-08, WP-10, WP-11, WP-12 |
| [WP-14](#wp-14--importexport-etlbl-zip--manifest--validação-de-hashschema) | Import/Export .etlbl (ZIP + manifest + validação de hash/schema) | [SPEC-11](./specs.md#spec-11--importexport-de-templates-etlbl) | 4d | WP-03 |
| [WP-15](#wp-15--histórico--reimpressão--calibração--página-de-teste) | Histórico + Reimpressão + Calibração + página de teste | [SPEC-12](./specs.md#spec-12--histórico-de-impressões-calibração-e-página-de-teste) | 4d | WP-13 |
| [WP-16](#wp-16--confiabilidade-autosave-recovery-logs-lixeira) | Confiabilidade: Autosave, Recovery, Logs, Lixeira | [SPEC-13](./specs.md#spec-13--confiabilidade-autosave-recovery-logs-lixeira) | 5d | WP-03, WP-05 |
| [WP-17](#wp-17--polimento-i18n-pt-br-onboarding-acessibilidade-aa-atalhos-finais-qa-hardware) | Polimento: i18n PT-BR, Onboarding, Acessibilidade AA, atalhos finais, QA hardware | [SPEC-14](./specs.md#spec-14--usabilidade-atalhos-i18n-onboarding-acessibilidade-performance) | 5d | Todos |

---

### WP-01 — Bootstrap Tauri + React + builds vazios assinados

| Campo | Valor |
|---|---|
| **ID** | WP-01 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-01 — Bootstrap, Infraestrutura e Build](./specs.md#spec-01--bootstrap-infraestrutura-e-build) |
| **Estimativa** | 4d |
| **Dependências** | Nenhuma |
| **Pode paralelizar com** | — |

**Escopo**
> Bootstrapar o projeto Tauri 2.x + React + TypeScript + Vite + Tailwind + shadcn/ui. Configurar bundler para gerar `.msi` (Windows) e `.dmg` universal notarizado (macOS). Garantir cold start ≤ 3 s e zero requisições de rede no bundle. Auto-update desabilitado. Janela vazia (placeholder) já abre em ambos os SOs.

**Passos sugeridos de implementação**
> 1. `cargo install tauri-cli`; criar projeto via `cargo tauri init` com template React + TS.
> 2. Adicionar Tailwind CSS + shadcn/ui; verificar Vite dev e build.
> 3. Adicionar Zustand, react-hook-form, zod (preparação para próximas WPs).
> 4. Configurar `tauri.conf.json` para bundles `.msi` (WiX) e `.dmg` universal; setar `updater.active = false`.
> 5. Configurar entitlements e notarização Apple cedo (mitigação [R04](#riscos-e-pontos-desconhecidos)).
> 6. Configurar assinatura Windows (certificado a definir com o time).
> 7. Pipeline local de build reproduzível; sugerir `make build-win` / `make build-mac`.
> 8. README com pré-requisitos (Rust toolchain, Xcode CLT/Visual Studio Build Tools, certificados).
> 9. Auditar bundle final por strings de URL/dependências de rede.

**Critérios de aceite do pacote**
> - [ ] `.msi` instalável em Windows 10/11 sem warning.
> - [ ] `.dmg` universal notarizado, abre no macOS 12+ Intel e Apple Silicon sem bloqueio do Gatekeeper.
> - [ ] Cold start ≤ 3 s.
> - [ ] Auto-update desabilitado.
> - [ ] Auditoria de bundle confirma zero CDN/endpoint.
> - [ ] README publicado.

**Áreas impactadas**
> [config/env] | [build] | [frontend] (placeholder)

---

### WP-02 — Schema SQLite + migrations + plugin tauri-plugin-sql

| Campo | Valor |
|---|---|
| **ID** | WP-02 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-02 — Modelo de Dados e Persistência SQLite](./specs.md#spec-02--modelo-de-dados-e-persistência-sqlite) |
| **Estimativa** | 4d |
| **Dependências** | WP-01 |
| **Pode paralelizar com** | — |

**Escopo**
> Integrar `tauri-plugin-sql` (SQLite), criar migrations v1 (schema completo do PRD §4.2) e v2 (`deleted_at` em `templates`), expor comandos genéricos `db_query`/`db_execute` ao frontend, configurar paths corretos por SO e setar permissões de arquivo restritas.

**Passos sugeridos de implementação**
> 1. Adicionar `tauri-plugin-sql` com feature `sqlite` no `Cargo.toml`.
> 2. Criar `migrations/001_initial.sql` reproduzindo o schema do PRD §4.2 (tabelas `templates`, `print_history`, `printers`, `settings` + índice `idx_templates_name`).
> 3. Criar `migrations/002_soft_delete.sql` com `ALTER TABLE templates ADD COLUMN deleted_at TEXT NULL`.
> 4. Implementar resolução de path por SO (`%APPDATA%\Etiquetador\` no Win, `~/Library/Application Support/Etiquetador/` no macOS).
> 5. Setar permissões de arquivo restritas ao usuário do SO no `init`.
> 6. Comandos Tauri `db_query`/`db_execute` expostos via `#[tauri::command]`.
> 7. Setting `schema_version` para tracking interno.
> 8. Testes unitários de round-trip por tabela.
> 9. Diálogo de erro para schema corrompido.

**Critérios de aceite do pacote**
> - [ ] Banco criado no path correto na primeira execução.
> - [ ] Migrations idempotentes (rodar duas vezes não falha).
> - [ ] Round-trip funcional para cada tabela.
> - [ ] Permissões de arquivo restritas validadas.

**Áreas impactadas**
> [banco] | [backend]

---

### WP-03 — Galeria de Templates + CRUD básico

| Campo | Valor |
|---|---|
| **ID** | WP-03 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-03 — Gestão de Templates (Galeria, CRUD, Soft Delete)](./specs.md#spec-03--gestão-de-templates-galeria-crud-soft-delete) |
| **Estimativa** | 5d |
| **Dependências** | WP-02 |
| **Pode paralelizar com** | WP-04, WP-09 |

**Escopo**
> Implementar a Galeria (listar templates com thumbnail/nome/dimensões/data), modal "Novo template" (presets + custom em mm + DPI + orientação), Renomear, Duplicar, Excluir (soft delete) com confirmação, Lixeira (Restaurar + Excluir definitivamente) e busca case-insensitive por substring.

**Passos sugeridos de implementação**
> 1. Página `Gallery` em React; cards com thumbnail/nome/dimensões/`updated_at`.
> 2. Modal `NewTemplateModal` com presets 50×30, 40×25, 100×50 e custom; DPI default 203; portrait/landscape.
> 3. Modal `RenameModal`.
> 4. Confirmação de exclusão; soft delete preenche `deleted_at`.
> 5. Página `Trash`; ações Restaurar e Excluir definitivamente (hard delete).
> 6. Campo de busca por nome (substring case-insensitive).
> 7. Comandos Tauri: `templates_list`, `templates_create`, `templates_duplicate`, `templates_rename`, `templates_soft_delete`, `templates_restore`, `templates_hard_delete`, `templates_search`.
> 8. Thumbnail inicial em branco (placeholder até WP-05 sobrescrever).
> 9. Testes unitários para cada comando backend.

**Critérios de aceite do pacote**
> - [ ] CRUD completo via UI.
> - [ ] Soft delete + Lixeira funcionais.
> - [ ] Busca filtra como esperado.
> - [ ] Confirmações em ações destrutivas.

**Áreas impactadas**
> [frontend] | [backend] | [banco]

---

### WP-04 — Editor: Canvas Konva + objetos básicos + painel de propriedades

| Campo | Valor |
|---|---|
| **ID** | WP-04 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-04 — Editor de Layout WYSIWYG (Canvas Konva)](./specs.md#spec-04--editor-de-layout-wysiwyg-canvas-konva) |
| **Estimativa** | 5d |
| **Dependências** | WP-02 |
| **Pode paralelizar com** | WP-03, WP-09 |

**Escopo**
> Implementar a página `Editor` com canvas Konva em mm fiel, toolbar lateral, painel de propriedades (X, Y, W, H, rotação), inserção de objetos básicos (texto, retângulo, linha, elipse, imagem por drag/paste), seleção e múltipla seleção, mover por mouse e setas (Shift = passos maiores), redimensionar com handles (Shift mantém proporção), rotacionar livre + 90°, régua, grid (1/5 mm + snap), zoom em níveis fixos. Serializa para `canvas_json` (PRD §4.3). Barcode/QR ficam para WP-07.

**Passos sugeridos de implementação**
> 1. Integrar Konva.js + react-konva.
> 2. Estrutura de página `Editor` com `Toolbar`, `CanvasArea`, `PropertiesPanel`, `Rulers`, `ZoomControls`.
> 3. Editor store em Zustand (objetos, seleção, zoom, grid, snap; histórico fica para WP-05).
> 4. Inserção de texto/retângulo/linha/elipse via drag do toolbar.
> 5. Inserção de imagem por drag-and-drop e paste.
> 6. Painel de propriedades por seleção; propriedades específicas para cada tipo.
> 7. Régua superior/lateral em mm; conversão mm ↔ pixel respeitando DPI.
> 8. Grid configurável + snap on/off.
> 9. Zoom em níveis fixos + Ctrl/⌘ +/-.
> 10. Múltipla seleção (Shift+click, lasso); alinhar/distribuir entre selecionados.
> 11. Reordenar camadas (RF-E-16).
> 12. Serializador `canvasToJson()` / `jsonToCanvas()` aderente ao schema PRD §4.3.

**Critérios de aceite do pacote**
> - [ ] Canvas em mm fiel.
> - [ ] Inserção/edição de texto, retângulo, linha, elipse e imagem funcional.
> - [ ] Painel de propriedades exibe e edita X, Y, W, H, rotação.
> - [ ] Régua, grid + snap, zoom funcionais.
> - [ ] Múltipla seleção, alinhar e distribuir funcionais.
> - [ ] `canvas_json` aderente ao schema do PRD §4.3.

**Áreas impactadas**
> [frontend]

---

### WP-05 — Editor: Undo/Redo + Atalhos + Salvar/Carregar + thumbnail

| Campo | Valor |
|---|---|
| **ID** | WP-05 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-04 — Editor de Layout WYSIWYG (Canvas Konva)](./specs.md#spec-04--editor-de-layout-wysiwyg-canvas-konva) |
| **Estimativa** | 4d |
| **Dependências** | WP-04 |
| **Pode paralelizar com** | WP-06, WP-07 |

**Escopo**
> Completar o editor: histórico undo/redo (≥ 50 estados), atalhos cross-platform (Ctrl/⌘ +C, +V, +X, +D, +Z, +Shift+Z, +S, +Shift+S, Delete, setas, Shift+setas), salvar/carregar template no banco, indicador `•` no título quando há mudanças não salvas, geração de thumbnail PNG ao salvar.

**Passos sugeridos de implementação**
> 1. Histórico undo/redo no store Zustand (immer + ring buffer ≥ 50).
> 2. Hook global de atalhos detectando Ctrl no Win e ⌘ no macOS.
> 3. Implementar copiar/colar/cortar/duplicar/excluir.
> 4. Comando Tauri `template_save(id, canvas_json, thumbnail_png)`.
> 5. Geração de thumbnail off-screen (Konva.toDataURL → PNG → blob).
> 6. Indicador `•` no título da janela; limpa ao salvar.
> 7. "Salvar como" (Ctrl/⌘+Shift+S) clona como novo template.
> 8. Testes E2E: criar/editar/salvar/abrir.

**Critérios de aceite do pacote**
> - [ ] Undo/redo ≥ 50 estados.
> - [ ] Todos os atalhos do PRD funcionais.
> - [ ] Salvar persiste e atualiza `updated_at`/`version`.
> - [ ] Thumbnail gerado e salvo.
> - [ ] Indicador `•` correto.

**Áreas impactadas**
> [frontend] | [backend]

---

### WP-06 — Sistema Tipográfico (system fonts + bundle 15+ + estilos)

| Campo | Valor |
|---|---|
| **ID** | WP-06 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-05 — Sistema Tipográfico](./specs.md#spec-05--sistema-tipográfico) |
| **Estimativa** | 4d |
| **Dependências** | WP-04 |
| **Pode paralelizar com** | WP-05, WP-07 |

**Escopo**
> Implementar listagem de fontes do sistema, empacotamento de 15+ fontes (Inter, Roboto, Open Sans, Montserrat, Poppins, Lato, Oswald, Bebas Neue, Playfair Display, Source Code Pro, JetBrains Mono, Libre Barcode 39, Libre Barcode 128, +2 a definir — todas SIL OFL), dropdown com preview (renderizado na própria fonte), estilos (Bold/Italic/Underline/Strikethrough), tamanho 4-200 pt decimal, alinhamentos, wrap automático, auto-shrink. Configurar pipeline raster compartilhado em Rust (`fontdue`/`ab_glyph`) para preparação de [WP-10](#wp-10--tradução-canvas_json--pplb-argox--envio-raw--testes-unitários).

**Passos sugeridos de implementação**
> 1. Comando Rust `fonts_list_system()` via `rust-fontconfig` + APIs nativas.
> 2. Bundle de 15 `.ttf`/`.woff2` em `assets/fonts/`.
> 3. `@font-face` local no frontend; mesclar bundle + sistema.
> 4. Dropdown com preview renderizado.
> 5. Botões toggle Bold/Italic/Underline/Strike.
> 6. Input numérico decimal de tamanho com validação 4-200.
> 7. Cor com paleta + HEX.
> 8. Alinhamentos esquerda/centro/direita/justificado.
> 9. Wrap automático (Konva nativo).
> 10. Auto-shrink (loop binário).
> 11. Crate `fontdue` ou `ab_glyph` no backend Rust para raster (pipeline compartilhado com [WP-10](#wp-10--tradução-canvas_json--pplb-argox--envio-raw--testes-unitários)).

**Critérios de aceite do pacote**
> - [ ] Lista do sistema correta em Win e macOS.
> - [ ] 15+ fontes do bundle disponíveis offline.
> - [ ] Estilos, alinhamentos, wrap, auto-shrink funcionais.
> - [ ] Pipeline raster Rust pronto (sem CDN).

**Áreas impactadas**
> [frontend] | [backend] | [assets]

---

### WP-07 — Códigos de Barras 1D/2D (bwip-js + validação + binding)

| Campo | Valor |
|---|---|
| **ID** | WP-07 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-06 — Códigos de Barras 1D/2D](./specs.md#spec-06--códigos-de-barras-1d2d) |
| **Estimativa** | 5d |
| **Dependências** | WP-04 |
| **Pode paralelizar com** | WP-05, WP-06 |

**Escopo**
> Integrar **bwip-js** no frontend, expor componentes `<BarcodeRenderer />` e `<QRCodeRenderer />` para uso no canvas Konva. Suportar simbologias 1D (CODE128, CODE39, EAN-13, EAN-8, UPC-A, UPC-E, ITF, Codabar) e 2D (QR Code, Data Matrix, PDF417). Painel de propriedades com simbologia, valor (literal ou `{{ campo }}`), altura, módulo, nível de correção (QR), HRT on/off. Validação em tempo real por simbologia. Cálculo de dígito verificador. Vinculação a campos de fonte de dados.

**Passos sugeridos de implementação**
> 1. `npm install bwip-js`.
> 2. Componente `<BarcodeRenderer symbology valor ... />` que produz SVG/Canvas.
> 3. Adicionar tipos `barcode` e `qrcode` ao toolbar e ao serializador `canvas_json`.
> 4. Painel de propriedades específico (simbologia/valor/altura/módulo/correção QR/HRT).
> 5. Validadores zod por simbologia (regex/length/dígitos numéricos).
> 6. Cálculo automático de dígito verificador (EAN-13, EAN-8, UPC-A, UPC-E, ITF mod-10).
> 7. Suporte a `binding.field` substituindo placeholder no render.
> 8. Testes unitários dos validadores e dos cálculos.

**Critérios de aceite do pacote**
> - [ ] Todas as simbologias 1D/2D do PRD funcionais.
> - [ ] Validação em tempo real com feedback visual.
> - [ ] Dígito verificador correto (validar contra dados conhecidos).
> - [ ] Binding a campos funcional.

**Áreas impactadas**
> [frontend]

---

### WP-08 — Pré-visualização fiel + Exportação PDF vetorial (single + multipágina)

| Campo | Valor |
|---|---|
| **ID** | WP-08 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-08 — Pré-visualização e Exportação PDF](./specs.md#spec-08--pré-visualização-e-exportação-pdf) |
| **Estimativa** | 5d |
| **Dependências** | WP-05, WP-06, WP-07 |
| **Pode paralelizar com** | WP-09 |

**Escopo**
> Implementar `PreviewModal` com proporção mm-correta na tela e navegação entre páginas. Gerador PDF em Rust via **`printpdf`** que recebe `canvas_json[]` e produz PDF vetorial (texto selecionável, barcodes nítidos). Atender targets de performance (≤ 10 s preview / ≤ 15 s PDF para 500 etiquetas). Diálogo de save nativo com nome sugerido `{{ template }}_YYYY-MM-DD_HHmm.pdf`.

**Passos sugeridos de implementação**
> 1. Componente `PreviewModal` (carrossel + navegação primeira/anterior/próxima/última).
> 2. Cálculo de DPI da tela para render mm-correto.
> 3. Crate `printpdf` no backend.
> 4. Comando Tauri `pdf_export(canvas_json[], output_path)`.
> 5. Conversor `canvas_json` → primitivas PDF (texto, retângulo, linha, elipse).
> 6. Imagens rasterizadas conforme necessário; barcodes via SVG do bwip-js → path PDF (ou re-render no Rust).
> 7. Diálogo de save nativo via Tauri dialog API; nome sugerido com data formatada.
> 8. Benchmarks de performance.

**Critérios de aceite do pacote**
> - [ ] Preview fiel em proporção mm.
> - [ ] PDF single e multipágina vetorial.
> - [ ] 500 etiquetas: preview ≤ 10 s, PDF ≤ 15 s.
> - [ ] Diálogo de save nativo com nome sugerido.

**Áreas impactadas**
> [frontend] | [backend]

---

### WP-09 — Detecção de impressoras + impressão via Driver do SO

| Campo | Valor |
|---|---|
| **ID** | WP-09 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-09 — Impressão via Driver do SO e Detecção de Impressoras](./specs.md#spec-09--impressão-via-driver-do-so-e-detecção-de-impressoras) |
| **Estimativa** | 5d |
| **Dependências** | WP-02 |
| **Pode paralelizar com** | WP-08 (e WP-03/WP-04 anteriormente) |

**Escopo**
> Detectar impressoras instaladas em Win (Print Spooler API via crate `printers`) e macOS (CUPS via subprocess `lpr`/libcups). Identificar Argox/Zebra por substring. Persistir em tabela `printers`. Implementar impressão raster via driver do SO (recebe PDF gerado em [WP-08](#wp-08--pré-visualização-fiel--exportação-pdf-vetorial-single--multipágina)). UI base do wizard de destino (toggle "Modo nativo" ON por padrão para Argox/Zebra; modo driver para outras). Tratamento de erros de spooler quando expostos.

**Passos sugeridos de implementação**
> 1. Crate `printers` no backend (Win); subprocess `lpr` ou libcups (macOS).
> 2. Comando Tauri `printers_list()`.
> 3. Auto-detecção Argox/Zebra por substring (`"argox"`, `"os-214"`, `"zebra"`, `"zd220"`, etc.).
> 4. Persistir em tabela `printers` com `last_used_at` e `language`.
> 5. Comando `printers_print_raster(printer_name, pdf_bytes, copies)` (Win: API spooler; macOS: `lpr` com PDF).
> 6. Comando `printers_get_status(printer_name)`.
> 7. UI: lista de impressoras com badges, toggle "Modo nativo", quantidade de cópias.

**Critérios de aceite do pacote**
> - [ ] Lista correta em Win e macOS.
> - [ ] Auto-detecção Argox/Zebra funcional.
> - [ ] Impressão raster via driver SO funciona em ambos os SOs.
> - [ ] Tratamento de erros do spooler.

**Áreas impactadas**
> [backend] | [frontend] | [integrações]

---

### WP-10 — Tradução canvas_json → PPLB (Argox) + envio raw + testes unitários

| Campo | Valor |
|---|---|
| **ID** | WP-10 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-10 — Geração e Envio Raw PPLB/ZPL](./specs.md#spec-10--geração-e-envio-raw-pplbzpl) |
| **Estimativa** | 5d |
| **Dependências** | WP-09 |
| **Pode paralelizar com** | WP-11 |

**Escopo**
> Módulo Rust `pplb` que converte `canvas_json` em código PPLB conforme manual Argox. Cobertura de texto (fontes embarcadas A vs raster), barcodes nativos vs raster, QR Code (`b`), rotação 0/90/180/270°. Envio raw via `RawPrintJob` no Win e `lp -o raw` no macOS. Testes unitários cobrindo posicionamento (mm→dots a 203 dpi = 8 dots/mm), rotação e cada tipo de objeto. Validação em hardware real (Argox OS-214 Plus). Caminho USB direto via `rusb` documentado como fallback ([R01](#riscos-e-pontos-desconhecidos)).

**Passos sugeridos de implementação**
> 1. Módulo Rust `pplb` com gerador a partir de `canvas_json`.
> 2. Conversão mm → dots respeitando `dpi` do template.
> 3. Comando `A` para texto com fontes embarcadas Argox (5 fontes 1,25-6,0 mm).
> 4. Texto com fonte custom: rasterizar via pipeline de [WP-06](#wp-06--sistema-tipográfico-system-fonts--bundle-15--estilos) → enviar via PPLB Binary Raster.
> 5. Barcodes nativos (CODE128, EAN-13, etc.) com comando `B`; QR via comando `b`.
> 6. Suporte a rotação 0/90/180/270° (modo raw).
> 7. Envio raw: `RawPrintJob` (Win32) e `lp -o raw -d <printer>` (macOS via subprocess ou libcups).
> 8. Testes unitários extensivos (posicionamento, rotação, fontes, barcodes, QR).
> 9. Validação em hardware real.
> 10. Caminho USB direto via crate `rusb` documentado como fallback para R01.
> 11. Integrar com `print_history` registrando `mode = 'raw_pplb'`.

**Critérios de aceite do pacote**
> - [ ] Gerador PPLB cobrindo todos os tipos de objeto.
> - [ ] Envio raw funcional em Win e macOS.
> - [ ] 3 impressões consecutivas sem desalinhamento na Argox OS-214 Plus (PRD §12.3).
> - [ ] Testes unitários ≥ 80% cobertura.
> - [ ] Caminho USB direto via `rusb` documentado e testado.

**Áreas impactadas**
> [backend] | [integrações] | [hardware]

---

### WP-11 — Tradução canvas_json → ZPL (Zebra) + envio raw + testes unitários

| Campo | Valor |
|---|---|
| **ID** | WP-11 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-10 — Geração e Envio Raw PPLB/ZPL](./specs.md#spec-10--geração-e-envio-raw-pplbzpl) |
| **Estimativa** | 4d |
| **Dependências** | WP-09 |
| **Pode paralelizar com** | WP-10 |

**Escopo**
> Módulo Rust `zpl` que converte `canvas_json` em ZPL conforme spec Zebra Link-OS. Usar crate **`zpl-rs`** quando aplicável; complementar manualmente quando necessário. Cobrir texto, barcodes (`^B*`), QR Code (`^BQ`), rotação 0/90/180/270°. Envio raw análogo ao PPLB. Testes unitários e validação em hardware real Zebra (qualquer Link-OS).

**Passos sugeridos de implementação**
> 1. Adicionar crate `zpl-rs` ao backend.
> 2. Módulo `zpl` com gerador a partir de `canvas_json`.
> 3. Conversão mm → dots respeitando DPI da impressora Zebra (geralmente 203/300 dpi).
> 4. Comandos `^FO`, `^A0N`, `^FD` etc. para texto.
> 5. Barcodes via `^BC` (CODE128), `^BE` (EAN-13), `^BQ` (QR), etc.
> 6. Rotação 0/90/180/270°.
> 7. Reuso do mesmo caminho de envio raw de [WP-10](#wp-10--tradução-canvas_json--pplb-argox--envio-raw--testes-unitários).
> 8. Testes unitários.
> 9. Validação em hardware real Zebra.
> 10. Integrar com `print_history` registrando `mode = 'raw_zpl'`.

**Critérios de aceite do pacote**
> - [ ] Gerador ZPL cobrindo todos os tipos de objeto.
> - [ ] Envio raw funcional em Win e macOS.
> - [ ] Impressão correta em pelo menos 1 Zebra Link-OS (PRD §12.4).
> - [ ] Testes unitários ≥ 80% cobertura.

**Áreas impactadas**
> [backend] | [integrações] | [hardware]

---

### WP-12 — Importação CSV/XLSX + UI de mapeamento de placeholders

| Campo | Valor |
|---|---|
| **ID** | WP-12 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-07 — Fontes de Dados (CSV/XLSX) e Impressão em Lote](./specs.md#spec-07--fontes-de-dados-csvxlsx-e-impressão-em-lote) |
| **Estimativa** | 5d |
| **Dependências** | WP-05 |
| **Pode paralelizar com** | WP-09, WP-10, WP-11 |

**Escopo**
> Importar CSV (UTF-8, separador `,` ou `;` auto-detectado) e XLSX (1ª planilha, 1ª linha = cabeçalho). Tabela de preview paginada. UI de mapeamento dropdown de placeholders → colunas da planilha. Salvar mapeamento junto ao template é Could (avaliar se entra no MVP — registrar como [R10](#riscos-e-pontos-desconhecidos)).

**Passos sugeridos de implementação**
> 1. `npm install papaparse xlsx` (frontend).
> 2. Diálogo de open arquivo via Tauri dialog API.
> 3. Parser com auto-detecção de separador CSV.
> 4. Preview paginado em tabela.
> 5. Componente de mapeamento (lista placeholders detectados no `canvas_json` × colunas).
> 6. Validação de arquivo malformado com erro claro.

**Critérios de aceite do pacote**
> - [ ] CSV e XLSX importáveis com 100+ linhas.
> - [ ] Preview paginado funcional.
> - [ ] Mapeamento dropdown funcional.
> - [ ] Erros de parsing tratados sem crash.

**Áreas impactadas**
> [frontend] | [backend] (opcional para parse pesado)

---

### WP-13 — Wizard de Impressão em Lote (filtro/quantidade/preview/destino)

| Campo | Valor |
|---|---|
| **ID** | WP-13 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-07 — Fontes de Dados (CSV/XLSX) e Impressão em Lote](./specs.md#spec-07--fontes-de-dados-csvxlsx-e-impressão-em-lote) |
| **Estimativa** | 5d |
| **Dependências** | WP-08, WP-10, WP-11, WP-12 |
| **Pode paralelizar com** | — |

**Escopo**
> Compor o wizard end-to-end: fonte de dados → preview → mapeamento → filtro/quantidade → validação de valores → preview do lote (carrossel + total) → destino (impressora + modo) → Imprimir/Exportar PDF. Detectar valores inválidos antes de imprimir e bloquear avanço se erro crítico. Performance: ≤ 30 s para 100 SKUs com PDF.

**Passos sugeridos de implementação**
> 1. Componente `BatchPrintWizard` com steps em Zustand.
> 2. Step Filtro/Quantidade (todas/range/seleção; quantidade fixa ou coluna).
> 3. Step Validação: rodar validadores de [WP-07](#wp-07--códigos-de-barras-1d2d-bwip-js--validação--binding) sobre cada linha mapeada para barcodes.
> 4. Step Preview do lote: carrossel das primeiras 10 + total.
> 5. Step Destino: integra UI de impressora de [WP-09](#wp-09--detecção-de-impressoras--impressão-via-driver-do-so).
> 6. Botões finais "Exportar PDF" (chama [WP-08](#wp-08--pré-visualização-fiel--exportação-pdf-vetorial-single--multipágina)) e "Imprimir" (chama driver SO ou raw PPLB/ZPL conforme modo).
> 7. Mensagem de sucesso e registro no histórico (preparar gancho que [WP-15](#wp-15--histórico--reimpressão--calibração--página-de-teste) consumirá).

**Critérios de aceite do pacote**
> - [ ] Wizard funcional end-to-end com CSV e XLSX.
> - [ ] Validação de valores bloqueia avanço quando crítico.
> - [ ] 100 SKUs → preview + PDF em ≤ 30 s.
> - [ ] Impressão direta funciona em modo driver e modo nativo.

**Áreas impactadas**
> [frontend] | [backend]

---

### WP-14 — Import/Export .etlbl (ZIP + manifest + validação de hash/schema)

| Campo | Valor |
|---|---|
| **ID** | WP-14 |
| **Status** | ✅ Concluído |
| **Spec relacionada** | [SPEC-11 — Import/Export de Templates (.etlbl)](./specs.md#spec-11--importexport-de-templates-etlbl) |
| **Estimativa** | 4d |
| **Dependências** | WP-03 |
| **Pode paralelizar com** | WP-09, WP-10, WP-11, WP-12 (qualquer WP de impressão/lote) |

**Escopo**
> Implementar formato `.etlbl` (ZIP com `template.json` + `assets/` + `thumbnail.png` + `manifest.json` com hash sha256). Comandos export/import. Validação de hash, schema (serde com `deny_unknown_fields`) e sanitização de imagens. Modal de conflito de nome (Substituir / Manter ambos / Cancelar).

**Passos sugeridos de implementação**
> 1. Adicionar crates `zip` e `sha2` ao backend.
> 2. Módulo `etlbl::export` que monta o ZIP a partir de um template.
> 3. Módulo `etlbl::import` que valida hash, parseia com `deny_unknown_fields`, sanitiza imagens (revalidar como PNG/JPG/SVG via `image` crate ou similar).
> 4. Comandos Tauri `template_export(id, output_path)` e `template_import(file_path) -> ImportResult`.
> 5. Modal de conflito de nome no frontend.
> 6. Sufixo "(N)" automático para "Manter ambos".
> 7. Testes para arquivo corrompido, schema inválido, hash inválido.

**Critérios de aceite do pacote**
> - [ ] Round-trip 100% fidelidade incluindo imagens.
> - [ ] Validação de hash + schema funcional.
> - [ ] Modal de conflito com 3 opções.

**Áreas impactadas**
> [backend] | [frontend]

---

### WP-15 — Histórico + Reimpressão + Calibração + página de teste

| Campo | Valor |
|---|---|
| **ID** | WP-15 |
| **Spec relacionada** | [SPEC-12 — Histórico de Impressões, Calibração e Página de Teste](./specs.md#spec-12--histórico-de-impressões-calibração-e-página-de-teste) |
| **Estimativa** | 4d |
| **Dependências** | WP-13 |
| **Pode paralelizar com** | WP-14 |

**Escopo**
> Página `History` com lista paginada de `print_history`. Ação "Reimprimir" (validando existência de template e `source_path`). Menu "Impressora" → "Calibrar" (Argox `U` / Zebra `~JC`) e "Imprimir página de teste".

**Passos sugeridos de implementação**
> 1. Página `History` com tabela paginada (data, template, impressora, modo, qtd, fonte).
> 2. Comando `history_list(page, limit)`; `history_reprint(history_id)` que valida template + source.
> 3. Botão Reimprimir desabilitado com tooltip se template/source indisponível.
> 4. Modal "Calibrar" → escolhe impressora detectada → envia `U` (PPLB) ou `~JC` (ZPL).
> 5. Comando `printer_calibrate(printer_id)`.
> 6. "Imprimir página de teste": etiqueta hard-coded com nome do modelo + DPI + status do driver.
> 7. Comando `printer_test_page(printer_id)`.
> 8. Validação em hardware real.

**Critérios de aceite do pacote**
> - [ ] Histórico paginado funcional.
> - [ ] Reimpressão validando contexto.
> - [ ] Calibração testada em hardware Argox e Zebra.
> - [ ] Página de teste sai correta no hardware.

**Áreas impactadas**
> [frontend] | [backend] | [hardware]

---

### WP-16 — Confiabilidade: Autosave, Recovery, Logs, Lixeira

| Campo | Valor |
|---|---|
| **ID** | WP-16 |
| **Spec relacionada** | [SPEC-13 — Confiabilidade (Autosave, Recovery, Logs, Lixeira)](./specs.md#spec-13--confiabilidade-autosave-recovery-logs-lixeira) |
| **Estimativa** | 5d |
| **Dependências** | WP-03, WP-05 |
| **Pode paralelizar com** | WP-09, WP-10, WP-11, WP-12, WP-13, WP-14, WP-15 |

**Escopo**
> Autosave a cada 30 s no editor (snapshot em cache); Recovery na abertura quando autosave > `updated_at`. Logging com rotação (`tracing` + paths por SO). ErrorBoundary global no frontend; panic handler no Rust. Diálogo amigável para erros não tratados ("Copiar detalhes técnicos"). Garantir que lixeira não auto-purga (só ação manual).

**Passos sugeridos de implementação**
> 1. Timer de autosave no `Editor` (writes em `<cache>/autosave_<id>.json`).
> 2. Comando Tauri `autosave_load(template_id)` chamado ao abrir o editor.
> 3. Modal "Recuperar trabalho não salvo?".
> 4. Configurar `tracing` ou `log` + `simplelog` no backend; rotação 7 dias / 10 MB.
> 5. Paths de logs: `~/Library/Logs/Etiquetador/` (macOS), `%LOCALAPPDATA%\Etiquetador\logs\` (Win).
> 6. Panic handler global no Rust; bridge para frontend exibir modal.
> 7. ErrorBoundary React + handler `unhandledRejection`.
> 8. Garantir que hard delete de templates exige confirmação dupla.
> 9. Testes simulando crash.

**Critérios de aceite do pacote**
> - [ ] Autosave a cada 30 s validado.
> - [ ] Recovery testado em cenário de crash.
> - [ ] Logs com rotação.
> - [ ] Diálogo amigável para erro não tratado.
> - [ ] Sanitização de import (de [WP-14](#wp-14--importexport-etlbl-zip--manifest--validação-de-hashschema)) com mensagens claras.

**Áreas impactadas**
> [frontend] | [backend] | [config/env]

---

### WP-17 — Polimento: i18n PT-BR, Onboarding, Acessibilidade AA, atalhos finais, QA hardware

| Campo | Valor |
|---|---|
| **ID** | WP-17 |
| **Spec relacionada** | [SPEC-14 — Usabilidade (Atalhos, i18n, Onboarding, Acessibilidade, Performance)](./specs.md#spec-14--usabilidade-atalhos-i18n-onboarding-acessibilidade-performance) |
| **Estimativa** | 5d |
| **Dependências** | Todos os anteriores |
| **Pode paralelizar com** | — |

**Escopo**
> Polimento final: configurar `i18next` + `pt-BR.json` cobrindo 100% das strings, onboarding tour de 3-4 passos na primeira execução, auditoria de tooltips e atalhos cross-platform, auditoria de contraste AA (axe-core/Lighthouse), profiling de performance (cold start, FPS no editor com 100 objetos, preview/PDF de 500 etiquetas), QA final em hardware real (Argox OS-214 Plus + Zebra Link-OS), validação dos critérios de aceitação do PRD §12.

**Passos sugeridos de implementação**
> 1. Instalar `i18next` + `react-i18next`.
> 2. Extrair todas as strings hard-coded para `pt-BR.json`.
> 3. Configurar fallback e estrutura para línguas futuras.
> 4. Componente `OnboardingTour` (recomendado `react-joyride`); checagem de "primeira execução" via `settings`.
> 5. Auditoria de tooltips no toolbar (varredura UI).
> 6. Auditoria de atalhos: confirmar Ctrl no Win e ⌘ no macOS.
> 7. Auditoria de contraste com axe-core ou Lighthouse.
> 8. Profiling de performance e ajustes (Konva caching, virtualização se necessário).
> 9. QA final em hardware real (Argox + Zebra) cobrindo todos os critérios do PRD §12.
> 10. Bug fixes finais.

**Critérios de aceite do pacote**
> - [ ] 100% das strings em PT-BR.
> - [ ] Onboarding na primeira execução.
> - [ ] Tooltips em todos os controles do toolbar.
> - [ ] Atalhos cross-platform validados.
> - [ ] Contraste AA validado.
> - [ ] Targets de performance atingidos (cold start ≤ 3 s, ≥ 60 FPS com 100 objetos, preview ≤ 10 s, PDF ≤ 15 s).
> - [ ] Todos os critérios de aceitação do PRD §12 atendidos.

**Áreas impactadas**
> [frontend] | [config/env] | [hardware] | [QA]

---

## Mapa de Dependências

```
WP-01 ─► WP-02 ┬─► WP-03 ─► WP-14 ───────────────────────────┐
               │                                              │
               ├─► WP-04 ┬─► WP-05 ┬─► WP-06 ──┐              │
               │         │         ├─► WP-07 ──┤              │
               │         │         └─► WP-12 ──┤              │
               │         │                     ▼              │
               │         └─► WP-08 ─────────► WP-13 ─► WP-15 ─┤
               │                               ▲              │
               └─► WP-09 ┬─► WP-10 ────────────┤              │
                         └─► WP-11 ────────────┘              │
                                                              ▼
                                              WP-16 (paralelo após WP-05)
                                                              │
                                                              ▼
                                                            WP-17
```

> **Caminho crítico:** WP-01 → WP-02 → WP-04 → WP-05 → WP-08 → WP-13 → WP-15 → WP-17 (≈ 33-35 dias, ~7 semanas).
> Os trilhos paralelos (WP-09/10/11 e WP-06/07/12) reduzem o calendário total quando há equipe.

---

## Riscos e Pontos Desconhecidos

| # | Descrição | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| **R01** | Driver Argox para macOS apresentar instabilidade em Apple Silicon (PRD §11) | Média | Alto | Documentar requisito de Rosetta 2; ter caminho alternativo USB direto via crate `rusb` (Modo B independe do driver de renderização do SO). Validar cedo no [WP-10](#wp-10--tradução-canvas_json--pplb-argox--envio-raw--testes-unitários). |
| **R02** | Render de fontes customizadas no canvas vs raster PPLB divergir (PRD §11) | Alta | Médio | Pipeline único: usar `fontdue`/`ab_glyph` no Rust também para o preview do canvas, garantindo paridade pixel a pixel. Implementado em [WP-06](#wp-06--sistema-tipográfico-system-fonts--bundle-15--estilos)/[WP-10](#wp-10--tradução-canvas_json--pplb-argox--envio-raw--testes-unitários). |
| **R03** | Etiquetas saindo deslocadas (problema central do PRD §1.1) | Média | Alto | Modo nativo PPLB/ZPL como padrão para Argox/Zebra ([SPEC-10](./specs.md#spec-10--geração-e-envio-raw-pplbzpl)). Calibração obrigatória no setup ([SPEC-12](./specs.md#spec-12--histórico-de-impressões-calibração-e-página-de-teste)). Testes em hardware real durante [WP-10](#wp-10--tradução-canvas_json--pplb-argox--envio-raw--testes-unitários)/[WP-11](#wp-11--tradução-canvas_json--zpl-zebra--envio-raw--testes-unitários). |
| **R04** | Apple Notarization rejeitar build (PRD §11) | Baixa | Médio | Configurar entitlements corretos e testar notarização desde o [WP-01](#wp-01--bootstrap-tauri--react--builds-vazios-assinados). |
| **R05** | Performance do canvas Konva com muitos objetos (PRD §11) | Baixa | Médio | Konva tem layers e caching; testar com 100+ objetos cedo no [WP-04](#wp-04--editor-canvas-konva--objetos-básicos--painel-de-propriedades)/[WP-05](#wp-05--editor-undoredo--atalhos--salvarcarregar--thumbnail). Validação final em [WP-17](#wp-17--polimento-i18n-pt-br-onboarding-acessibilidade-aa-atalhos-finais-qa-hardware). |
| **R06** | Usuário perder templates por exclusão acidental (PRD §11) | Média | Alto | Soft delete (`deleted_at`) + lixeira com restauração. Modelado em [SPEC-02](./specs.md#spec-02--modelo-de-dados-e-persistência-sqlite)/[SPEC-03](./specs.md#spec-03--gestão-de-templates-galeria-crud-soft-delete) e implementado em [WP-02](#wp-02--schema-sqlite--migrations--plugin-tauri-plugin-sql)/[WP-03](#wp-03--galeria-de-templates--crud-básico)/[WP-16](#wp-16--confiabilidade-autosave-recovery-logs-lixeira). |
| **R07** | **Ambíguo:** PRD §3.1 diz "produto final independe da escolha" entre Tauri 2.x e Electron + electron-forge. Decisão fixada no recomendado (Tauri); Electron é fallback caso encontre bloqueio insuperável | Baixa | Alto | Decisão arquitetural confirmada com o time antes do [WP-01](#wp-01--bootstrap-tauri--react--builds-vazios-assinados). Validar protótipo com Tauri 2.x antes de investir 4 dias completos. |
| **R08** | **Ambíguo:** OS-214 Plus suporta PPLA e PPLB; PRD foca em PPLB. MVP cobre apenas PPLB; PPLA pode aparecer como gap futuro se houver firmware específico | Baixa | Médio | MVP gera PPLB. Documentar a limitação. PPLA fica como backlog se aparecer demanda. |
| **R09** | **Ambíguo:** RF-T-06 não especifica granularidade da busca (exata, prefixo, fuzzy). Adotada **busca por substring case-insensitive** | Baixa | Baixo | Confirmar com usuário no [WP-03](#wp-03--galeria-de-templates--crud-básico) durante review. Trocar é trivial. |
| **R10** | **Ambíguo:** RF-D-08 ("salvar mapeamento da planilha junto ao template para reuso") é Could; PRD §8 menciona "edição inline dos campos antes de imprimir" sem RF numerado | Baixa | Baixo | Tratar RF-D-08 como nice-to-have; revisar inclusão no MVP no [WP-12](#wp-12--importação-csvxlsx--ui-de-mapeamento-de-placeholders). "Edição inline" fica fora do MVP até confirmação explícita. |
| **R11** | **Ambíguo:** PRD §3.3 lista alternativas com "ou" para várias bibliotecas Rust. Decisões fixadas no primeiro item ou no recomendado: rusqlite/sqlx → **`sqlx`** (para `sqlx::migrate!`); printpdf/genpdf → **`printpdf`**; bwip-rs vs JsBarcode no frontend → **bwip-js**. Alternativas como fallback técnico | Baixa | Médio | Decisões registradas. Em caso de bloqueio (ex.: bug crítico em printpdf), trocar para alternativa é localizado ao módulo. |
| **R12** | Driver Argox precisa ser instalado manualmente pelo usuário no macOS (PRD §7.3) | Alta | Baixo | Documentação no onboarding ([WP-17](#wp-17--polimento-i18n-pt-br-onboarding-acessibilidade-aa-atalhos-finais-qa-hardware)) com link e instruções. App detecta ausência e exibe instruções claras. |
| **R13** | Disponibilidade de hardware Argox e Zebra para testes durante WP-10/WP-11/WP-15/WP-17 | Média | Alto | Garantir agendamento de hardware antes do início do [WP-10](#wp-10--tradução-canvas_json--pplb-argox--envio-raw--testes-unitários). Bloqueio aqui paralisa o caminho crítico de impressão. |

---

## Oportunidades de Paralelização

| Grupo | WPs | Pré-requisito comum |
|---|---|---|
| **G1** — Trilho UI x Trilho Impressão | [WP-03](#wp-03--galeria-de-templates--crud-básico), [WP-04](#wp-04--editor-canvas-konva--objetos-básicos--painel-de-propriedades), [WP-09](#wp-09--detecção-de-impressoras--impressão-via-driver-do-so) | [WP-02](#wp-02--schema-sqlite--migrations--plugin-tauri-plugin-sql) concluído |
| **G2** — Verticais sobre o editor | [WP-05](#wp-05--editor-undoredo--atalhos--salvarcarregar--thumbnail), [WP-06](#wp-06--sistema-tipográfico-system-fonts--bundle-15--estilos), [WP-07](#wp-07--códigos-de-barras-1d2d-bwip-js--validação--binding) | [WP-04](#wp-04--editor-canvas-konva--objetos-básicos--painel-de-propriedades) concluído |
| **G3** — Linguagens nativas de impressão | [WP-10](#wp-10--tradução-canvas_json--pplb-argox--envio-raw--testes-unitários), [WP-11](#wp-11--tradução-canvas_json--zpl-zebra--envio-raw--testes-unitários) | [WP-09](#wp-09--detecção-de-impressoras--impressão-via-driver-do-so) concluído |
| **G4** — Dados/Lote x Confiabilidade | [WP-12](#wp-12--importação-csvxlsx--ui-de-mapeamento-de-placeholders), [WP-16](#wp-16--confiabilidade-autosave-recovery-logs-lixeira) | [WP-05](#wp-05--editor-undoredo--atalhos--salvarcarregar--thumbnail) concluído (e [WP-03](#wp-03--galeria-de-templates--crud-básico) para WP-16) |
| **G5** — Final pré-polimento | [WP-14](#wp-14--importexport-etlbl-zip--manifest--validação-de-hashschema), [WP-15](#wp-15--histórico--reimpressão--calibração--página-de-teste) | [WP-13](#wp-13--wizard-de-impressão-em-lote-filtroquantidadepreviewdestino) concluído (WP-15) / [WP-03](#wp-03--galeria-de-templates--crud-básico) (WP-14) |

> Com 2 desenvolvedores em paralelo nos trilhos UI e Impressão, o calendário pode reduzir de ~14 para ~9-10 semanas. WP-17 é necessariamente serial no final.

---

**Fim do work plan.** Para detalhes de cada SPEC referenciada, consulte [`./specs.md`](./specs.md).
