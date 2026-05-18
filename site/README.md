# Bartender website

Site institucional do Bartender, hospedado em GitHub Pages
(`https://thiagossampaio.github.io/bartender/`).

Stack: [Astro 5](https://astro.build/) + Tailwind CSS + MDX. Build estático,
i18n nativo (en-US default + pt-BR).

## Estrutura

```
site/
├── astro.config.mjs        # config (i18n, base=/bartender/)
├── tailwind.config.cjs     # tokens DESIGN.md mapeados como utilities
├── src/
│   ├── content/docs/       # 12 páginas MDX × 2 idiomas
│   ├── components/         # TopNav, Footer, GradientOrb, ButtonPill…
│   ├── layouts/            # BaseLayout, DocLayout
│   ├── pages/              # Home, Features, Download, Docs, 404 (en-US)
│   │   └── pt-BR/          # mesmas rotas em pt-BR
│   ├── i18n/               # ui.ts (dicionário), utils.ts (helpers)
│   ├── lib/releases.ts     # mapping de assets/URLs do GitHub Release
│   ├── scripts/            # detect-os, live-version (client-side)
│   └── styles/global.css   # tokens DESIGN.md como CSS vars + typography utilities
└── public/
    ├── favicon.svg         # cópia do logo do app
    └── screenshots/        # capturas reais do app
```

## Desenvolvimento

```bash
cd site
npm install
npm run dev
```

Abre em `http://localhost:4321/bartender/`. Hot-reload em alterações de
qualquer arquivo (incluindo MDX).

## Build estático

```bash
npm run build         # gera site/dist/
npm run preview       # serve dist/ localmente
```

## Variáveis de ambiente

| Variável | Default | Descrição |
|---|---|---|
| `PUBLIC_BARTENDER_VERSION` | `0.1.0` | Versão da release a ser exibida nos cards de download. Injetada pelo workflow `pages.yml` com base na última release publicada. |

## Deploy automático

Disparado por `.github/workflows/pages.yml`:

- Quando o pipeline `release` conclui com sucesso (via `workflow_run`).
- Em push para `main` que altere arquivos em `site/**`.
- Manualmente via `workflow_dispatch`.

O workflow resolve a última release publicada via `gh release view`, exporta
como `PUBLIC_BARTENDER_VERSION`, builda e deploya em Pages.

**Configuração única no repositório:** Settings → Pages → Source: "GitHub Actions".

## Resilência de versões

Cada link de download é gerado em build-time com a versão atual. Em runtime,
`scripts/live-version.ts` consulta `api.github.com/repos/.../releases/latest`
e troca os hrefs se houver uma release mais nova publicada — garantia de que
o site nunca fica desatualizado mais que alguns minutos, mesmo se o workflow
de deploy não tiver rodado ainda.

Se a API do GitHub falhar (rate limit ou offline), o site continua funcional
com os links de build-time.

## Internacionalização

- `en-US` é a locale padrão (rotas `/`, `/features/`, `/download/`, `/docs/`).
- `pt-BR` mora em `/pt-BR/*` com rotas espelhadas. O slug `features` é
  traduzido para `recursos` em pt-BR (mapping em `i18n/utils.ts`).
- Cada página `.astro` recebe `locale` como prop e usa `useTranslations(locale)`.
- Cada doc MDX em `src/content/docs/<locale>/<slug>.mdx`.

## Adicionar uma nova página de documentação

1. Crie `src/content/docs/pt-BR/<slug>.mdx` e `src/content/docs/en-US/<slug>.mdx`.
2. Use o frontmatter:
   ```yaml
   ---
   title: Nome da página
   description: Resumo curto (para meta e cards do hub).
   order: 99
   category: getting-started | designing | barcodes | printing | data | files | reliability
   ---
   ```
3. O `DocSidebar` e o `[slug].astro` descobrem automaticamente.

## Atualizar capturas de tela

Veja [`public/screenshots/README.md`](./public/screenshots/README.md) para a
lista de prints esperados e como capturar.

## Tokens de design

O `tailwind.config.cjs` e o `styles/global.css` mapeiam todos os tokens do
[`/DESIGN.md`](../DESIGN.md) raiz do repo — cores, tipografia editorial (EB
Garamond 300 + Inter Variable), espaçamento section=96px, border-radius pill
e xl. Mantenha-os em sync se o DESIGN.md mudar.
