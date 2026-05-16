---
name: validation
description: Comandos exatos de typecheck/lint/build que funcionam no repo Bartender
metadata:
  type: project
---

# Comandos de validação que funcionam neste repo

Executar sempre a partir da raiz `/Users/thiago/desenvolvimento/workspace_lifters/bartender`.

## Validações de frontend (sempre disponíveis)

```bash
npm install            # primeira vez ou após mudanças em package.json
npm run typecheck      # tsc --noEmit (estrito)
npm run lint           # eslint .ts/.tsx
npm run build          # tsc --noEmit && vite build → dist/
make audit-bundle      # auditoria offline-first do bundle
```

Tempo aproximado de `npm run build`: ~400 ms (frontend leve até a galeria entrar em WP-03).

## Validações de backend Rust (requer toolchain)

`cargo` e `rustc` **não estão instalados na máquina padrão** — o WP-01 foi
implementado sem rodar `cargo build`. Quem rodar precisa de:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # macOS universal
```

Depois disso:

```bash
cd src-tauri && cargo check    # valida lib + main
make build-mac                 # bundler completo (~5-10 min na primeira vez)
```

## Cobertura de validação por tipo de WP

| Tipo de mudança | Comandos mínimos |
|---|---|
| Só frontend (.tsx, .ts, css) | `npm run typecheck`, `npm run lint`, `npm run build` |
| Tauri config (`tauri.conf.json`, capabilities) | `cargo check` em `src-tauri/` |
| Comandos Rust novos | `cargo check` + testes unitários `cargo test` |
| Bundle final | `make build-mac` ou `make build-win` na plataforma alvo |
