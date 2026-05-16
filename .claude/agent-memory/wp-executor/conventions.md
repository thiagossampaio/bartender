---
name: Project Conventions
description: Repo layout, naming and architectural patterns shared across all WPs in this monorepo
type: project
---

**Monorepo / pnpm + turbo**:
- Apps: `apps/web` (Next.js 16, App Router, Server Components, RSC).
- Packages: `@prumo/db` (Prisma), `@prumo/email` (react-email + resend), `@prumo/ai`, `@prumo/config` (env via t3-oss), `@prumo/ui`.
- pnpm workspace, turbo for build/test/lint/type-check.

**Banco / Prisma**:
- Schema único em `packages/db/prisma/schema.prisma`.
- Migrations em `packages/db/prisma/migrations/<YYYYMMDDHHMMSS>_<slug>/migration.sql`. Migrações são SQL puro escrito à mão.
- `packages/db/src/index.ts` re-exporta tipos/enums do `@prisma/client` — adicione novos models ali ao criar.
- Multi-tenant: TODA query carrega `tenantId`; índices compostos `(tenantId, ...)`.
- Soft delete via `deletedAt: DateTime?`.
- Activity log via `createActivityLog({ tenantId, userId, entityType, entityId, action, metadata })`.

**RBAC**:
- `apps/web/lib/auth/permissions.ts` — `Action` union + `ALL_ACTIONS` array + `PERMISSIONS` por role + `checkPermission(role, action)`.
- Server actions usam `withPermission('action', async (ctx, ...args) => { ... })` — ctx tem `tenantId` e `role`.

**Server actions** (em `apps/web/app/(dashboard)/.../actions.ts`):
- `'use server'` no topo.
- `parsed = schema.safeParse(data)` (Zod) com mensagem PT-BR.
- Recupera `user` via `createSupabaseClient().auth.getUser()`.
- Valida tenant scope com `findFirst` antes de mutar.
- `revalidatePath(...)` ao final; `redirect()` quando aplicável.

**Schemas Zod**:
- Em `apps/web/lib/schemas/<entity>.schema.ts` exportando const arrays de enum (`SCOPES`, etc.) e `<verb><Entity>Schema`.

**UI**:
- `@/components/ui` reexporta wrappers de Radix (Sheet, AlertDialog, Select, Sonner toast etc.).
- Forms usam `react-hook-form` + `@hookform/resolvers/zod` + `Controller` para Selects.
- `<Sheet>` é o padrão para criação/edição rápida (form lateral).
- Toaster `sonner` para feedback.

**E-mail**:
- Templates em `packages/email/src/templates/<name>.tsx` usando `@react-email/components`.
- Re-exportar em `packages/email/src/index.ts`.
- Enviar com `sendEmail({ from: buildTenantFrom(tenantName), to, subject, react: TemplateName({...}) })`.

**WhatsApp** (opcional):
- `apps/web/lib/whatsapp/client.ts` com `whatsappRequest(path, options)`. Lança erro caso `WHATSAPP_API_*` não configurado.

**Brand / URLs**:
- `APP_URL` em `apps/web/lib/brand.ts` (process.env.NEXT_PUBLIC_APP_URL ?? localhost).
- `EMAIL_FROM`, `buildTenantFrom(tenantName)` para from header.

**PWA**:
- `next.config.ts` usa `@ducanh2912/next-pwa` com `runtimeCaching`. Para offline-friendly em rotas novas, adicione regra `NetworkFirst` ou `StaleWhileRevalidate`.

**Public routes**:
- Use route group `(public)` em `app/`. Não há layout próprio do grupo — herda do `app/layout.tsx`. Crie `(public)/<feature>/[token]/layout.tsx` se quiser layout reduzido.
- Para endpoints públicos de download (ex.: recibo no Client Portal), criar route handler em `app/(public)/<feature>/[token]/api/<resource>/[id]/route.ts` reusando `resolvePortalToken` + `requirePortalScope`. Padrão: 404 silencioso em qualquer falha de validação.
- Para fluxos Pagar.me em rota pública, reusar `getOrCreateCustomer` + `createPixOrder|createBoletoOrder` + persistir `pagarmeOrderId` em `Payment`. Webhook v1.x `payment.paid` é idempotente (early return se `paidAt !== null`) — nunca duplicar `paidAt`/notification/recibo na server action pública.

**Logger**:
- `apps/web/lib/logger.ts` (pino). Usa `logger.warn({err, contextId}, 'mensagem')`.

**Activity log entity types**:
- Ao criar nova entidade que precisa ser logada, adicionar valor ao enum `EntityType` em schema.prisma + migration.

**AI features padrão**:
- `packages/ai/src/feature-config.ts` já declara features como `plan_extract`, `memorial_generate`, etc. Antes de criar nova feature, verificar se já existe lá.
- Server actions/endpoints de IA seguem o padrão `apps/web/lib/ai/<topic>.ts` (helpers `aiX`) + `apps/web/app/api/v1/ai/<slug>/route.ts` (endpoint POST). Errors de gate são mapeados via `mapAiErrorToResponse` (402 créditos, 403 disabled, 503 not configured).
- Para vision com PDF: bloco `{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }`. Para imagem: bloco `{ type: 'image', source: { ... } }`.

**Project photos (WP-46)**:
- Bucket Supabase `project-photos` aceita JPEG/PNG/WebP/HEIC/HEIF, máx. 15MB cada (mobile-first).
- `ProjectPhoto.aiAnalysis` (Json) tem shape `{ risks: [{severity:LOW|MEDIUM|HIGH,label,description}], ppe:{present[],missing[]}, progress, notes, modelVersion }`.
- Análise IA roda em background via `after(() => analyzePhoto...)` para não bloquear upload — gate `runFeature` valida créditos/feature; falhas viram `aiStatus=FAILED` com `aiError` truncado.
- Helper `aiAnalyzeConstructionPhoto` em `lib/ai/photos.ts` reusa feature `obra_photo_analyze` (já cadastrada em `packages/ai/feature-config.ts`).
- Schemas com `z.preprocess((Date|string) → Date)` exigem cast `as unknown as Date` no client; ver padrão em `diary-form.tsx`.

**Measurements (WP-47)**:
- `Measurement.measurementNumber` é unique por `projectId` (auto-incrementado pela server action `createMeasurement`).
- Status flow `DRAFT → APPROVED → PAID` (com revert APPROVED → DRAFT). Apenas `DRAFT` permite editar valores; service action throw caso contrário.
- Permissões: `measurement:read|create|update|delete|approve|mark_paid`. ARCHITECT/ADMIN/OWNER aprovam; FINANCIAL marca como pago + opera os demais. VIEWER apenas lê.
- `CurveSChart` (em `components/projects/curve-s-chart.tsx`) aceita prop opcional `measurements`. Quando há medições aprovadas/pagas, série "Realizado" usa `physicalProgress`; senão cai no fallback ponderado por `actualEnd`.

**Crons (Vercel)**:
- Routes em `apps/web/app/api/crons/<slug>/route.ts` — exportam `POST` e validam `Authorization: Bearer ${CRON_SECRET}`.
- Registrar em `vercel.json` com `path` + `schedule` (cron syntax UTC). Ex.: sexta 18h UTC = `0 18 * * 5`.
- Para envio de email com IA: chamar `runFeature` dentro de try/catch — se erro for de gate (créditos/feature/config), capturar via match em string e fazer `continue` por projeto (não falhar o cron inteiro).
- Activity logs com `action: '<entity>.<verb>'` (ex.: `project.weekly_report_sent`) — metadata como objeto JSON tipado com `satisfies Prisma.InputJsonObject`.

**Leads/Pipeline (WP-49)**:
- Models `Lead` (com `status: LeadStatus`, `lostReason`, `convertedClientId`) e `LeadInteraction` (com `followUpTaskId` para vinculação a Task).
- Reuso de `<KanbanBoard>` (de `components/ui/kanban-board.tsx`) — colunas em `lib/leads/labels.ts` (`LEADS_KANBAN_COLUMNS`).
- LOST exige `lostReason` ≥ 3 chars: kanban `onMoveItem` para LOST defere persistência via `<LostReasonDialog>` e usa `key` (revertSignal) para revert se cancelado.
- Schemas com `superRefine` para validar `budgetMax >= budgetMin` e `lostReason` requirido em LOST.
- `Prisma` no `@prumo/db` é re-exportado como **type-only** — não usar `new Prisma.Decimal(...)`. Para campos `Decimal`, passe número direto (Prisma converte). Modelo já existente `Measurement.valueAmount` segue mesmo padrão.
- Server action `createLeadInteraction` cria opcionalmente uma `Task` follow-up (assigneeId default = lead.ownerUserId), notifica via `createNotification` `TASK_ASSIGNED` (link aponta para `/leads/{id}`).
- Activity log entries: `lead.created|updated|status_changed|deleted|interaction_created|interaction_deleted` com `EntityType` `LEAD` ou `LEAD_INTERACTION`.

**Weekly Client Report (WP-48)**:
- Cron `weekly-client-report` roda sexta 18h UTC. Filtra projetos `IN_PROGRESS` cujo cliente tem `ClientPortalAccess` ativo com escopo `view_progress`.
- "Sem atividade" = sem RDOs, sem fotos visíveis, sem fases aprovadas e sem pagamentos pagos no período de 7 dias → não envia email (skipNoActivity).
- Curadoria de fotos: prioriza sem riscos HIGH e mais recentes; pega até 3. Signed URL TTL 7 dias para sobreviver ao cache do email.
- Email template `WeeklyClientReportEmail` em `packages/email/src/templates/weekly-client-report.tsx` (re-exportado em `packages/email/src/index.ts`).
- `Project.lastReportSentAt` é o timestamp do último envio bem-sucedido. Atualização + ActivityLog `project.weekly_report_sent` formam o histórico exibido em `/projects/[id]/reports`.

**Proposals (WP-50)**:
- Models `ProposalTemplate` (Markdown content + placeholders `{{cliente}}`, `{{valor}}`, `{{prazo}}`, `{{etapas}}`, `{{honorario}}`, `{{data}}`, `{{escritorio}}`, `{{projeto}}`) e `Proposal` (`leadId`, `templateId?`, `content` Markdown, `totalAmount`, `durationDays`, `paymentTerms` Json, `status DRAFT|SENT|ACCEPTED|REJECTED`, `aiGenerated` reservado para WP-51).
- Permissões: `proposal:read|create|update|delete|send`. ARCHITECT/ADMIN/OWNER mutam; FINANCIAL/VIEWER apenas leem.
- PDF: `apps/web/lib/proposals/pdf-renderer.tsx` usa `@react-pdf/renderer`. Não foi adicionado `react-markdown` — implementado parser Markdown leve em `markdown-to-pdf.ts` (headings, listas, tabelas GFM, bold/italic/code, hr). Mantém zero deps adicionais.
- Auto-save: editor reusa `useAutoSave` (delay 3000ms). Status `ACCEPTED|REJECTED` torna a proposta imutável (server + client guards).
- Status flow: aceitar proposta promove o lead para `WON`; enviar promove leads em `NEW|QUALIFIED` para `PROPOSAL_SENT`.
- `Prisma` no `@prumo/db` é type-only; `Prisma.JsonNull` (runtime) NÃO está disponível. Para campos Json opcionais, omita do payload em vez de passar `JsonNull`.
- Endpoint PDF: `/api/proposals/[id]/pdf` (GET) renderiza com `renderToBuffer` + `React.createElement(... as any)` — mesmo padrão de `/api/reports/receivables/pdf`.
- Substituição de placeholders centralizada em `lib/proposals/placeholders.ts` (`applyPlaceholders`, `formatBRL`, `formatDuration`, `formatDate`). Placeholders desconhecidos são preservados para futura preenchimento (incluindo IA — WP-51).

**Proposals AI (WP-51)**:
- Helpers em `apps/web/lib/ai/proposals.ts`: `aiGenerateProposal` (Sonnet, feature `proposal_generate`), `aiExtractLeadFromConversation` (Haiku, feature `lead_extract`), `aiNextActionSuggest` (Haiku, feature `lead_next_action`).
- Endpoints: `/api/v1/ai/generate-proposal`, `/api/v1/ai/extract-lead`, `/api/v1/ai/lead-next-action`.
- Server action `createAiGeneratedProposal` (em proposals/actions.ts) cria proposta com `aiGenerated: true` — NÃO usa `createProposalSchema` porque conteúdo já vem da IA.
- O endpoint `generate-proposal` pré-aplica `applyPlaceholders({cliente,valor,prazo,data,escritorio})` antes de mandar para a IA — economiza tokens.
- Para `aiGenerated`, badge `<AiBadge>` já existe em `components/proposals/ai-badge.tsx`; condição `proposal.aiGenerated && <AiBadge />` no editor.
- "Extrair lead" foi montado como Sheet em `/leads` (botão ao lado de "Novo lead"), não em `/leads/new` — leads não têm página `/new`, padrão do projeto é Sheet.

**Lead Conversion / Follow-up (WP-52)**:
- Server action `convertLead(leadId)` em `apps/web/app/(dashboard)/leads/[id]/convert/actions.ts` — transaction Prisma cria/reusa Client → Project → Contract → Payments. Permission `project:create`.
- Reuso de cliente: busca por email normalizado (`email: { has: normalizedEmail }`). Sem email → cria novo. `Client.type='INDIVIDUAL'` por default; `phones` é Json `[{ number, label }]`.
- Parcelas geradas a partir de `proposal.paymentTerms` (`installments`, `frequency`). Helpers locais `addMonths`, `frequencyToMonths`, `buildInstallments` (fix último valor para casar `totalAmount` exato). Primeira due date: hoje + 30 dias.
- Notificação `PROJECT_STATUS_CHANGED` aos OWNERs do tenant (best-effort, não falha o fluxo). ActivityLog `lead.converted`.
- Cron `lead-followup-reminder` (13h UTC, `0 13 * * *`): leads abertos com owner sem interação há > 7 dias geram `LEAD_INACTIVE`. Suprime duplicidade via `Notification.data.path:['leadId'] equals leadId` nos últimos 7 dias.
- `NotificationType` ganhou `LEAD_INACTIVE` (migration `20260504100000_lead_inactive_notification`). Mapas de ícone/cor em `notification-page-list.tsx` e `notification-sheet.tsx` usam `UserX` + `text-amber-600`.

**Contract Readjustment (WP-54)**:
- Enums `ReadjustmentIndex` (IGPM|INCC|IPCA|CUSTOM) e `ReadjustmentFrequency` (YEARLY|BIANNUAL); model `ContractReadjustment` (relação com `Contract` via cascade). Migration `20260504120000_contract_readjustments`.
- `EntityType.CONTRACT_READJUSTMENT` + `NotificationType.CONTRACT_READJUSTED` adicionados.
- BCB SGS series: IGPM=189, INCC=192, IPCA=433. Cliente em `lib/readjustment/bcb-client.ts` — `fetchAccumulatedRate(index, months)` compõe variação multiplicativamente `(1+r1)*(1+r2)*...-1`. Sem chave, sem retry interno (cron tenta no próximo dia).
- `mathjs` (instalado em `apps/web`). Helpers em `lib/readjustment/calculator.ts`: `applyRate(amount, ratePercent)`, `computeNextReadjustmentDate(from, frequency)`, `frequencyToMonths`. Arredondamento `toFixed(2)` half-away-from-zero (compatível com expectativa contábil BR).
- Cron `apply-readjustments` (`vercel.json` schedule `0 4 1 * *`): aceita `?simulatedDate=ISO` (uso interno) para validar critério "DADO data 1º". Cache de taxa por `(index, frequency)` evita rebater BCB para múltiplos contratos. Falha de BCB para um índice loga warn e segue o cron — não trava demais reajustes.
- Audit log: `ActivityLog action='contract_readjustment.applied'` com snapshot dos updates (limite 50 entries no JSON). Notification consolidada por tenant (1 por OWNER).
- UI: seção "Reajustes" na página de detalhe do Contract (`/contracts/[id]`) com `ReadjustmentsSection` + Sheet de criação. Permissão reusa `contract:update` (FINANCIAL/ADMIN/OWNER mutam, ARCHITECT também por já ter `contract:update`).
- `ContractReadjustment.customRate` é `Decimal(7,4)` opcional — só preenchido quando `index = 'CUSTOM'`. Schema Zod com `superRefine` valida 0 < rate <= 100.

**RRT/ART (WP-53)**:
- Model `Rrt` (`packages/db/prisma/schema.prisma`) com enums `RrtType` (PROJETO/EXECUCAO/COORDENACAO/OUTRO) e `RrtStatus` (DRAFT/EMITTED/CANCELLED). Migration `20260504110000_rrts`.
- `EntityType.RRT` + `NotificationType.RRT_EXPIRING` adicionados via migration aditiva (preparado para cron WP-58).
- Unicidade de `rrtNumber` por tenant feita via índice parcial SQL (`WHERE rrtNumber IS NOT NULL`); rascunhos podem coexistir com `rrtNumber=null`. Não é declarado como `@@unique` no Prisma para não bloquear drafts.
- Permissões: `rrt:read|create|update|delete|emit|cancel`. ARCHITECT/ADMIN/OWNER mutam; FINANCIAL/VIEWER apenas lê.
- Tabela CAU em `lib/rrt/cau-categories.ts` (estática inicial, ~22 categorias). `searchCauCategories(q)` filtra por label/code/group.
- AI helper `aiEstimateHonorarium` em `lib/ai/rrt.ts` (Haiku, feature `rrt_estimate_honorarium` já estava em `feature-config.ts` desde WP-30). Endpoint `/api/v1/ai/estimate-honorarium`. Resposta esperada: `{ recommendedCents: number|null, justification: string }` — parser tolerante a respostas inválidas.
- Wizard `components/rrt/rrt-wizard.tsx`: 5 passos (tipo+categoria → dados/descrição → IA honorário → revisão → pós-criação com link para PDF + portal CAU). Implementado como `<Sheet>` controlado.
- PDF resumo via `@react-pdf/renderer` em `lib/rrt/pdf-renderer.tsx` + endpoint `/api/rrts/[id]/pdf` (mesmo padrão de proposals: `renderToBuffer` + `React.createElement(... as any)`).
- Validade default = `emittedAt + 1 ano` (`defaultRrtExpiresAt` em `lib/rrt/labels.ts`). Server action `emitRrt` recebe `FormData` (meta JSON + file opcional) e faz upload no bucket `project-files`.
- Schema Zod `lib/schemas/rrt.schema.ts` usa transform `string|number → number|undefined` (não null) — ao montar payload do client, fazer `?? undefined` em vez de `?? null` para `area`/`honorariumAmount`/`aiSuggestedAmount`.

**Legal Documents (WP-55)**:
- Model `LegalDocument` em `schema.prisma` + enum `LegalDocumentType` (12 valores incluindo OUTRO). Migration `20260504130000_legal_documents`.
- `EntityType.LEGAL_DOCUMENT` + `NotificationType.LEGAL_DOC_EXPIRING` adicionados via ALTER TYPE aditivo.
- Documento pode ser global (`projectId = null`) ou vinculado a projeto. Bucket `project-files`, caminho `${tenantId}/${projectId|global}/legal-docs/${id}-${safeName}`.
- Permissões: `legal_doc:read|create|update|delete`. ARCHITECT/ADMIN/OWNER mutam; FINANCIAL/VIEWER apenas leem.
- AI helper `aiLegalDocExtract` em `lib/ai/legal-docs.ts` (Sonnet vision, feature `legal_doc_extract` já em `feature-config.ts`). Endpoint `/api/v1/ai/extract-legal-doc/route.ts` (POST `{ legalDocId }`) faz download do bucket → base64 → runFeature → persiste em `aiExtraction`/`aiModelVersion`/`aiExtractedAt`.
- Server action `createLegalDocument` recebe `FormData` (meta JSON + file opcional) — upload acontece *após* criar o doc para usar ID estável no path. Padrão de `emitRrt` (WP-53).
- Frontend: `LegalDocForm` (Sheet) + `LegalDocsTable` (tabela com badge de validade). Página `/legal-docs` global + extração IA via botão "Extrair com IA" no edit-mode (não persiste — preenche form para usuário confirmar).
- Cron `legal-doc-expiry-check` (8h30 UTC, `30 8 * * *`): notifica OWNERs/ADMINs do tenant para docs com `expiresAt <= now+30d` (ou já expirado). Suprime duplicidade via `Notification.data.path:['legalDocId'] equals doc.id` em janela de 24h. Aceita `?simulatedDate=ISO` (uso interno, validar fluxo).
- Helper `computeExpiryStatus(date)` em `lib/legal-docs/labels.ts` retorna `VALID|EXPIRING_SOON|EXPIRED|NO_EXPIRY` — usado tanto no badge da tabela quanto no resumo numérico do header.
- Schema Zod: `numberOptional` retorna `number | undefined` (nunca `null`); usar `?? undefined` em defaultValues do react-hook-form, não `null`.

**Contract Clause Review (WP-56)**:
- AI helper `aiContractClauseReview` em `lib/ai/contract-review.ts` (Sonnet, feature `contract_clause_review` já em `feature-config.ts`). Endpoint `/api/v1/ai/contract-clause-review` (POST `{ text, contractId? }`).
- Limite de input ~30k tokens validado pelo helper E pelo endpoint via `MAX_INPUT_CHARS = 120_000` (heurística 4 chars/token); estouro retorna 413 `INPUT_TOO_LONG`. Erro custom `ClauseReviewInputTooLongError` é mapeado para 413 também caso o limite seja atingido fora do guard inicial.
- Resposta JSON: `{ issues: Array<{ severity:LOW|MEDIUM|HIGH, clauseRef, excerpt?, description, suggestion }>, summary: string|null, usage }`. Items com `description`/`suggestion` vazios são descartados pelo parser para evitar UI quebrada.
- Permissão exigida: `ai:use` (sem nova permissão `contract:review` — a feature opera em texto colado, não persiste no banco).
- Frontend: `<ContractClauseReviewSheet>` em `components/contracts/`. Sheet com textarea (font-mono), contador char/limite, lista de issues como cards expansíveis (MVP inline do `<AiInsightCard>` previsto para WP-58). Botão integrado em `/contracts/[id]/page.tsx` (gated por `canUseAi`).

**NotificationType v2.0 / RBAC v2.0 (WP-57)**:
- Enum `NotificationType` finalizado com 20 valores. Últimos adicionados (WP-57, migration `20260504140000_notification_type_v2`): `EXPENSE_DUE_SOON`, `EXPENSE_OVERDUE`, `PROPOSAL_VIEWED`, `PROPOSAL_ACCEPTED` — usar quando criar crons/handlers de despesas e tracking de propostas.
- Helper central `apps/web/lib/notifications/labels.ts` (`getNotificationMeta(type)`) retorna `{icon, iconColor, label}`. NUNCA duplicar mapas locais de ícone/cor em novos componentes — sempre reusar este helper. Tem fallback `Bell`/`text-muted-foreground` para tipos não mapeados (defensivo contra migrations rodadas antes de UI).
- Permissions ganharam `client_portal:manage` (OWNER/ADMIN/ARCHITECT) e `expense_category:manage` (OWNER/ADMIN/FINANCIAL). `portal:read|create|revoke` da v1.x continuam — `client_portal:manage` é ortogonal (escopos do Settings → Cliente → Portal).

**Project files (WP-42 / WP-43)**:
- Bucket Supabase `project-files` aceita PDF, imagens, doc/docx, octet-stream e (após WP-43) `text/markdown` + `text/plain`.
- Memorial é persistido como ProjectFile category=MEMORIAL com mime `text/markdown`. Versionamento via `parentFileId` na própria árvore.
- A11y: para inputs custom (checkbox em lista), usar `<div role="checkbox" aria-checked tabIndex={0}>` em vez de `<label>` sem texto — eslint-jsx-a11y exige label-has-associated-control.

**UX Patterns IA (WP-58)**:
- Componentes canônicos em `apps/web/components/ai/` (com barrel `index.ts`): `AiBadge`, `AiSuggestButton`, `AiInsightCard`. Substituem versões inline antigas (`components/proposals/ai-badge.tsx` e `components/expenses/ai-badge-inline.tsx` foram removidos).
- `<AiBadge feature? model? generatedAt? variant=default|solid|compact>`: chip "Gerado por IA" com Tooltip detalhando feature/modelo/data quando informados. Use `variant="compact"` para inline em títulos (substitui o antigo `AiBadgeInline`).
- `<AiSuggestButton label onSuggest? loading? variant=outline|solid|ghost>`: botão padrão com ícone Sparkles + cor `--color-ai`. Loading auto-gerenciado se `onSuggest` retornar Promise (a menos que `loading` venha controlado).
- `<AiInsightCard title feature? model? generatedAt? onRegenerate? collapsible? defaultOpen?>`: card com header + AiBadge + botão "Refazer" + body. Usado em resultados de IA (ex.: contract-clause-review).
- Tokens CSS em `globals.css`: `--color-ai`, `--color-ai-soft`, `--color-ai-foreground`, `--color-ai-border` (light + dark). Reservados para IA — não usar em outros contextos.
- `<Tooltip>` adicionado em `components/ui/tooltip.tsx` (Radix). `TooltipProvider` montado em `app/layout.tsx` com `delayDuration=200`. Componentes que usem Tooltip precisam estar sob esse provider (sempre verdadeiro para rotas dashboard/auth/public).
- `KanbanBoard` agora aceita `accentColor`, `badge` por coluna e `hideColumnCount` (default false → exibe contador discreto à direita do título).
