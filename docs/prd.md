# PRD — Bartender

**Software desktop standalone para criação e impressão de etiquetas em impressoras Argox OS-214 Plus e impressoras Zebra (ZPL)**

| Campo | Valor |
|---|---|
| Versão do documento | 1.0 |
| Data | 15 de maio de 2026 |
| Status | Draft para implementação |
| Tipo de produto | Aplicação desktop standalone, single-user, 100% offline |
| Plataformas | Windows 10/11 (x64) e macOS 12+ (Intel e Apple Silicon com Rosetta 2) |
| Inspiração funcional | Seagull BarTender (capabilities/print) |

---

## 1. Visão geral

### 1.1 Problema

Para imprimir etiquetas de uma loja de roupas hoje é usado o **Microsoft Word**, que apresenta dois problemas graves:

1. **Diagramação inconsistente** — ao imprimir, as etiquetas saem fora das margens configuradas. O Word renderiza via driver de impressão genérico, sem controle direto sobre o hardware da impressora de etiquetas (Argox OS-214 Plus).
2. **Pobreza tipográfica** — poucas fontes e poucos estilos disponíveis para variar o layout das etiquetas.

### 1.2 Solução

Um software desktop dedicado à criação e impressão de etiquetas, inspirado nos pontos fortes do BarTender:

- Editor visual WYSIWYG de etiquetas com posicionamento pixel-perfect.
- Catálogo amplo de fontes (sistema + bundle do app).
- Geração de códigos de barras 1D e 2D em vários padrões.
- Impressão a partir de planilhas (CSV/Excel) em lote.
- Pré-visualização realista e exportação em PDF antes de imprimir.
- Templates salvos, editáveis, importáveis e exportáveis.

Comunicação direta com a impressora via **driver nativo do SO** (renderização raster) e, opcionalmente, via **linguagem nativa PPLB/ZPL** para precisão máxima de posicionamento.

### 1.3 Escopo

| Está dentro | Está fora |
|---|---|
| Uso por **um único usuário** (sem multi-usuário, sem auth) | Vendas, licenciamento, marketplace |
| Funcionamento **100% offline** | Cloud, sincronização, multi-device |
| Banco **local SQLite** | Servidor remoto, backup automático em nuvem |
| Argox OS-214 Plus e impressoras Zebra (ZPL) | Impressoras de outros fabricantes |
| Templates locais com import/export por arquivo | Compartilhamento online de templates |
| Pré-visualização e PDF | OCR, leitura de código de barras, integração com balanças |

---

## 2. Usuário e contexto

### 2.1 Persona

Único usuário: dono(a) ou operador(a) de uma **loja de roupas**, com conhecimento básico de informática (usa Word, Excel, navegador). Não é programador. Quer criar etiquetas de produto (com SKU, descrição, preço, código de barras) e imprimi-las em lote a partir de uma planilha do estoque.

### 2.2 Cenários de uso principais

| # | Cenário | Frequência |
|---|---|---|
| C1 | Criar um novo modelo de etiqueta do zero | Baixa (1-2x por temporada) |
| C2 | Editar um modelo existente | Média |
| C3 | Imprimir uma única etiqueta (unitária) | Alta |
| C4 | Imprimir um lote a partir de planilha Excel/CSV | Alta |
| C5 | Pré-visualizar e exportar para PDF antes de imprimir | Alta |
| C6 | Exportar template para backup ou para outro computador | Baixa |
| C7 | Importar template de backup | Baixa |

### 2.3 Volume esperado

Baixo a moderado: dezenas a poucas centenas de etiquetas por sessão de impressão. Não é uso industrial.

---

## 3. Stack técnica recomendada

### 3.1 Framework

**Tauri 2.x** (Rust + Webview nativo + frontend web).

**Por que Tauri e não Electron**:

- Binário 10–20× menor que Electron — instalador < 15 MB.
- Performance superior, consumo de memória baixo.
- Acesso nativo a USB, sistema de impressão e arquivos sem precisar de Node.js embutido.
- Builds nativos para Windows (.msi/.exe) e macOS (.dmg, universal para Intel + Apple Silicon).
- Suporte first-class a SQLite via plugin oficial.

Alternativa viável: **Electron + electron-forge** se a equipe tiver mais familiaridade com Node puro. O PRD usa Tauri como referência por ser superior tecnicamente para o caso, mas o produto final independe da escolha.

### 3.2 Frontend

- **React 18 + TypeScript** — UI principal.
- **Vite** — bundler.
- **Fabric.js** ou **Konva.js** — canvas WYSIWYG para o editor de etiquetas (Konva tem melhor performance para muitos objetos; Fabric tem API mais madura para edição de texto e seleção). **Recomendação: Konva.js**.
- **Tailwind CSS + shadcn/ui** — sistema de design e componentes.
- **Zustand** — state management (leve, sem boilerplate).
- **react-hook-form + zod** — formulários e validação.

### 3.3 Backend (camada Rust dentro do Tauri)

- **rusqlite** ou **sqlx** — acesso ao SQLite local.
- **printpdf** ou **genpdf** — geração de PDF para preview/export.
- **bwip-rs** ou geração de barcode no frontend com **JsBarcode** + **qrcode** — códigos de barras.
- **rust-fontconfig** + APIs nativas — enumeração de fontes do sistema.
- Comandos Tauri (`#[tauri::command]`) para expor impressão, arquivo, BD ao frontend.

### 3.4 Comunicação com impressora

**Dois modos**, selecionáveis por template:

**Modo A — Driver do SO (raster, padrão recomendado para o usuário leigo)**

- O app renderiza a etiqueta num canvas/PDF e envia ao driver nativo da impressora (instalado no SO).
- Windows: usa a Windows Print Spooler API via Rust crate `printers` ou via comando do sistema.
- macOS: usa CUPS via `lpr`/IPP.
- Vantagem: o usuário escolhe a impressora no diálogo padrão e funciona com qualquer impressora compatível (não só Argox/Zebra).
- Pré-requisito: driver Argox para macOS instalado (Argox publica driver oficial macOS para a OS-214 Plus, com suporte CUPS 2.1+; em Apple Silicon requer Rosetta 2).

**Modo B — Linguagem nativa (PPLB para Argox, ZPL para Zebra)**

- O app gera o código PPLB ou ZPL e envia **raw** para a impressora via USB ou TCP.
- Vantagem: controle pixel-perfect, sem dependência da camada de renderização do SO, sem o problema clássico de "etiqueta sai fora da margem".
- Implementação: spool raw com `RawPrintJob` no Windows; no macOS usa `lp -o raw` via CUPS.
- Bibliotecas: **`zpl-rs`** (Rust) para Zebra; para PPLB não há crate pronta, então gera-se a string PPLB conforme manual da Argox (PPLA, PPLB e PPLZ são suportados pelo modelo). A Argox OS-214 Plus suporta PPLA e PPLB; a versão Pro adiciona PPLZ.

> O **Modo B** resolve o problema relatado pelo cliente sobre o Word (etiquetas saindo fora das margens). Esse é o modo padrão para Argox e Zebra no app.

### 3.5 Persistência

- **SQLite** local via plugin Tauri (`tauri-plugin-sql`).
- Localização do banco:
  - Windows: `%APPDATA%\Bartender\bartender.db`
  - macOS: `~/Library/Application Support/Bartender/bartender.db`
- Migrations versionadas com `sqlx::migrate!` ou `refinery`.

### 3.6 Distribuição

- Instaladores assinados:
  - Windows: `.msi` via WiX (Tauri bundler nativo).
  - macOS: `.dmg` universal (Intel + Apple Silicon), notarizado pela Apple (importante para evitar bloqueio do Gatekeeper).
- Versionamento semântico (`major.minor.patch`).
- Auto-update **desabilitado** (offline-first, single-user). Atualizações são manuais via download de novo instalador.

---

## 4. Arquitetura

### 4.1 Diagrama de componentes (alto nível)

```
┌──────────────────────────────────────────────────────────────────┐
│                            Bartender (Tauri App)                 │
│                                                                  │
│  ┌────────────────────────┐         ┌─────────────────────────┐  │
│  │   Frontend (React)     │  IPC    │     Core (Rust)         │  │
│  │                        │ ◄─────► │                         │  │
│  │  - Editor de Layout    │         │  - SQLite (templates,   │  │
│  │  - Pré-visualização    │         │    histórico, configs)  │  │
│  │  - Wizard de Impressão │         │  - Geração de PDF       │  │
│  │  - Importador planilha │         │  - Geração de PPLB/ZPL  │  │
│  │  - Catálogo de fontes  │         │  - Spool de impressão   │  │
│  │                        │         │  - I/O de arquivos      │  │
│  └────────────────────────┘         └─────────────────────────┘  │
│                                              │                   │
└──────────────────────────────────────────────┼───────────────────┘
                                               ▼
                            ┌──────────────────────────────────┐
                            │  SO (Windows/macOS)              │
                            │   ├─ Spooler de impressão        │
                            │   └─ Driver Argox / Zebra        │
                            └──────────────────────────────────┘
                                               │
                                               ▼
                            ┌──────────────────────────────────┐
                            │   Impressora (USB)               │
                            │     Argox OS-214 Plus / Zebra    │
                            └──────────────────────────────────┘
```

### 4.2 Modelo de dados (SQLite)

```sql
-- Tabela de templates de etiqueta
CREATE TABLE templates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    description     TEXT,
    width_mm        REAL    NOT NULL,
    height_mm       REAL    NOT NULL,
    dpi             INTEGER NOT NULL DEFAULT 203,   -- Argox OS-214 Plus = 203 dpi
    orientation     TEXT    NOT NULL DEFAULT 'portrait', -- 'portrait' | 'landscape'
    background_color TEXT   DEFAULT '#FFFFFF',
    canvas_json     TEXT    NOT NULL,               -- JSON serializado do canvas (objetos)
    thumbnail_png   BLOB,                           -- pré-render para a galeria
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_templates_name ON templates(name);

-- Histórico de impressões
CREATE TABLE print_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id     INTEGER NOT NULL,
    printer_name    TEXT    NOT NULL,
    mode            TEXT    NOT NULL,    -- 'driver' | 'raw_pplb' | 'raw_zpl'
    quantity        INTEGER NOT NULL,
    data_source     TEXT,                -- 'manual' | 'csv' | 'xlsx'
    source_path     TEXT,
    printed_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (template_id) REFERENCES templates(id)
);

-- Impressoras conhecidas (cache)
CREATE TABLE printers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    system_name     TEXT    NOT NULL UNIQUE, -- nome reportado pelo SO
    friendly_name   TEXT,
    model           TEXT,                    -- 'Argox OS-214 Plus', 'Zebra ZD220', etc.
    language        TEXT,                    -- 'PPLB' | 'PPLA' | 'ZPL' | 'DRIVER'
    default_dpi     INTEGER DEFAULT 203,
    is_default      INTEGER NOT NULL DEFAULT 0,
    last_used_at    TEXT
);

-- Configurações globais
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

### 4.3 Formato do `canvas_json`

Representação do layout, agnóstica ao engine de canvas. Estrutura:

```json
{
  "version": 1,
  "units": "mm",
  "canvas": {
    "width": 50,
    "height": 30,
    "dpi": 203,
    "background": "#FFFFFF"
  },
  "objects": [
    {
      "id": "obj_1",
      "type": "text",
      "x": 2,
      "y": 2,
      "width": 46,
      "height": 6,
      "rotation": 0,
      "fontFamily": "Arial",
      "fontSize": 12,
      "fontWeight": "bold",
      "fontStyle": "normal",
      "textAlign": "left",
      "color": "#000000",
      "content": "{{ produto }}",
      "binding": { "field": "produto", "fallback": "Camisa" }
    },
    {
      "id": "obj_2",
      "type": "barcode",
      "x": 2,
      "y": 12,
      "width": 46,
      "height": 12,
      "symbology": "CODE128",
      "value": "{{ sku }}",
      "showText": true,
      "binding": { "field": "sku" }
    },
    {
      "id": "obj_3",
      "type": "text",
      "x": 2,
      "y": 26,
      "fontFamily": "Arial",
      "fontSize": 10,
      "content": "R$ {{ preco }}"
    }
  ]
}
```

Objetos suportados: `text`, `barcode`, `qrcode`, `image`, `rectangle`, `line`, `ellipse`.

### 4.4 Formato de exportação de template (`.etlbl`)

Arquivo único, autocontido, para import/export.

- Extensão: `.etlbl` (bartender label)
- Formato interno: ZIP com:
  - `template.json` — metadata + `canvas_json`
  - `assets/` — imagens embarcadas (logo, etc.) referenciadas no canvas
  - `thumbnail.png` — preview gerado no momento do export
  - `manifest.json` — versão do schema, app version, hash

Versionado para retrocompatibilidade futura.

---

## 5. Requisitos funcionais

### 5.1 Gestão de templates (RF-T)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-T-01 | Listar todos os templates salvos com thumbnail, nome, dimensões e data de modificação | Must |
| RF-T-02 | Criar template novo a partir de dimensões customizadas (mm) ou de presets (ex: 50×30, 40×25, 100×50) | Must |
| RF-T-03 | Duplicar template existente | Should |
| RF-T-04 | Renomear template | Must |
| RF-T-05 | Excluir template (com confirmação) | Must |
| RF-T-06 | Buscar templates por nome | Should |
| RF-T-07 | Exportar template para arquivo `.etlbl` | Must |
| RF-T-08 | Importar template de arquivo `.etlbl` (com detecção de conflito de nome) | Must |
| RF-T-09 | Versionamento simples — `updated_at` e `version` incrementado a cada salvamento | Should |

### 5.2 Editor de layout (RF-E)

Inspirado no BarTender Designer. Editor WYSIWYG baseado em canvas.

| ID | Requisito | Prioridade |
|---|---|---|
| RF-E-01 | Canvas com dimensões em milímetros, fiel à dimensão real da etiqueta | Must |
| RF-E-02 | Régua superior e lateral com marcações em mm | Should |
| RF-E-03 | Grid configurável (1 mm, 5 mm) com snap on/off | Must |
| RF-E-04 | Zoom in/out (25%, 50%, 75%, 100%, 150%, 200%, 400%) + atalhos `Ctrl/⌘ +/-` | Must |
| RF-E-05 | Inserir objeto de **texto** | Must |
| RF-E-06 | Inserir objeto de **código de barras 1D** | Must |
| RF-E-07 | Inserir objeto de **QR Code** (2D) | Must |
| RF-E-08 | Inserir objeto de **imagem** (PNG, JPG, SVG) — arrastar arquivo ou colar | Must |
| RF-E-09 | Inserir formas: **retângulo, linha, elipse** | Should |
| RF-E-10 | Mover objetos com mouse (drag) e teclado (setas, +Shift para passos maiores) | Must |
| RF-E-11 | Redimensionar com handles, mantendo proporção com Shift | Must |
| RF-E-12 | Rotacionar em ângulos livres ou múltiplos de 90° | Must |
| RF-E-13 | Painel de propriedades por objeto selecionado (posição X/Y, largura, altura, rotação) | Must |
| RF-E-14 | Alinhamento entre múltiplos objetos selecionados (esquerda, centro, direita, topo, meio, base) | Should |
| RF-E-15 | Distribuição (horizontal/vertical) entre 3+ objetos | Should |
| RF-E-16 | Ordem de camadas: trazer para frente, mandar para trás, +1, -1 | Should |
| RF-E-17 | Undo/Redo com histórico de pelo menos 50 estados | Must |
| RF-E-18 | Atalhos: `Ctrl/⌘+C`, `+V`, `+X`, `+D` (duplicar), `+Z`, `+Shift+Z`, `Delete` | Must |
| RF-E-19 | Salvar template (`Ctrl/⌘+S`) com indicação visual de "não salvo" no título | Must |
| RF-E-20 | Salvar como (`Ctrl/⌘+Shift+S`) — clonar como novo template | Should |

### 5.3 Tipografia (RF-F)

Resolve o ponto fraco do Word (poucas fontes).

| ID | Requisito | Prioridade |
|---|---|---|
| RF-F-01 | Listar **todas as fontes instaladas no sistema** | Must |
| RF-F-02 | Empacotar com o app um conjunto de **15+ fontes adicionais** licenciadas para uso comercial (Inter, Roboto, Open Sans, Montserrat, Poppins, Lato, Oswald, Bebas Neue, Playfair Display, Source Code Pro, JetBrains Mono, Libre Barcode 39, Libre Barcode 128 — fontes Google Fonts SIL Open Font License) | Must |
| RF-F-03 | Estilos por objeto de texto: **bold, italic, underline, strikethrough** | Must |
| RF-F-04 | Tamanho de fonte de 4 a 200 pt (decimal permitido, ex: 7.5) | Must |
| RF-F-05 | Cor do texto (paleta + custom HEX) | Should |
| RF-F-06 | Alinhamento: esquerda, centro, direita, justificado | Must |
| RF-F-07 | Espaçamento de letra (letter-spacing) e entrelinha (line-height) | Could |
| RF-F-08 | Preview da fonte no seletor (renderizar nome com a própria fonte) | Should |
| RF-F-09 | Texto em múltiplas linhas com quebra automática dentro do bounding box | Must |
| RF-F-10 | Auto-shrink: reduzir fonte se o conteúdo não couber (toggle por objeto) | Could |

### 5.4 Códigos de barras (RF-B)

Inspirado nos pontos fortes do BarTender em barcode generation.

| ID | Requisito | Prioridade |
|---|---|---|
| RF-B-01 | Suportar simbologias 1D: **CODE128**, **CODE39**, **EAN-13**, **EAN-8**, **UPC-A**, **UPC-E**, **ITF (Interleaved 2 of 5)**, **Codabar** | Must |
| RF-B-02 | Suportar 2D: **QR Code**, **Data Matrix**, **PDF417** | Must |
| RF-B-03 | Mostrar/ocultar texto humano-legível embaixo do código | Must |
| RF-B-04 | Configurar altura do código, módulo (espessura da barra), nível de correção (para QR) | Must |
| RF-B-05 | Validar o valor de entrada conforme a simbologia (ex: EAN-13 exige 12 ou 13 dígitos numéricos) com feedback em tempo real | Must |
| RF-B-06 | Renderização em alta resolução para impressão (vetorial sempre que possível) | Must |
| RF-B-07 | Cálculo automático do dígito verificador onde aplicável | Must |
| RF-B-08 | Permitir vincular o valor a um campo de fonte de dados (binding) | Must |

Biblioteca recomendada para o frontend: **bwip-js** (Barcode Writer in Pure JavaScript) — suporta todas as simbologias citadas, é mantida e produz SVG/Canvas.

### 5.5 Fontes de dados e impressão em lote (RF-D)

Inspirado no "data-driven printing" do BarTender.

| ID | Requisito | Prioridade |
|---|---|---|
| RF-D-01 | Importar **CSV** (UTF-8, separador `,` ou `;`) | Must |
| RF-D-02 | Importar **XLSX** (primeira planilha, primeira linha como cabeçalho) | Must |
| RF-D-03 | Mostrar tabela de preview dos dados importados com paginação | Must |
| RF-D-04 | Mapear cada **placeholder do template** (`{{ campo }}`) para uma **coluna da planilha** com dropdown | Must |
| RF-D-05 | Permitir filtrar quais linhas serão impressas (todas, range, seleção manual) | Should |
| RF-D-06 | Definir quantidade por linha (coluna "quantidade" ou valor fixo) | Should |
| RF-D-07 | Detectar valores inválidos (ex: EAN com letras) e listar erros antes de imprimir | Must |
| RF-D-08 | Salvar mapeamento da planilha junto ao template para reuso | Could |

### 5.6 Pré-visualização e PDF (RF-P)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-P-01 | Pré-visualização da etiqueta em proporção real (mm-correto na tela) | Must |
| RF-P-02 | Para impressão em lote: navegação entre páginas (primeira, anterior, próxima, última) | Must |
| RF-P-03 | Exportar **uma etiqueta** como PDF (1 página) | Must |
| RF-P-04 | Exportar **lote completo** como PDF multipágina | Must |
| RF-P-05 | PDF gerado em **vetorial** (texto selecionável, barcodes nítidos em qualquer zoom) | Must |
| RF-P-06 | Nome de arquivo PDF sugerido: `{{ template_name }}_{{ yyyy-mm-dd_HHmm }}.pdf` | Should |
| RF-P-07 | Diálogo de save nativo do SO | Must |

### 5.7 Impressão (RF-I)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-I-01 | Listar impressoras instaladas no SO no diálogo de impressão | Must |
| RF-I-02 | Identificar automaticamente impressoras Argox e Zebra pelo nome/modelo | Should |
| RF-I-03 | Para Argox/Zebra: opção "Modo nativo (PPLB/ZPL)" ON por padrão | Must |
| RF-I-04 | Para outras impressoras: usar driver do SO | Must |
| RF-I-05 | Definir quantidade total de cópias | Must |
| RF-I-06 | Imprimir página de teste (etiqueta com nome do modelo e configurações da impressora) | Should |
| RF-I-07 | Registrar cada impressão no histórico (`print_history`) | Must |
| RF-I-08 | Detectar erros do spooler e mostrar mensagem clara (impressora offline, sem papel — quando o driver expõe o status) | Should |
| RF-I-09 | Reimprimir do histórico (com o template e dados originais, se ainda existirem) | Could |

---

## 6. Requisitos não-funcionais

### 6.1 Performance

- Abrir o app em até **3 segundos** (cold start) em hardware moderno.
- Editor responsivo até **100 objetos** no canvas sem queda perceptível de FPS.
- Pré-visualização de lote de 500 etiquetas gerada em até **10 segundos**.
- PDF de 500 etiquetas exportado em até **15 segundos**.

### 6.2 Confiabilidade

- Autosave a cada 30 segundos enquanto há mudanças não salvas.
- Recovery: ao abrir, se houver autosave mais recente que o último save manual, oferecer recuperar.
- Validação de integridade do `.etlbl` no import (hash + verificação de schema).
- Nenhum crash silencioso: erros não tratados devem mostrar diálogo e logar em `~/Library/Logs/Bartender/` (macOS) ou `%LOCALAPPDATA%\Bartender\logs\` (Windows).

### 6.3 Usabilidade

- **Atalhos consistentes** entre Windows (`Ctrl`) e macOS (`⌘`).
- **UI em português** (PT-BR). Internacionalização preparada via `i18next` (mas só PT-BR no MVP).
- Tooltips em todos os controles do toolbar.
- Onboarding tour curto na primeira execução (3-4 passos).

### 6.4 Offline

- Zero requisições de rede após instalação. Verificado por auditoria do bundle.
- Fontes Google empacotadas localmente como `.ttf`/`.woff2`, não via CDN.
- Nenhuma telemetria.

### 6.5 Segurança

- SQLite com permissões de arquivo restritas ao usuário do SO.
- Templates importados são sanitizados — imagens são revalidadas, JSON é parseado com schema strict (zod no frontend, serde com `deny_unknown_fields` no Rust).
- Sem execução de código dentro de templates (nenhum campo é avaliado como expressão arbitrária).

### 6.6 Compatibilidade

| Plataforma | Versão mínima | Arquitetura |
|---|---|---|
| Windows | 10 (1809) | x64 |
| macOS | 12 Monterey | Intel x64 + Apple Silicon (universal). Em Apple Silicon, **Rosetta 2 é requerida** para o driver da Argox |

### 6.7 Acessibilidade

- Contraste mínimo AA na UI.
- Navegação por teclado nas funções principais.
- Sem requisitos de leitor de tela no MVP (single-user com perfil conhecido).

---

## 7. Integração com a Argox OS-214 Plus

### 7.1 Características da impressora

| Característica | Valor |
|---|---|
| Resolução | 203 dpi (8 dots/mm) |
| Velocidade | 2–3 ips (51–76 mm/s) |
| Largura máxima de impressão | 4,16" (105 mm) |
| Comprimento máximo | 43" (1092 mm) |
| Linguagens (emulações) | **PPLA** e **PPLB** (a versão **Pro** adiciona PPLZ) |
| Interfaces | Centronics paralela, RS-232, USB |
| Sensor de mídia | Gap / black mark reflective sensor |
| Fontes internas | 5 fontes alfanuméricas (1,25 mm a 6,0 mm) |
| Drivers oficiais | Windows (Vista até 11, Server 2016), macOS (M1+ com Rosetta 2, CUPS 2.1+), Linux (CUPS 2.1+) |

### 7.2 Estratégia de impressão na Argox

**Padrão: gerar PPLB e enviar raw via USB.**

PPLB é mais simples e tem documentação clara no manual oficial da Argox. Suporta os símbolos 1D necessários, QR Code via comandos posteriores ao firmware, e gráficos via PCX/Binary raster.

Exemplo de PPLB para uma etiqueta de roupa (50×30 mm a 203 dpi):

```
N
q400          ; largura em dots (50mm * 8)
Q240,24       ; comprimento em dots + gap
S2            ; speed 2 ips
D8            ; darkness
A20,10,0,3,1,1,N,"Camiseta Polo"
A20,50,0,2,1,1,N,"Tam: M"
A20,80,0,2,1,1,N,"R$ 89,90"
B20,120,0,1,2,2,80,B,"7891234567890"   ; EAN-13
P1            ; print 1 copy
```

Para Zebra (ZPL), a tradução é equivalente:

```
^XA
^PW400
^LL240
^FO20,10^A0N,30,30^FDCamiseta Polo^FS
^FO20,50^A0N,20,20^FDTam: M^FS
^FO20,80^A0N,25,25^FDR$ 89,90^FS
^FO20,120^BEN,80,Y,N^FD7891234567890^FS
^PQ1
^XZ
```

O app deve ter uma camada de tradução **canvas_json → PPLB** e **canvas_json → ZPL**, independente uma da outra, com testes unitários cobrindo:

- Posicionamento (mm → dots na resolução correta).
- Rotação (0°, 90°, 180°, 270° — Argox/Zebra suportam só esses 4 em modo raw para texto).
- Fontes: como Argox tem só 5 fontes embarcadas, textos com fontes customizadas devem ser **rasterizados** como imagem no Rust (`image` crate + `fontdue` ou `ab_glyph`) e enviados como gráfico via PPLB.
- Barcodes: usar comandos nativos da Argox para CODE128, EAN-13, etc. quando disponíveis (renderização mais limpa); cair para raster quando a simbologia não tiver comando nativo.
- QR Code: comando nativo `b` na Argox; `^BQ` na Zebra.

### 7.3 macOS — pontos críticos

1. O usuário precisa baixar e instalar o driver oficial da Argox para macOS antes do primeiro uso. A documentação do app deve incluir link e instruções.
2. Em Apple Silicon, é necessário ter **Rosetta 2 instalada** (`softwareupdate --install-rosetta`).
3. A impressora aparecerá em `System Preferences → Printers & Scanners`. O app a detectará via CUPS.
4. Para envio raw: `lp -o raw -d <printer>` ou via libcups.

### 7.4 Calibração

Adicionar no menu uma ação **"Calibrar impressora"** que envia o comando proprietário de calibração:

- Argox PPLB: comando `U` (auto-sense) ou via FEED button no hardware.
- Zebra ZPL: `~JC` (calibrate).

---

## 8. Comparação com BarTender (referência funcional)

Mapeamento das capabilities do BarTender que **estão no escopo do MVP**:

| BarTender (Seagull) | Bartender (este projeto, MVP) | Notas |
|---|---|---|
| Designer visual | ✅ Sim (Konva.js) | Subset focado em etiquetas simples |
| 11.000+ drivers de impressora | ❌ Não | Foco em Argox + Zebra; outras via driver do SO |
| Database connectors (Excel, SQL, Oracle, ODBC) | ⚠️ Parcial | Só CSV e XLSX |
| RFID encoding | ❌ Não | Fora de escopo |
| Cloud / mobile | ❌ Não | Standalone offline |
| Forms para data entry no print time | ⚠️ Parcial | Edição inline dos campos antes de imprimir |
| Print history | ✅ Sim | Tabela `print_history` |
| Native PDF printing | ✅ Sim | Via `printpdf` |
| Print preview | ✅ Sim | RF-P-01 |
| Batch printing | ✅ Sim | RF-D |
| GS1 standards | ⚠️ Parcial | Suporte ao GS1-128 via CODE128 + AI manual no MVP |
| 70+ trigger actions / automation | ❌ Não | Fora de escopo single-user |
| File Drop / REST API / hot folder | ❌ Não | Fora de escopo |
| Failover de impressora | ❌ Não | Fora de escopo |

O Bartender (este projeto) entrega as **capabilities essenciais** que resolvem o problema da loja (criar layouts ricos, imprimir em lote a partir de planilha, preview, PDF), sem a complexidade enterprise do BarTender (Seagull Scientific).

---

## 9. Fluxos principais (user flows)

### 9.1 Criar primeiro template

1. Abre o app → tela inicial vazia → botão **"Novo template"**.
2. Modal pergunta: nome, dimensões (presets ou custom em mm), DPI (sugere 203 para Argox), orientação.
3. Abre o **editor** com canvas vazio.
4. Usuário arrasta objetos do toolbar (Texto, Barcode, QR, Imagem, Formas) para o canvas.
5. Seleciona cada objeto e ajusta no painel de propriedades.
6. Usa placeholders `{{ campo }}` em textos e barcodes para dados dinâmicos.
7. `Ctrl/⌘+S` → salva. Volta para a galeria com o thumbnail gerado.

### 9.2 Imprimir lote a partir de planilha

1. Galeria → clica no template → botão **"Imprimir"**.
2. Wizard passo 1: **fonte de dados** — escolhe "Planilha (CSV ou Excel)" → seleciona arquivo.
3. Passo 2: **mapeamento** — tabela mostra as colunas da planilha; para cada placeholder do template, escolhe a coluna correspondente.
4. Passo 3: **filtro/quantidade** — escolhe linhas (todas/range/seleção) e quantidade por linha.
5. Passo 4: **preview** — mostra carrossel das primeiras 10 etiquetas + total ("523 etiquetas serão impressas").
6. Passo 5: **destino** — escolhe impressora detectada, modo (driver/nativo PPLB/ZPL).
7. Botões: **"Exportar PDF"** ou **"Imprimir"**.
8. Após imprimir, mensagem de sucesso e registro no histórico.

### 9.3 Exportar template

1. Galeria → menu de contexto no template → **"Exportar"**.
2. Diálogo de save → escolhe local → salva `.etlbl`.

### 9.4 Importar template

1. Galeria → botão **"Importar"** → diálogo de open → seleciona `.etlbl`.
2. Validação. Se nome já existe → modal: "Substituir / Manter ambos (renomear) / Cancelar".
3. Template aparece na galeria.

---

## 10. Roadmap de implementação

### Fase 0 — Setup (1 semana)

- Bootstrap Tauri + React + TypeScript + Tailwind.
- Configurar SQLite com migrations.
- Build e instaladores para Windows e macOS rodando vazios.

### Fase 1 — Editor MVP (3 semanas)

- Canvas Konva com criação/edição de texto, retângulo, linha.
- Painel de propriedades.
- Undo/redo.
- Salvar/carregar template no SQLite.
- Galeria de templates.

### Fase 2 — Barcodes e fontes (2 semanas)

- Integração bwip-js para 1D e 2D.
- Catálogo de fontes do sistema + bundle de fontes adicionais.
- Validação de barcodes.

### Fase 3 — Preview e PDF (1 semana)

- Renderização de preview fiel.
- Export PDF single e multipágina.

### Fase 4 — Impressão direta (3 semanas)

- Integração com spooler do Windows.
- Integração com CUPS no macOS.
- Geração de PPLB para Argox (módulo Rust com testes).
- Geração de ZPL para Zebra (módulo Rust com testes).
- Modo raw vs driver.

### Fase 5 — Fontes de dados e lote (2 semanas)

- Importação CSV e XLSX.
- UI de mapeamento.
- Wizard de impressão em lote.
- Histórico.

### Fase 6 — Import/export e polimento (1 semana)

- Formato `.etlbl`.
- Atalhos completos.
- Onboarding.
- QA com a impressora real.

**Total estimado: 13 semanas (~3 meses)** com 1 desenvolvedor full-time experiente em React + Rust.

---

## 11. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Driver Argox para macOS apresentar instabilidade em Apple Silicon | Média | Alto | Documentar requisito de Rosetta 2; cair para Modo B (raw PPLB) que não depende do driver de impressão do SO, usando comunicação USB direta via libusb (Rust crate `rusb`) |
| Renderização de fontes customizadas no canvas vs no PPLB raster divergir | Alta | Médio | Pipeline único: renderizar com `fontdue` no Rust também no preview, garantindo paridade pixel a pixel |
| Etiquetas saindo deslocadas (mesmo problema do Word) | Média | Alto (é o problema central a resolver) | Modo nativo PPLB/ZPL como padrão para Argox/Zebra. Calibração obrigatória no setup inicial. Testes em hardware real durante toda a Fase 4 |
| Apple Notarization rejeitar build | Baixa | Médio | Configurar entitlements corretos e testar notarização desde a Fase 0 |
| Performance do canvas com muitos objetos | Baixa | Médio | Konva tem layers e caching; testar com 100+ objetos cedo |
| Usuário perder templates por exclusão acidental | Média | Alto | Soft delete (flag `deleted_at`) + lixeira na UI com restauração |

---

## 12. Critérios de aceitação

O produto é considerado pronto para uso quando:

1. ✅ Instala em Windows 10/11 e macOS 12+ (Intel e Apple Silicon) sem warnings de segurança.
2. ✅ Cria etiqueta de roupa (50×30 mm) com nome do produto, tamanho, preço e código de barras EAN-13 em menos de 5 minutos partindo de zero.
3. ✅ Imprime corretamente na Argox OS-214 Plus via USB no modo PPLB, sem desalinhamento, em 3 impressões consecutivas com a mesma calibração.
4. ✅ Imprime corretamente em uma impressora Zebra (qualquer modelo Link-OS) via ZPL.
5. ✅ Importa planilha Excel com 100 SKUs, mapeia 4 placeholders, gera preview e PDF de 100 páginas em menos de 30 segundos no total.
6. ✅ Exporta um template para `.etlbl` e importa em outra instalação do app, com canvas idêntico (incluindo imagens embarcadas).
7. ✅ Funciona com Wi-Fi e Ethernet **desligados** durante toda uma sessão de uso normal.
8. ✅ Banco SQLite preservado entre atualizações do app (migrations idempotentes).

---

## 13. Glossário

| Termo | Significado |
|---|---|
| **PPLA** | Printer Programming Language A — linguagem nativa da Argox, derivada de SATO. |
| **PPLB** | Printer Programming Language B — linguagem nativa da Argox, derivada de Eltron/EPL. Mais usada. |
| **PPLZ** | Emulação de ZPL na Argox (modelos Pro). |
| **ZPL** | Zebra Programming Language — linguagem nativa das impressoras Zebra Link-OS. |
| **CUPS** | Common Unix Printing System — sistema de impressão do macOS e Linux. |
| **DPI** | Dots per inch — resolução da impressora. A Argox OS-214 Plus é 203 dpi. |
| **GS1** | Padrão global de identificação de produtos. EAN-13 e GS1-128 são parte do padrão. |
| **Raw printing** | Envio do código nativo (PPLB/ZPL) direto ao spooler, sem passar pelo driver de renderização. |
| **WYSIWYG** | What You See Is What You Get — editor onde a tela reflete o resultado impresso. |
| **`.etlbl`** | Formato proprietário do Bartender para export/import de templates. |

---

**Fim do documento.**