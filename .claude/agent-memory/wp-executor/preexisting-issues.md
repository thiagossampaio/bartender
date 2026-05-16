---
name: Pre-existing Issues
description: Type-check and lint failures present on main that are NOT introduced by current WPs — ignore in validation
type: project
---

Como de 2026-05-04, `pnpm --filter @prumo/web type-check` retorna 3 erros pré-existentes:

1. `app/auth/callback/route.ts(24,11)` — `string | null` não atribuível a `string`.
2. `components/contracts/payment-status-badge.tsx(1,38)` — módulo `@prumo/db/payment-status` não encontrado.
3. `components/contracts/payment-status-badge.tsx(20,18)` — index implícito `any`.

E `pnpm --filter @prumo/web lint` reporta ~22 problemas pré-existentes (auth/onboarding/settings/cmd, push, scripts).

**How to apply**: ao validar um WP, lintar/typechecar apenas os arquivos novos/modificados pelo WP; ignorar os arquivos acima salvo se o escopo do WP os toque.

**Why**: foram herdados de WPs anteriores e não são responsabilidade do WP atual. Tentar consertá-los foge do escopo cirúrgico do executor.
