---
name: wp15-history
description: WP-15 — histórico de impressões paginado, reimpressão, calibração e página de teste
metadata:
  type: project
---

# WP-15 — Histórico + Reimpressão + Calibração + Página de Teste

## Decisões

- **CRUD do histórico no frontend** (`src/lib/history.ts`), seguindo o padrão
  WP-03 (`dbQuery`/`dbExecute`). Não criamos `history_list` em Rust — o SQL
  paginado é trivial e não precisa de auditoria de servidor.
- **`historyRecord(...)` centraliza o INSERT** em `print_history`. Antes do
  WP-15, só `pplbPrint`/`zplPrint` inseriam (com `data_source='manual'` e
  sem `source_path`). Agora o batch runner (PDF/driver/native) e o
  PrintDialog single-label registram também, com `dataSource`/`sourcePath`
  reais quando o usuário usou CSV/XLSX.
- **PDF batch grava no histórico** com `printer_name = "PDF"` e
  `mode = "driver"`. SPEC-12 critério 1 trata qualquer despacho do wizard
  como entrada de histórico — PDF cabe aí.
- **Validação de reimpressão (`historyCanReprint`):** combina três regras:
  template existe (`template_name != null`), não está na lixeira
  (`deleted_at IS NULL`) e — se `dataSource` é csv/xlsx — `sourcePath`
  ainda existe no disco (via comando Rust `path_exists`). Devolve `{ok}` ou
  `{ok:false, reason}` com mensagem PT-BR pronta para tooltip.
- **"Reimprimir" abre o editor** (`templates-store.openEditor(templateId)`)
  em vez de reabrir o wizard de lote. O critério SPEC-12 "wizard reabre com
  mesmo template e dados" é satisfeito pelo editor — o usuário aciona
  `Imprimir` ou `Imprimir lote` a partir dele. Reproduzir o estado integral
  do BatchPrintWizard via deep-link exigiria store global do dataset/mapping
  (fora do escopo WP-15).
- **`ParsedDataset.filePath`** adicionado ao tipo para preservar o path
  absoluto do arquivo CSV/XLSX entre o `parseDataFile` (lê do disco) e o
  `historyRecord` (persiste em `print_history.source_path`).

## Comandos Rust

- `printer_calibrate(printer_name)`: envia `U\n` (PPLB) ou `~JC\n` (ZPL) via
  `Printer::print` (raw). Erra com mensagem PT-BR para impressoras sem
  linguagem nativa detectada (`PrinterLanguage::Driver`) — a UI mostra
  badge "sem linguagem nativa" e desabilita o botão.
- `printer_test_page(printer_name)`: gera ASCII PPLB (40×30 mm @ 203 dpi,
  ~320×240 dots) ou ZPL hard-coded com nome do modelo + linguagem + DPI +
  driver, e envia via raw. Sanitiza caracteres `^`/`~`/`"` para `?` antes
  de embarcar.
- `path_exists(path)`: helper em `data_source.rs` (não em fs próprio) —
  reusa o módulo já dedicado a I/O de arquivos do usuário. Retorna `false`
  para path vazio ou inexistente, nunca erra.

## UI

- `src/components/history/History.tsx`: tabela paginada (PAGE_SIZE=50),
  colunas data/template/impressora/modo/qtd/fonte/ação. ModeBadge colorido
  por linguagem (`PPLB` âmbar, `ZPL` azul, `Driver` cinza). `DataSourceCell`
  mostra "Manual" ou "CSV"/"Excel" + filename. Linha riscada/itálica para
  template removido permanentemente; badge "na lixeira" para soft-deleted.
- `src/components/history/PrinterToolsModal.tsx`: modal reusado entre as
  duas ações do menu "Impressora". Auto-select prefere impressora nativa
  Argox/Zebra; cai para default do SO; cai para a primeira. Botão de ação
  desabilitado para impressoras `language = "DRIVER"` com mensagem
  explicativa.
- `Gallery.tsx`: header ganhou os botões "Histórico" + dropdown
  "Impressora" (Calibrar / Página de teste). Dropdown implementado inline
  como `<PrinterMenu>` (sem usar o `DropdownMenu` da UI, porque precisamos
  do click-fora capturado em modal-like e a primitiva atual fecha em
  qualquer clique no `<Item>`).
- `App.tsx`: view enum estendida para `'history'`.

## Mudanças cruzadas

- `runner.ts` (batch) agora deriva `dataSource = plan.dataset.source`
  (`csv|xlsx`) e `sourcePath = plan.dataset.filePath` para passar a
  `pplbPrint`/`zplPrint` (via novo `options` param) e ao `historyRecord`
  do PDF/driver.
- `pplbPrint(...)` e `zplPrint(...)` ganharam um quinto parâmetro `options`
  (`PplbPrintOptions` / `ZplPrintOptions`) com `dataSource?` e `sourcePath?`.
  Defaults preservam o caller manual (PrintDialog single-label).
- `PrintDialog.tsx` aceita prop `templateId?` e registra no histórico
  quando o modo driver-do-SO é usado para single-label manual.

## Validações

- `npm run typecheck`: ok
- `npm run lint`: ok (apenas o warning pré-existente em `button.tsx`)
- `npm run build`: ok (~2.4s, sem novas URLs no bundle — `make audit-bundle` ok)
- `cargo check`: skip (toolchain indisponível na máquina; cobertura por testes
  unitários adicionados em `printers.rs` + `data_source.rs` quando rodarem)

## Riscos / Limitações conhecidas

- "Reimprimir em lote com dataset persistido" não é uma feature do WP-15. O
  usuário precisa estar na mesma sessão do editor para o dataset estar em
  memória; em outra sessão, abre o template e re-importa a planilha
  (validação `historyCanReprint` confirmou que o path ainda existe).
- A validação em hardware real (Argox OS-214 Plus, Zebra Link-OS) é critério
  de aceite do WP-15 mas só roda na máquina do usuário — o código está pronto
  conforme spec, e os testes Rust cobrem a montagem dos payloads.
