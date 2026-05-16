---
name: Auth Flows (WP-A##)
description: Padrões e arquivos canônicos do hardening de auth (reset, magic link, invite) — WP-A01 em diante
type: project
---

**WP-A01 — Reset de senha (concluído)**:
- `/auth/confirm/route.ts` é handler GET universal para todos os links de email (recovery, magiclink, signup, invite, email_change). Usa `verifyOtp({ token_hash, type })`. Default `next=/dashboard`. Path safety: aceita só `next` que começa com `/` e não `//`.
- `/forgot-password` (page+actions) — `requestPasswordReset` SEMPRE responde genérico (anti-enumeration). Erros do Supabase são apenas logados via `logger.warn`.
- `/reset-password` (page+actions) — page faz server-side `getUser()` antes de renderizar; sem sessão → `/login?error=session-expired`. Action também faz `getUser()` (valida JWT contra servidor, não `getSession()`).
- Validação Zod de senha: `min(8).regex(/[a-zA-Z]/).regex(/\d/)` + confirmação via `.refine`.
- `lib/rate-limit.ts` agora tem `passwordResetRateLimit` (10/15min, prefix `prumo:password-reset`) + `checkPasswordResetRateLimit(ip)`. Helper interno `checkRateLimit(ratelimit, ip)` foi extraído (DRY entre login e password-reset).
- `proxy.ts` `isAuthRoute` cobre `/login`, `/logout`, `/auth/confirm`, `/forgot-password`, `/reset-password`. Tenant-gate e onboarding-gate já excluem `isAuthRoute`, então usuários autenticados em `/reset-password` (vindos do `/auth/confirm` por `verifyOtp`) não são bounced.
- Form components: `components/auth/forgot-password-form.tsx` + `reset-password-form.tsx`. Reusam `PrumoInput` + `PrumoButton`. Card stone-50/white estilo `/accept-invite` (NÃO o cinematic do login — esse é só para o login).
- `docs/auth.md` documenta templates Supabase (Reset Password com `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`), URL Configuration allowlist e troubleshooting.

**WP-A02 — Magic Link UX (concluído)**:
- `/login/check-email/page.tsx` — informacional, recebe `?email=...` na query, renderiza card stone-50/white igual `/forgot-password`. Email é sanitizado (trim + length<=254) antes de exibir. Link "Tentar com outro e-mail" volta para `/login`.
- `signInWithMagicLink` (em `login/actions.ts`) agora: (1) `emailRedirectTo: ${APP_URL}/auth/confirm?next=/dashboard` (NÃO mais `/auth/callback`); (2) redirect SEMPRE para `/login/check-email?email=...`, mesmo se Supabase retornar erro (anti-enumeration); (3) reusa `checkLoginRateLimit` (5/15min, mesmo bucket de login com senha).
- `proxy.ts` não precisou alteração: `pathname.startsWith('/login')` em `isAuthRoute` já cobre `/login/check-email`. O early-return em authenticated user em `/login*` (linha 54) também é OK aqui — usuário só estará autenticado depois de clicar o link, e nesse caso já está em `/dashboard`.
- `docs/auth.md` ganhou seção 4 (Fluxo Magic Link) com diagrama + tabela de erros + nota sobre anti-enumeration. Template Supabase usa `type=magiclink&next=/dashboard`.

**WP-A03 — Convite Supabase (dual-mode, concluído)**:
- `lib/users/invite.ts` reescrito: `inviteUser(email, role)` agora usa `supabaseAdmin.auth.admin.inviteUserByEmail` (com `redirectTo=/auth/confirm?next=/accept-invite` e `data: {tenant_id, role, invited_by_user_id, invited_by_name, tenant_name}`). Em sucesso, segue com `updateUserById(id, { app_metadata: { tenant_id, role } })` para fixar invariantes server-side. Em erro "user already registered", fallback para `generateLink({type:'invite'})` + `sendEmail` reusando `InviteUserEmail` template do `@prumo/email`. Detecção de "já existe" usa heurística por substring (`already registered`, `email_exists`, etc.) — Supabase não expõe código estável.
- **NOVO bucket Upstash**: `prumo:invite` (50/dia por **tenantId**, não por IP). Helper `checkInviteRateLimit(tenantId)` em `lib/rate-limit.ts`. Diferente de login/reset: o bucket por tenant cobre abuso de admin / proteção de reputation do domínio (não de força bruta por IP).
- `accept-invite/page.tsx` é dual: (A) `?token=...` → fluxo legado (renderiza `<LegacyInviteView>` igual antes); (B) sem token + sessão ativa com `app_metadata.tenant_id`/`role` → form `<CompleteInviteForm>` (nome + senha + confirmar). Sem token e sem sessão → `redirect('/login?error=invite-required')`.
- `accept-invite/actions.ts`: `acceptInvite(token)` (legacy A) preservado intacto. NOVO `completeInviteSignup(formData)` (B): valida Zod (`fullName 2..120 + password >= 8 + confirmação`), checa sessão via `getUser()`, lê `app_metadata` (preferido) ou `user_metadata` (fallback), valida tenant existe, faz `supabase.auth.updateUser({password, data:{full_name}})`, force-confirm email via admin se ainda não confirmado, transação Prisma `upsert User + upsert UserTenant` (idempotente), seta cookie `active-tenant-id`, redireciona `/dashboard`.
- `resendInviteAction(inviteId)` em `settings/users/actions.ts` agora delega para `inviteUser(invite.email, invite.role)` e marca o `InviteToken` legado como `usedAt` (consolidação no Supabase). Ainda funcional para a lista "Convites pendentes" preenchida pelo `prisma.inviteToken.findMany` em `/settings/users/page.tsx`.
- Activity log: `user.invited` com `metadata.provider: 'supabase' | 'legacy_fallback'`. `user.invite_accepted` com `metadata.provider: 'legacy' | 'supabase'`.
- **NÃO** deletado: `InviteToken` model, `pendingInvites` query, `LegacyInviteView`. Descontinuação fica para WP-A04 após confirmar TTL natural em produção.
- `docs/auth.md` seção 4.5 (Fluxo Convite) + atualização da seção 2.3 (template "Invite User" com variáveis customizadas `{{ .Data.tenant_name }}`, `{{ .Data.invited_by_name }}`, etc.).

**Why**: WP-A03/A04 reusam `/auth/confirm` — não criar handlers paralelos. Para Invite (WP-A03 já feito), o template do Dashboard Supabase aponta para o mesmo `/auth/confirm` mudando só `type=invite` e `next=/accept-invite`.

**How to apply**: ao tocar fluxos de auth via email, sempre passar pelo `/auth/confirm` (token_hash flow), nunca pelo `/auth/callback` (code flow OAuth). Para mudanças no `proxy.ts isAuthRoute`, lembrar que tenant-gate/onboarding-gate dependem dele para deixar passar. Anti-enumeration: actions de email-based auth (forgot password, magic link) NÃO devem expor erros do Supabase ao usuário — sempre redirecionar para uma tela genérica de "verifique seu email". Para invariantes server-side (tenantId/role) em fluxos onde o user pode chamar `updateUser({data})`, usar `app_metadata` (escrito apenas via service role) em vez de `user_metadata`.

**WP-A04 — Hardening + descontinuação programada (concluído)**:
- `docs/auth.md` reescrito em 8 seções: §1 Site URL/Redirect URLs (allowlist completo), §2 Templates (Reset/Magic/Invite/Signup/EmailChange) com URL exata Mustache para colar no Dashboard, §3 fluxos completos com diagrama ASCII, §4 troubleshooting consolidado, §5 como adicionar novo fluxo, §6 **TODO de descontinuação** programada do `InviteToken` com critério verificável (`SELECT MAX(createdAt) FROM "InviteToken"` > 72h passado e `active_tokens = 0`) e data de revisita 2026-05-22, §7 rate-limiting, §8 envs.
- Bateria de testes nova: `tests/unit/auth/{forgot-password-actions,reset-password-actions,confirm-route,complete-invite-actions}.test.ts` + `tests/unit/users/invite.test.ts` (49 unit tests novos, 198 total). `tests/integration/api/auth-confirm.test.ts` + `tests/integration/auth/{forgot-password,invite-flow}.test.ts` (24 testes, todos com `describe.skipIf(!HAS_DB)`). `tests/e2e/{forgot-password,magic-link,invite}.spec.ts` (3 specs com `test.skip(!HAS_E2E_ENV)`).
- E2E captura links via `POST /auth/v1/admin/generate_link` com `type` apropriado (`recovery`|`magiclink`|`invite`) — body inclui `data` apenas para invite. Resposta tem `hashed_token` (e `properties.hashed_token` em algumas versões); spec é tolerante com fallback `body.hashed_token ?? body.properties?.hashed_token`.
- Padrão dos novos unit tests: `vi.fn<(...args) => Promise<R>>()` em vez de `vi.fn(async () => ...)` (zero-arg). Asserções com guard `if (!call) throw new Error(...)` em vez de `(mock.calls[0]?.[0] as T)` — TS strict reclama de `Tuple type '[]' has no element at index '0'` quando o type do mock é vazio.
- **NÃO foi executado o drop do `InviteToken`**: WP-A03 acabou de ser deployado; spec exige 72h+ em produção sem `InviteToken` novo. Drop fica como TODO documentado em `docs/auth.md §6` com critério verificável + revisita programada.
