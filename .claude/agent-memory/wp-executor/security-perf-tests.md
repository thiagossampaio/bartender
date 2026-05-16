---
name: Security & Performance Tests (WP-T12)
description: Padrões para testes de hardening (security/) e smoke (perf/) em apps/web/tests/integration
type: reference
---

**Layout**:
- `apps/web/tests/integration/security/`: cross-tenant, RBAC bypass, webhook replay, portal enumeration. Tudo via `describe.skipIf(!HAS_DB)`.
- `apps/web/tests/integration/perf/`: dashboard-smoke, search-smoke, n-plus-one. Threshold por arquivo no topo (constantes).
- `apps/web/tests/unit/security/`: rate-limit (Upstash mock) e MIME bypass (puro). Não tocam DB.

**Cross-tenant template**: `signInAs('OWNER')` 2× para criar dois tenants; o segundo signIn deixa a sessão ativa como tenant B; o recurso é seedado pelo retorno do primeiro signIn. Asserts esperam **404 silencioso** (não 403).

**RBAC bypass**: importar a action `withPermission`-decorated dinâmica e chamar diretamente. Erro esperado: `/Permissão insuficiente|Acesso negado/`. Inclua um "control case" com OWNER para garantir que o decorator não está universalmente rejeitando.

**Portal enumeration**: chamar `resolvePortalToken` direto (não via HTTP). Aquecer o pool com 5 calls antes de medir; threshold de timing leak `max - min < 50ms` é tolerante a outliers de GC.

**Webhook replay cross-tenant**: o `WebhookEvent.eventId` é unique global (não escopado por tenant); o handler faz lookup por `pagarmeOrderId`. Asserts: 1ª chamada marca apenas UM payment como pago; 2ª com mesmo body retorna `duplicate=true` e zero efeitos.

**N+1 detection**: precisamos de um PrismaClient com `log: [{ emit: 'event', level: 'query' }]`. Para evitar dep direta de `@prisma/client` em `apps/web`, exportei `PrismaClient` de `@prumo/db` (`packages/db/src/index.ts`). Use `const { PrismaClient } = await import('@prumo/db')` no test e filter SELECTs no listener.

**Login brute-force (unit)**: mockar `@upstash/ratelimit` com `vi.fn()` que retorna `{success:true}` para 1-10 calls e `{success:false}` para 11+. A action `signInWithPassword` é importada dinamicamente; assert: 11ª chamada NÃO chega ao supabase (NEXT_REDIRECT antes).

**MIME bypass**: `lib/storage/upload.ts` valida `file.type` (Content-Type) — nunca a extensão. Para test boundary com `File`, use `Object.defineProperty(file, 'size', { value: TARGET_SIZE })`.

**ExpenseCreate**: Schema Prisma exige `category: ExpenseCategory` em `expense.create`. Valores: `RENT|UTILITIES|SOFTWARE|PAYROLL|MARKETING|EQUIPMENT|TAXES|PROFESSIONAL_SERVICES|TRAVEL|OTHER`. Tests anteriores que omitiam isso quebraram (não havia integration touching expense create antes do WP-T12).

**LeadCreate**: `createLeadSchema.source` tem default 'OTHER' mas o `z.infer<...>` deriva como obrigatório. Sempre passar `source: 'OTHER'` em testes que chamam `createLead`.

**markPaymentAsPaid signature**: `(paymentId: string, method: PaymentMethod, notes?: string)` — não recebe um objeto.
