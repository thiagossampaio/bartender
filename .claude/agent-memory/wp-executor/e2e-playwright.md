---
name: E2E Playwright Patterns (WP-T08+)
description: Setup e idiomas para specs E2E reais em apps/web/tests/e2e (auth, RBAC, jornadas)
type: reference
---

**Comandos**:
- Smoke (sem webServer): `PRUMO_E2E_SKIP_SERVER=1 pnpm --filter @prumo/web test:e2e`. Specs reais skipam via `HAS_E2E_ENV`.
- Real (com Supabase local + `next dev`): `pnpm --filter @prumo/web test:e2e:full`.

**Helpers (`apps/web/tests/e2e/_helpers/`)** — implementados no WP-T08:
- `env.ts`: `HAS_E2E_ENV` valida (a) `DATABASE_URL` localhost/127.0.0.1, (b) `NEXT_PUBLIC_SUPABASE_URL` localhost, (c) `SUPABASE_SERVICE_ROLE_KEY` presente, (d) sem `PRUMO_E2E_SKIP_SERVER`. Exporta também `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `getSupabaseCookieName()` (`sb-<project-ref>-auth-token`).
- `auth.ts`: `seedAndAuth(role, opts)` cria user via Supabase Admin API (`POST /auth/v1/admin/users`) + `prisma.user.create({ id: <auth uuid>, ... })` + `prisma.userTenant.create(...)`. Faz sign-in via `POST /auth/v1/token?grant_type=password` para obter `{access_token, refresh_token}` e monta cookie SSR JSON-encoded compatível com `@supabase/ssr`. Retorna `{ tenantId, userId, role, email, password, cookies }` para `context.addCookies()`.
- `cleanupE2EUser(userId)`: remove UserTenant + User no Prisma + DELETE em `auth.users` via Admin API.

**Padrão de spec E2E**:
```ts
import { test, expect } from '@playwright/test'
import { HAS_E2E_ENV, NO_E2E_SKIP_MESSAGE } from './_helpers/env'
import { seedAndAuth, cleanupE2EUser } from './_helpers/auth'

test.describe('Cenário', () => {
  test.skip(!HAS_E2E_ENV, NO_E2E_SKIP_MESSAGE)

  test('foo', async ({ page, context }) => {
    const auth = await seedAndAuth('OWNER')
    try {
      await context.addCookies(auth.cookies)
      await page.goto('/dashboard')
      // ... asserts
    } finally {
      await cleanupE2EUser(auth.userId)
    }
  })
})
```

**Stubs HTTP outbound (WP-T09+)**:
- Use `context.route('**://api.<host>/**', route => route.fulfill({...}))` para mockar Anthropic, Pagar.me, Resend, WhatsApp Cloud (`graph.facebook.com`), FCM (`fcm.googleapis.com`). `BrowserContext.route` cobre navegação, fetch client e parte do outbound do `next dev`.
- Webhook Pagar.me em E2E real: setar `pagarmeOrderId` direto via Prisma, montar payload via `tests/helpers/mocks/pagarme.ts#buildPagarmeWebhook(...)` (passar `process.env.PAGARME_WEBHOOK_SECRET ?? 'test-secret'` explicitamente — `next dev` carrega `.env`, mas o segredo precisa bater no contexto Playwright). Disparar com `page.request.post(`${baseUrl}/api/webhooks/pagarme`, ...)`. Handler usa `after()` → fazer poll do `paidAt` antes do reload.
- Cleanup ordenado para evitar FK errors: `receipt → activityLog → payment → contract → projectPhase → project → client → user/tenant`.

**Portal cliente (WP-T10)**:
- Token HMAC stateless: importar `generateRawToken` + `hashToken` de `@/lib/portal/auth` no spec, gerar raw → hash → criar `ClientPortalAccess` via Prisma com `scopes: ['view_progress','approve_phases','pay_invoices','comment']`. URL é `/portal/<rawToken>`.
- Layout `/portal/[token]/layout.tsx` seta o cookie HMAC `portal-session` automaticamente após `resolvePortalToken()` — basta navegar; não precisa autenticar OWNER no contexto Playwright.
- Para testar checkout PIX/Boleto sem bater na Pagar.me: stubar `**://api.pagar.me/**` retornando `{ id: 'or_e2e_*', charges: [{ last_transaction: { qr_code, qr_code_url, line, pdf } }] }`. Diferenciar `/customers` (retorna `{id}`) de orders (retorna full charge mock).
- Revogação: `prisma.clientPortalAccess.update({ where:{id}, data:{ revokedAt: new Date() } })` faz `resolvePortalToken` retornar null → `notFound()` (404). Testar em todas as rotas (`/portal/<t>`, `/projeto/<id>`, `/aprovar/<id>`, `/pagar/<id>`).
- Cleanup ordem específica: `notification → clientComment/clientApproval → activityLog → portalAccess → payment → contract → projectPhase → project → client → user/tenant`.
- A server action `submitPhaseApproval` notifica OWNER+ADMIN; `createClientComment` notifica OWNER+ADMIN+ARCHITECT. Para asserts use `prisma.notification.count` polling.
- Comentário: o componente `<PortalCommentInput>` está colapsado como botão "Comentar"; precisa clicar antes do `getByRole('textbox', { name: /comentário/i })`.
- Phase deve estar em `AWAITING_CLIENT_APPROVAL` para o botão "Aprovar etapa" aparecer (a UI esconde se status diferente).

**PWA offline + IA stub (WP-T11)**:
- Inspecionar IndexedDB no Playwright: `page.evaluate(async () => { const db = await indexedDB.open('prumo-offline', 1); ... store.getAll() })`. DB `prumo-offline`, store `queue` (definidos em `lib/hooks/use-offline-queue.ts`).
- Fluxo: `context.setOffline(true)` → preencher form → submit (queued no IDB) → `context.setOffline(false)` → re-navegar para a página com `useOfflineQueue` montado (autoFlush dispara no mount + listener `online`) → poll DB.
- Idempotência via `clientUuid`: re-postar mesmo payload via `page.request.post('/api/v1/diary', ...)` → endpoint upserta e retorna `{idempotent:true}`.
- Stub Anthropic com router de regex no `bodyText` (`postData()`): identificar feature via prompt — OCR ("comprovante de despesa"), phases ("sugira de 4 a 6 etapas"), memorial ("memorial descritivo"). Resposta segue `{ id, type, role, model, content:[{type:'text', text:<JSON ou Markdown>}], stop_reason, usage }`.
- Crédito esgotado: zerar `prisma.tenant.update({data:{aiCreditsCents:0}})` → endpoints AI mapeiam `AiCreditsExhaustedError` → 402 `{error:'AI_CREDITS_EXHAUSTED', message:'Créditos de IA esgotados...'}`.
- Memorial requer prancha real no bucket `project-files` + `prisma.projectFile` row category=PLAN. Use `@supabase/supabase-js` admin client direto no spec para upload de PNG mínimo (1x1 base64). Cleanup com `supabase.storage.from('project-files').remove([path])` no `finally`.

**Pegadinhas**:
- `playwright.config.ts` já desabilita o `webServer` quando `PRUMO_E2E_SKIP_SERVER=1`. NUNCA forçar webServer em smoke — quebra CI.
- Cookies do Supabase SSR são JSON-encoded e URL-encoded. Manter o formato exato `{access_token, refresh_token, expires_at, expires_in, token_type, user}` que `@supabase/ssr` espera. Project ref local é `127` (extraído do hostname `127.0.0.1`).
- Paralelismo desabilitado (`fullyParallel: false`) — testes podem compartilhar estado de DB. Mantenha `cleanupE2EUser` no `finally`.
- Para mockar rate limit sem Upstash real, intercepte `POST /login` via `page.route('**/login', route => route.fulfill({...}))` e retorne 303 com `?error=...` no 11º hit. Não tente bater no rate limit real — depende de cluster externo.
- Login form usa `<PrumoInput>` com label "E-mail" / "Senha" (case-insensitive em `getByLabel`).
- Multi-tenant: `tenantSelectPage` redireciona automaticamente para `/dashboard` quando o user tem 1 só tenant; o teste precisa criar `tenantCount: 2` para exercer a UI de seleção.
- O cookie `onboarding-complete` é setado pelo flow de login. Em testes que precisam exercer o gate de onboarding, passar `onboardingComplete: false` em `seedAndAuth`.
- RBAC tests precisam ser tolerantes a 2 caminhos: (a) UI esconde botão e (b) action retorna erro. O VIEWER bypass via `/projects/new` pode dar 403, redirect, ou render com mensagem de erro — aceitar todos os 3.
