# Ícones do aplicativo

Substitua os arquivos deste diretório pelos ícones definitivos antes do release.

Formatos requeridos pelo bundler do Tauri 2.x:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png` (256×256)
- `icon.icns` (macOS)
- `icon.ico` (Windows)

Sugestão para gerar todos os formatos a partir de uma imagem base 1024×1024:

```bash
npm run tauri icon path/to/source-icon.png
```

> **Nota WP-01:** os ícones atuais são placeholders mínimos para destravar o
> build. O design final será fornecido pelo time de produto antes do release
> público.
