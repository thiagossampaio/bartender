---
name: Validation Commands
description: Working type-check / lint / prisma generate commands and conventions in this monorepo
type: reference
---

**Type-check (web app)**:
```
pnpm --filter @prumo/web type-check
```

**Lint (web app)**:
```
pnpm --filter @prumo/web lint
```
Para lintar apenas arquivos novos:
```
cd apps/web && npx eslint <files...>
```

**Prisma generate** (após editar schema.prisma):
```
pnpm --filter @prumo/db generate
```
Script real é `db:generate` — o alias `generate` também existe. Carrega envs de `apps/web/.env*`.

**Prisma migrate** (NÃO rodar em WPs — só staging):
```
pnpm --filter @prumo/db db:migrate:deploy
```

**Outros packages**:
- `@prumo/email` e `@prumo/db` não têm scripts `type-check`. Use `cd packages/<name> && npx tsc --noEmit`.

**Notas**:
- pnpm exige nomes completos de scripts: `db:generate` ou alias `generate`.
- Migrations devem ter timestamp aditivo no formato `YYYYMMDDHHMMSS_slug`. Última usada (2026-05-04): `20260504140000_notification_type_v2`.

**Testes unitários (WP-T01 / WP-T02 / WP-T03)**:
- Vitest 2.x. Comandos: `pnpm test:unit` (raiz, todos packages via turbo) ou `pnpm --filter @prumo/<pkg> test:unit`.
- `packages/db/vitest.config.ts` usa env `node`; include `tests/unit/**/*.test.ts`. Antes da 1ª execução em ambiente novo: `pnpm --filter @prumo/db db:generate` (gera Prisma Client).
- `packages/email/vitest.config.ts` usa env `happy-dom` + plugin react; include `tests/unit/**/*.test.{ts,tsx}`.
- `packages/ai/vitest.config.ts` usa env `node`; include `tests/unit/**/*.test.ts`. Mocks: `tests/helpers/mocks/anthropic.ts` (factories `mockAnthropicSuccess`, `mockAnthropicMalformed`, `mockAnthropicNetworkError`, `buildMockMessage`, `makeAnthropicClass`).
- Para testar funções top-level que dependem de env vars (ex.: `IS_SERVERLESS` em `client.ts`), reimportar o módulo após mexer `process.env` via `vi.resetModules()` + `await import(...)`.
- Mockar `@prisma/client` em testes do `client.ts` para evitar conexão real: stub `PrismaClient` com `$extends() { return this }` e `Prisma.defineExtension` como identidade.
- Para mockar `@prumo/db` direto (em packages que importam só `prisma`): `vi.mock('@prumo/db', () => ({ prisma: { tenant: { findUnique: vi.fn() }, $transaction: vi.fn(...) } }))`. O `$transaction` precisa resolver o array de operações para o caller não dar `await Promise.all(undefined)`.
- Para mockar `@anthropic-ai/sdk`: o SDK exporta default class. Use `vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: ... } } }))`. Para variar a função `create` por teste, use closure de variável `let currentCreate` que a classe mock chama via `(...args) => currentCreate(...args)`.
- React Email: `render(<Template ... />)` (export do `@react-email/components`) devolve string HTML. Texto adjacente a interpolações JSX (`{n}d`) ganha `<!-- -->` no meio — ao asserir, use regex tolerante (`/5(<!--\s*-->)?d/`) ou strings que não cruzem fronteiras de `{}`.
- `calculateCost` em `pricing.ts` usa `Math.ceil` em centavos (sempre arredonda PRA CIMA — protege casa) e `costBrl` passa por `toFixed(4)`. Para asserções com `.toBeCloseTo`, prefira tolerância 3 casas, não 5 (float artifacts).
