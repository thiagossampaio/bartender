---
name: preexisting-issues
description: Warnings e limites conhecidos no projeto Bartender (não introduzidos por WPs específicos)
metadata:
  type: project
---

# Issues / limites pré-existentes do projeto

## ESLint warning aceitável

`src/components/ui/button.tsx` exporta o componente `Button` **e** o
`buttonVariants` (cva). O plugin `react-refresh/only-export-components` emite
warning por isso, mas esse é o padrão canônico do shadcn/ui e está documentado.
Manter como warning, não promover a erro.

## React error decoder URL no bundle

O bundle Vite contém a string `https://reactjs.org/docs/error-decoder.html`,
embedded pelo React minificado. Não é fetchada em runtime — só impressa no
console em erros. O `make audit-bundle` tem allowlist para isso.

## Ícones do app são placeholders

`src-tauri/icons/{32x32.png, 128x128.png, 128x128@2x.png, icon.ico, icon.icns}`
foram gerados programaticamente como quadrados azuis sólidos. **Substituir
antes do release público**. Veja `src-tauri/icons/README.md`.

## Rust toolchain não disponível na máquina padrão

`cargo`/`rustc` não estão instalados na máquina onde o WP-01 foi escrito.
Toda validação do lado Rust (`cargo check`, `cargo build`, `tauri build`)
precisa do toolchain instalado via rustup. O frontend valida normalmente
com Node 20.

## Assinatura/notarização exigem credenciais externas

`src-tauri/tauri.conf.json` referencia campos de assinatura (`certificateThumbprint`,
`signingIdentity`) como `null` — a assinatura real só acontece quando as
credenciais estão configuradas no ambiente do build:

- macOS: `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_SIGNING_IDENTITY`.
- Windows: `TAURI_SIGNING_CERTIFICATE_THUMBPRINT` ou thumbprint hardcoded no `tauri.conf.json`.

Builds locais sem essas credenciais ainda geram instaladores funcionais
**mas não-assinados** — usar só para teste, não para distribuição.
