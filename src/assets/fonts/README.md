# Bundle de fontes — Etiquetador (WP-06 / SPEC-05)

Este diretório guarda os arquivos `.ttf` (ou `.woff2`) das **15 fontes empacotadas** no app
(RF-F-02 do PRD §5.3 + SPEC-05 §"Regras de negócio"). As declarações `@font-face` são geradas
estaticamente em `fonts.css` e referenciam estes caminhos via `import.meta.glob`.

## Por que um README e não os arquivos commitados?

Os arquivos `.ttf`/`.woff2` são licenciados sob **SIL Open Font License 1.1** ou **Apache 2.0**
(redistribuíveis), porém não os commitamos diretamente pelos seguintes motivos:

1. **Tamanho do repositório.** As 15 fontes Regular somam ≈ 4 MB. Em variantes Bold/Italic
   isso facilmente passa de 20 MB e infla o `git clone` de quem só quer mexer no Rust ou no
   CSS.
2. **Procedência rastreável.** Cada fonte tem fonte canônica (Google Fonts ou repositório
   oficial). Documentar a origem aqui evita reempacotamento opaco.

> Em CI/CD e nos builds publicados oficialmente, **os arquivos DEVEM estar presentes** antes
> de `npm run build`. Sem eles, o app continua funcionando: o `@font-face` falha silenciosa-
> mente e o navegador cai no `cssFallback` declarado em `src/lib/canvas/fonts.ts`. Isso
> assegura UI funcional em desenvolvimento mesmo sem os assets.

## Como obter as fontes

Cada entrada em `src/lib/canvas/fonts.ts` declara um `sourceUrl`. Baixe **apenas a variante
Regular** (sem itálico/bold extras — esses são derivados via `fontStyle`/`fontWeight` no
canvas) e salve aqui com o nome exato do campo `filename`:

| Família             | Arquivo esperado              | URL canônica                                   |
|---------------------|-------------------------------|------------------------------------------------|
| Inter               | `Inter-Regular.ttf`           | https://github.com/rsms/inter (release oficial)|
| Roboto              | `Roboto-Regular.ttf`          | https://fonts.google.com/specimen/Roboto       |
| Open Sans           | `OpenSans-Regular.ttf`        | https://fonts.google.com/specimen/Open+Sans    |
| Montserrat          | `Montserrat-Regular.ttf`      | https://fonts.google.com/specimen/Montserrat   |
| Poppins             | `Poppins-Regular.ttf`         | https://fonts.google.com/specimen/Poppins      |
| Lato                | `Lato-Regular.ttf`            | https://fonts.google.com/specimen/Lato         |
| Oswald              | `Oswald-Regular.ttf`          | https://fonts.google.com/specimen/Oswald       |
| Bebas Neue          | `BebasNeue-Regular.ttf`       | https://fonts.google.com/specimen/Bebas+Neue   |
| Playfair Display    | `PlayfairDisplay-Regular.ttf` | https://fonts.google.com/specimen/Playfair+Display |
| Source Code Pro     | `SourceCodePro-Regular.ttf`   | https://fonts.google.com/specimen/Source+Code+Pro |
| JetBrains Mono      | `JetBrainsMono-Regular.ttf`   | https://www.jetbrains.com/lp/mono              |
| Libre Barcode 39    | `LibreBarcode39-Regular.ttf`  | https://fonts.google.com/specimen/Libre+Barcode+39 |
| Libre Barcode 128   | `LibreBarcode128-Regular.ttf` | https://fonts.google.com/specimen/Libre+Barcode+128 |
| Fira Sans           | `FiraSans-Regular.ttf`        | https://fonts.google.com/specimen/Fira+Sans    |
| Noto Sans Mono      | `NotoSansMono-Regular.ttf`    | https://fonts.google.com/specimen/Noto+Sans+Mono |

## Validação offline-first

O bundle Vite **NÃO** baixa nada em runtime — todas as fontes são empacotadas no momento do
build (via `import.meta.url`). O comando `make audit-bundle` continua passando porque
`fonts.css` referencia apenas caminhos relativos.

Para verificar que todas as 15 estão presentes localmente:

```bash
ls src/assets/fonts/*.ttf | wc -l  # deve retornar 15
```

## Licenças

- **SIL Open Font License 1.1** — Inter, Open Sans, Montserrat, Poppins, Lato, Oswald,
  Bebas Neue, Playfair Display, Source Code Pro, JetBrains Mono, Libre Barcode 39,
  Libre Barcode 128, Fira Sans, Noto Sans Mono.
- **Apache 2.0** — Roboto.

Ambas autorizam redistribuição inclusive em produtos comerciais. Inclua o texto da OFL
em `LICENSES/SIL-OFL-1.1.txt` no release final.
