# Screenshots

Capturas reais do app Bartender vão aqui. Enquanto não houver imagens, o
componente `<ScreenshotFrame>` renderiza um placeholder com a legenda
descrevendo o que deveria estar na imagem.

## Lista esperada

Capture estas telas e salve com os nomes abaixo. Resolução recomendada:
1600×1000, escala 2x para Retina.

| Arquivo | Descrição |
|---|---|
| `gallery.png` | Galeria de templates com 6-8 cartões variados, busca visível, botão "+ Novo template" no topo. |
| `editor-canvas.png` | Editor com um template aberto, painel de camadas à esquerda, canvas no centro com texto + retângulo + barcode, painel de propriedades à direita. |
| `editor-properties-text.png` | Editor com um objeto de texto selecionado e o painel direito mostrando fonte/peso/alinhamento/cor. |
| `barcodes-properties.png` | Editor com um barcode CODE128 selecionado e o painel direito mostrando tipo/dados/validação. |
| `barcodes-qr.png` | Editor com um QR code e seleção de nível L/M/Q/H no painel direito. |
| `print-dialog.png` | Diálogo de impressão com impressora selecionada, modo (driver/PPLB/ZPL), densidade e preview. |
| `print-preview.png` | Pré-visualização da etiqueta antes de imprimir. |
| `pplb-zpl-developer.png` | Diálogo de impressão em modo desenvolvedor mostrando o comando ZPL gerado. |
| `batch-import.png` | Wizard de lote, passo 1: CSV importado com preview das 20 primeiras linhas. |
| `batch-mapping.png` | Wizard de lote, passo 2: mapeamento de placeholders para colunas. |
| `batch-preview.png` | Wizard de lote, passo 3: pré-visualização paginada das etiquetas geradas. |
| `etlbl-import.png` | Diálogo de importação .etlbl com validação de hash. |
| `pdf-export.png` | Diálogo de exportação PDF com opções (fidelidade, sangria, marcas de corte). |
| `history.png` | Histórico de impressões com filtros e botão de reimpressão. |
| `calibration-page.png` | Página de calibração impressa (foto da etiqueta com grade de 5 mm). |
| `calibration-form.png` | Formulário de calibração no app, com campos X e Y. |
| `autosave-recovery-banner.png` | Banner de recuperação automática após crash. |
| `trash.png` | Lixeira com templates excluídos e botão "Restaurar". |
| `home-hero.png` | Composição do app (hero do site) — opcional, para uso na home. |

## Como capturar

```bash
make dev
```

No macOS: `Cmd + Shift + 4` para selecionar a área, ou `Cmd + Shift + 5`
para captura com timer e bordas.

No Windows: `Win + Shift + S` (Snipping Tool).

No Linux: `gnome-screenshot` ou `flameshot`.

Otimize as PNGs antes de comitar (ex.: `pngquant`, `oxipng`) para manter o
peso do bundle baixo.
