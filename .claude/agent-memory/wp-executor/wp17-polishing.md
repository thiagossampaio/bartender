---
name: wp17-polishing
description: Decisões do WP-17 — i18n (i18next + pt-BR.json), OnboardingTour custom, formatShortcut() cross-platform, QA hardware checklist
metadata:
  type: project
---

# WP-17 — Polimento (i18n / Onboarding / Acessibilidade / QA hardware)

## i18n
- Stack escolhida: **`i18next` 23.x + `react-i18next` 15.x**. Backend estático: catálogo JSON importado direto (`src/lib/i18n/locales/pt-BR.json`).
  Sem `i18next-http-backend` — manteria offline-first + auditoria do bundle.
- `initI18n()` em `src/lib/i18n/index.ts` é idempotente; chamado em `main.tsx` ANTES do `ReactDOM.render`.
- O catálogo cobre o vocabulário compartilhado (`common.*`, `errors.*`, `gallery.*`, `editor.*`, etc.).
  Componentes já em PT-BR não foram totalmente migrados para `t(...)` no WP-17 — a infraestrutura
  está pronta e o `pt-BR.json` é a fonte canônica para futuras strings novas e tradução.
- Linguagens suportadas hoje: só `pt-BR`. Para adicionar outra, criar `locales/<lang>.json` e
  registrar em `resources` + `SUPPORTED_LANGUAGES`.

## Onboarding
- **Sem `react-joyride`** — overlay centralizado, modal, 4 passos lendo de
  `STEPS` (constante em `OnboardingTour.tsx`). Justificativa: spotlight de
  componentes exigiria refs cross-component invasivos; spec só pede "tour de 3-4 passos".
- Flag de conclusão: `settings.onboarding_completed_v1`. O sufixo `_v1`
  permite re-mostrar o tour se ele for atualizado no futuro.
- `useOnboardingState()` em `src/components/onboarding/useOnboardingState.ts`
  encapsula leitura/escrita. Retorna `status: "unknown" | "pending" | "completed"`
  — caller NÃO renderiza o tour até `status !== "unknown"` para evitar flash.
- Atalhos do tour: ←/→ navega, `Esc` pula.

## Cross-platform shortcuts
- `src/lib/platform.ts` expõe `isMacPlatform()`, `cmdKeyLabel()` (⌘/Ctrl) e
  `formatShortcut("S", { shift: true })` para uso em `title`/`aria-label`.
- Editor.tsx, ZoomControls.tsx passaram a usar `formatShortcut(...)` em vez
  de "Ctrl/⌘+S" hard-coded. `useEditorShortcuts.ts` segue aceitando **ambos**
  modificadores (não foi mexido — comportamento intencional para teclados híbridos).

## Tooltips e acessibilidade
- `ToolButton` na `Toolbar.tsx` agora SEMPRE tem `title` (fallback para o label
  quando o caller não passa) e `aria-label`. Cobre RF-S-03/SPEC-14 item 3.
- Adicionado `focus-visible:ring-2 focus-visible:ring-ring` nos botões Undo/Redo
  do header do editor (faltava).
- Contraste: o token `--muted-foreground 240 3.8% 46.1%` no light theme dá
  ~4.6:1 contra `--background 0 0% 100%` — atende AA WCAG. NÃO mexer sem
  testar de novo com axe-core.

## QA Hardware
- Checklist operacional em `docs/qa-hardware.md` — 11 seções cobrindo todos
  os itens do PRD §12, performance da SPEC-14 e impressão das SPECs 09–12.
- Use esse documento como gate para o release-candidate; bloqueio em qualquer
  PASS impede o cut.

## Gotchas
- `tsconfig.json` já tinha `resolveJsonModule: true` — import de `pt-BR.json` funciona out-of-the-box.
- O `OnboardingTour` usa `ref` no botão primário (forwarded via `Button`).
  Confirmado que `src/components/ui/button.tsx` faz `React.forwardRef`.
- Bundle final cresce ~30 KB (gzip) com i18next + react-i18next. Audit-bundle
  segue OK (sem URLs externas novas).
