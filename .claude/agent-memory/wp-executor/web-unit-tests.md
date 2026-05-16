---
name: Web Unit Test Patterns
description: Mocks e idiomas comuns para testes unitários de apps/web (Vitest + happy-dom + RTL)
type: reference
---

**Setup**:
- `apps/web/vitest.config.ts` usa `happy-dom`. Setup em `tests/setup.unit.ts` carrega `@testing-library/jest-dom/vitest`. Tests em `tests/unit/<area>/<file>.test.ts`.
- Comando: `pnpm --filter @prumo/web test:unit` (ou opcionalmente passar caminhos).

**Mocks recorrentes**:
- `@prumo/db`: `vi.mock('@prumo/db', () => ({ prisma: { entity: { method: vi.fn() } } }))`. Tipos como `Prisma`, `EntityType`, `UserRole`, `ProjectStatus` são reexportados como `export type` em `packages/db/src/index.ts` — strings literais bastam em tests.
- `next/headers` (cookies()): construir uma `cookieStore` com `set/delete/get` e devolver via `vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))`. `cookies()` em Next 15+ é assíncrono.
- `next/navigation`: `vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))` — para asserir chamada via `.toThrow()`.
- `@/lib/env` ou `@prumo/config/src/env`: mockar quando o SUT lê env vars validados por t3-oss; senão a inicialização lazy lança no acesso.
- `@/lib/supabase/admin`: stub `createAdminClient` retornando `{ storage: { from: () => ({ upload: mock }) } }`.
- `@upstash/redis` + `@upstash/ratelimit`: mockar como classes vazias e `Ratelimit.slidingWindow = (n,w) => ({...})`. Captura `limit()` via fn.
- `@anthropic-ai/sdk`: SDK exporta default class — usar `vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create } } }))`.

**`vi.fn` com argumentos**: a forma `vi.fn(() => ...)` é zero-arg. Para mocks que recebem args, use `vi.fn<(arg: T) => R>()` + `mockImplementation` em `beforeEach`.

**fake-indexeddb**:
- Importar `'fake-indexeddb/auto'` no topo do test file. Funciona com happy-dom.
- NÃO usar `indexedDB.deleteDatabase()` entre testes — conexões abertas pelo SUT podem manter `onblocked` pendurado e o teste expira ("Hook timed out"). Em vez disso, abrir o DB e limpar a object store via transação `clear()`, fechando depois.

**File / size boundary tests**:
- happy-dom oferece `File`. Para boundary de size sem alocar 50MB, criar `new File([new Uint8Array([0])], ...)` e `Object.defineProperty(file, 'size', { value: TARGET_SIZE })`.

**Float-rounding gotcha (mathjs + toFixed)**:
- `applyRate(1234.5, 5)` em `lib/readjustment/calculator.ts` retorna `1296.22` (não `1296.23` como o comentário sugere) — `1296.225` em IEEE-754 é `1296.22499...`. Use `toBeCloseTo(1296.225, 2)` em vez de `.toBe(1296.23)` ou ajuste valores para casos de arredondamento inequívocos.

**Permission decorator**:
- `withPermission` (`@/lib/auth/with-permission`) só depende de `getActiveTenantId`. Mockar isso isolada sem precisar de cookies/Supabase.

**`@react-pdf/renderer`** e outros pesados não precisam ser carregados — testar apenas o parser puro (`markdown-to-pdf.ts`) sem importar o renderer.

**Vitest CLI passa caminhos via posicional**: `pnpm --filter @prumo/web test:unit tests/unit/foo.test.ts`. Não usar `--`.
