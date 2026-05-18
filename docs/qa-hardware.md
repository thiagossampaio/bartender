# QA de Hardware — Bartender (WP-17)

> Checklist operacional para o QA final em hardware real, antes do release.
> Cobre os critérios de aceitação do PRD §12 e os pontos de impressão das
> SPECs 09–12 (driver do SO, modo nativo PPLB/ZPL, calibração e página de teste).

## Dispositivos alvo

| Modelo | Linguagem MVP | Conexão | Observações |
|---|---|---|---|
| **Argox OS-214 Plus** | PPLB | USB | macOS exige driver oficial Argox + Rosetta 2 (R12). |
| **Zebra (qualquer Link-OS)** | ZPL | USB / Ethernet | Validar com TLP 2844-Z ou GK420. |

## Pré-requisitos

- [ ] Build assinado/notarizado do app instalado (não dev build).
- [ ] Driver Argox instalado e impressora visível em **Sistema → Impressoras**.
- [ ] Driver Zebra instalado e impressora visível em **Sistema → Impressoras**.
- [ ] Rolo de etiquetas instalado em ambos com gap calibrado.
- [ ] Conta de usuário "padrão" (não admin) — replica o ambiente real.
- [ ] Wi-Fi/Ethernet **DESLIGADOS** durante a sessão (PRD §12 item 7).

## 1. Cold start e instalação (PRD §12 item 1)

- [ ] `.msi` instala em Windows 10 sem warning de segurança.
- [ ] `.msi` instala em Windows 11 sem warning de segurança.
- [ ] `.dmg` abre no macOS 12+ Intel sem bloqueio Gatekeeper.
- [ ] `.dmg` abre no macOS 12+ Apple Silicon sem bloqueio Gatekeeper.
- [ ] Cold start ≤ 3 s (cronometrar do clique no ícone até a janela responsiva).

## 2. Onboarding e i18n (SPEC-14)

- [ ] Tour de 4 passos aparece na primeira execução.
- [ ] Tour respeita `Esc`, ←/→ e clique fora.
- [ ] Após "Concluir", o flag `onboarding_completed_v1` persiste — segunda execução **não** mostra o tour.
- [ ] Varredura visual: 100 % das strings da UI estão em PT-BR (galeria, editor, painéis, modais, histórico, lixeira, wizard).
- [ ] Tooltips presentes em todos os botões do toolbar do editor.

## 3. Atalhos cross-platform (SPEC-14 item 1)

Validar em **ambos** os sistemas — Win com `Ctrl`, macOS com `⌘`:

- [ ] Save (`Ctrl/⌘+S`) com indicador "Salvando…".
- [ ] Save As (`Ctrl/⌘+Shift+S`).
- [ ] Undo (`Ctrl/⌘+Z`) e Redo (`Ctrl/⌘+Shift+Z` / `Ctrl/⌘+Y`).
- [ ] Copy / Cut / Paste (`Ctrl/⌘+C/X/V`).
- [ ] Duplicate (`Ctrl/⌘+D`).
- [ ] Select all (`Ctrl/⌘+A`).
- [ ] Delete (`Delete` / `Backspace`).
- [ ] Esc limpa a seleção.
- [ ] Zoom in/out/100 % (`Ctrl/⌘+`, `Ctrl/⌘+−`, `Ctrl/⌘+0`).
- [ ] Setas movem 1 mm; `Shift+`seta move 10 mm.

## 4. Acessibilidade AA (SPEC-14 item 5)

- [ ] Auditoria axe-core / Lighthouse na galeria, editor e histórico: **zero erros de contraste**.
- [ ] Navegação por `Tab` percorre toolbar → canvas → properties em ordem lógica.
- [ ] Focus visible em todos os botões interativos (anel azul/cinza claro).
- [ ] `aria-label` correto em ícones-só-ícone (testar com inspetor de acessibilidade do macOS / Narrator do Windows).

## 5. Performance (SPEC-14 item 6 / PRD §6.1)

- [ ] Cold start ≤ 3 s.
- [ ] Editor com **100 objetos** mantém ≥ 60 FPS ao arrastar/transformar.
- [ ] **Preview** de 500 etiquetas (CSV ou XLSX) gerado em ≤ 10 s.
- [ ] **PDF** de 500 etiquetas exportado em ≤ 15 s.
- [ ] Memória residente após preview de 500 etiquetas: < 500 MB.

## 6. Impressão Argox OS-214 Plus (PRD §12 item 3, SPEC-10)

- [ ] App detecta a OS-214 Plus pelo nome do driver.
- [ ] Mode badge no PrintDialog mostra "PPLB" (não "Driver").
- [ ] **Calibração** via menu Impressora → Calibrar imprime corretamente.
- [ ] **Página de teste** imprime nome do modelo + DPI + status.
- [ ] Etiqueta de roupa 50×30 mm com nome + tamanho + preço + EAN-13:
  - [ ] 3 impressões consecutivas com a mesma calibração saem alinhadas.
  - [ ] Código de barras EAN-13 lê em scanner.
  - [ ] Texto não fica recortado nas margens.
- [ ] Etiqueta com **fontes do bundle** (Inter + variações): pixel-paridade entre canvas e impressão (R02).
- [ ] Reimpressão a partir do **Histórico** funciona sem reabrir CSV.

## 7. Impressão Zebra (PRD §12 item 4, SPEC-10)

- [ ] App detecta a Zebra pelo nome do driver (Link-OS).
- [ ] Mode badge no PrintDialog mostra "ZPL".
- [ ] Calibração + página de teste OK.
- [ ] Etiqueta 60×40 mm com QR Code + texto:
  - [ ] QR Code lê em scanner.
  - [ ] Texto não fica recortado.
  - [ ] Posicionamento bate com o preview ± 0.5 mm.

## 8. Lote / Dados (PRD §12 item 5)

- [ ] Importação de XLSX com 100 SKUs e 4 placeholders → auto-mapeia ≥ 3.
- [ ] Wizard de lote: filtro de linhas, quantidade por linha, preview.
- [ ] Preview + PDF de **100 páginas em < 30 s** total (cronometrar).
- [ ] PDF gerado abre em Preview/Acrobat sem warning.

## 9. Importação / Exportação .etlbl (PRD §12 item 6)

- [ ] Export `.etlbl` de um template com imagens embarcadas.
- [ ] Importar o `.etlbl` em uma instalação limpa do app: canvas idêntico (mm, fontes, posições).
- [ ] Importar `.etlbl` com nome em conflito → modal Substituir/Manter ambos/Cancelar.
- [ ] `.etlbl` com hash inválido → mensagem de erro clara, import abortado.

## 10. Confiabilidade (PRD §12 item 7-8, SPEC-13)

- [ ] **Wi-Fi/Ethernet desligados** durante toda uma sessão: app funciona normalmente.
- [ ] Autosave a cada 30 s: forçar `kill -9` do app durante edição → ao reabrir, modal "Recuperar trabalho não salvo?".
- [ ] Logs gerados em `~/Library/Logs/Bartender/` (macOS) ou `%LOCALAPPDATA%\Bartender\logs\` (Win) com rotação.
- [ ] Lixeira mantém itens indefinidamente — nenhuma purga automática.
- [ ] Hard delete pede confirmação dupla.
- [ ] Atualização do app sobre instalação anterior preserva o banco (`migrations` idempotentes).

## 11. Cenários de erro

- [ ] Driver Argox desinstalado → app exibe instrução clara para o usuário.
- [ ] Impressora desligada → erro amigável (sem stack trace cru).
- [ ] CSV com encoding errado → mensagem clara, sem crash.
- [ ] Banco corrompido (simular trocando bytes do `.db`) → diálogo amigável + caminho do arquivo.

## Registro de execução

| Versão | Data | Plataforma | Argox | Zebra | Observações |
|---|---|---|---|---|---|
| _preencher antes do release_ | | | | | |

> A coluna **Argox** / **Zebra** marca PASS / FAIL após cada release-candidate.
> Bloqueio em qualquer item PASS → release não é cortado.
