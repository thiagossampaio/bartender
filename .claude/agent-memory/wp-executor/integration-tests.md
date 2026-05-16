---
name: Integration Test Patterns (WP-T05+)
description: Setup e idiomas para integration tests apps/web contra Postgres real (Supabase CLI local)
type: reference
---

**Comando**:
```
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
DIRECT_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
pnpm --filter @prumo/web test:integration
```
Para skip determinístico (sem subir Supabase): `PRUMO_TESTS_NO_DB=1 pnpm --filter @prumo/web test:integration`.

**Helpers (`apps/web/tests/helpers/`)** — implementados no WP-T05:
- `db.ts`: `HAS_DB` (boolean), `NO_DB_SKIP_MESSAGE`, `resetDb()` (TRUNCATE de `information_schema` schema=public, exceto `_prisma_migrations`, com RESTART IDENTITY CASCADE), `seedMinimal({ role?, userId? })` retornando `{ tenantId, userId, planId }`.
- `auth.ts`: `signInAs(role, { tenantId?, userId? })` cria User+UserTenant via Prisma e seta `sessionState`. Mocks helpers: `mockNextHeaders()`, `mockSupabaseServer()`, `mockSupabaseAdmin()`, `getStorageMock()`, `resetStorageMock()`, `setTestSession()`. NÃO mexe em `auth.users` do Supabase Auth (não necessário para integration; será preciso para E2E em WP-T08+).

**Padrão de test file** (sempre usar):
```ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { prisma } from '@prumo/db'
import { HAS_DB, NO_DB_SKIP_MESSAGE, resetDb } from '@/tests/helpers/db'
import { mockNextHeaders, mockSupabaseServer, mockSupabaseAdmin,
         resetStorageMock, signInAs } from '@/tests/helpers/auth'

vi.mock('next/headers', () => mockNextHeaders())
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))
vi.mock('next/server', () => ({ after: (fn) => { void fn() } }))
vi.mock('@/lib/supabase/server', () => mockSupabaseServer())
vi.mock('@/lib/supabase/admin', () => mockSupabaseAdmin())
vi.mock('@prumo/email', () => ({ sendEmail: vi.fn(async () => ({})), /* ...templates como () => null */ }))

if (!HAS_DB) console.warn(`[<area>] ${NO_DB_SKIP_MESSAGE}`)

describe.skipIf(!HAS_DB)('<area>', () => {
  beforeEach(async () => { await resetDb(); resetStorageMock() })
  afterAll(async () => { await prisma.$disconnect() })
  ...
})
```

**Pegadinhas / decisões**:
- `vitest.config.ts` em apps/web usa `pool: 'forks'` + `singleFork: true` em integration — não há paralelismo entre arquivos, o que evita conflito de `resetDb()`. Mantenha assim.
- `cookies()` mockado retorna `active-tenant-id` SEMPRE da `sessionState` global; o store interno só guarda o que o teste setar manualmente. `setTestSession(null)` zera o estado entre cenários multi-tenant.
- `redirect()` do Next 15 lança `NEXT_REDIRECT` no runtime real; o mock replica com prefixo `NEXT_REDIRECT:` para `expect(...).rejects.toThrow(/^NEXT_REDIRECT:/)`. **Server actions com `redirect()` no fim sempre lançam — envolver em `expect().rejects.toThrow()` mesmo no caminho feliz.**
- `next/server` exporta `after()` (Next 15) — em testes substituímos por execução síncrona inline para que efeitos colaterais (ex: `generateReceipt` agendado em `after()`) sejam esperáveis. Quando o teste NÃO quer rodar o efeito, mockar separadamente o módulo destino (ex: `vi.mock('@/lib/receipts/generate-receipt', ...)`).
- `prisma.$disconnect()` em `afterAll` evita conexão aberta entre arquivos, mas com `singleFork` é defensivo apenas.
- `mockSupabaseAdmin()` expõe `getStorageMock()` com arrays `uploads` e `signedUrls` — use para assertar interações de storage sem subir Supabase Storage real.
- `resetDb()` usa `information_schema.tables` para descobrir tabelas — não precisa atualizar quando novas migrations adicionam tables. Cache em memória de processo (`publicTablesCache`).
- Para receipt generation real: mockar `@react-pdf/renderer` com `renderToBuffer: vi.fn(async () => Buffer.from('PDF-FAKE'))` — evita carregar o renderer pesado e é suficiente para validar advisory_lock + persistência.
- Multi-tenant isolation: chamar `signInAs('OWNER')` 2× cria 2 tenants distintos; o último é a sessão ativa. Para testar acesso cruzado, criar entidades sob a primeira sessão e tentar mutar/ler com a segunda.
- `auth.ts` exporta `setTestSession` para resetar entre cenários — chamar em `beforeEach` em testes multi-tenant.

**API routes (App Router, WP-T06+)**:
- Importar a função `GET`/`POST` direto do `route.ts`: `const { POST } = await import('@/app/api/.../route')`. Os mocks via `vi.mock` no topo são hoisted, então o import dinâmico em cada teste é o caminho seguro.
- Construir Request com `new Request('http://localhost/...', { method, headers, body })` e cast `as unknown as NextRequest` quando a assinatura exigir `NextRequest`.
- Rotas dinâmicas Next 16: o segundo arg é `{ params: Promise<{...}> }`. Passar `{ params: Promise.resolve({ id: 'abc' }) }`.
- O webhook Pagar.me (`/api/webhooks/pagarme/route.ts`) lê `env.PAGARME_WEBHOOK_SECRET`. Como `SKIP_ENV_VALIDATION=1` no setup integration, basta `process.env.PAGARME_WEBHOOK_SECRET = 'test-secret'` antes do `import` dinâmico (e usar o mesmo segredo no `buildPagarmeWebhook`).
- Mock parcial de `next/server` para preservar `NextRequest`/`NextResponse` mas sobrescrever `after()`:
  ```ts
  vi.mock('next/server', async (importOriginal) => {
    const original = await importOriginal<typeof NextServerType>()
    return { ...original, after: (fn) => { void fn() } }
  })
  ```
  ESLint exige `import type * as NextServerType from 'next/server'` no topo (sem `import()` inline em type position).
- `auth/callback/route.ts` chama `supabase.auth.exchangeCodeForSession(code)`, que NÃO está em `mockSupabaseServer()`. Para testar essa rota, monte um mock customizado (ver `tests/integration/api/auth-callback.test.ts`).
- `NextResponse.redirect(url)` retorna 307 (não 302). `NextResponse.redirect(url, 302)` para redirect explícito.
- Cookies setados via `response.cookies.set(...)` aparecem como `set-cookie` header na response — testar via `res.headers.get('set-cookie')`.
- Portal endpoints públicos: o padrão é "404 silencioso" — qualquer falha (token inválido, expirado, revogado, scope mismatch, recurso de outro cliente) retorna 404 idêntico. Em `comments/route.ts` o handler é diferente: chama uma server action que lança `Error` em validação, e a rota faz `try/catch` retornando 400 (não 404).
- `notFound()` do `next/navigation` é mockado para `throw new Error('NEXT_NOT_FOUND')` — em rotas que catch isso vira 400 com mensagem "NEXT_NOT_FOUND". Para rotas que checam scope com `if (!scopes.includes(...)) return 404` (sem chamar `notFound()`), o status de saída é 404 limpo.
- Multi-tenant via 2× `signInAs('OWNER')`: a sessão ativa fica para o último; o primeiro tenant é referenciado pelo retorno do `signInAs`.

**Crons (WP-T07)**:
- Cada cron `apps/web/app/api/crons/<slug>/route.ts` exporta `POST` e exige `Authorization: Bearer ${CRON_SECRET}`. Setar `process.env.CRON_SECRET = 'test-cron-secret'` em `beforeEach` (não `beforeAll`, para sobreviver a tests que zeram a env como parte do cenário "sem secret → 401").
- Datas determinísticas via `vi.useFakeTimers({ now: new Date('YYYY-MM-DDTHH:mm:ssZ'), toFake: ['Date'] })` no `beforeEach` + `vi.useRealTimers()` no `afterAll`.
- `vite:dynamic-import-vars`: `await import(\`@/app/api/crons/${slug}/route\`)` quebra (extensão variável). Usar mapa `{slug, load: () => import('@/app/api/crons/<lit>/route')}` com lit estático.
- ESLint `@typescript-eslint/consistent-type-imports` proíbe `typeof import('...')`. Para mocks com `importOriginal<T>()` ou `vi.fn<typeof X.fn>()`, usar `import type * as X from '@/.../mod'` no topo.
- Para `vi.fn` que precisa receber args + retornar tipo do SUT: `vi.fn<typeof mod.func>()` ao invés de `vi.fn(async () => ...)` (este último é zero-arg).
- `mockResolvedValue({...})` precisa cobrir TODAS as chaves do retorno (o helper `fetchAccumulatedRate` retorna 4 chaves `{rate, samples, source, serieCode}`).
- Enums frequentes: `TenantStatus = ACTIVE|SUSPENDED|CANCELLED|TRIAL` (não há `INACTIVE`); `ExpenseType = FIXED|VARIABLE` (não `OFFICE`); `LegalDocumentType` inclui `CERTIDAO_NEGATIVA_DEBITOS` (não `CERTIDAO_NEGATIVA`).
- Usar `vi.mock('@/lib/ai/<feat>', () => ({ aiX: aiXMock }))` para crons com IA. Para skip silencioso por créditos, o cron faz match no string `'insuficiente'|'desabilitada'|'não configurada'|'ANTHROPIC_API_KEY'` — usar exatamente uma dessas substrings na mensagem do erro mockado para acionar `skippedNoCredits`.
