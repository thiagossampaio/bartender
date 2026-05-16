---
name: exec-wp
description: Implementa um workplan (WP-NN) da spec de evolução de ponta a ponta, seguindo padrões do projeto, atualizando status e gerando commit. Use quando o usuário pedir para executar, implementar ou rodar um WP-NN.
argument-hint: [WP-NN]
allowed-tools: Read, Edit, Write, Grep, Glob, Bash(git *), Bash(npm *), Bash(yarn *), Bash(pnpm *), Bash(./gradlew *), Bash(mvn *)
disable-model-invocation: false
---

# Executar Workplan $ARGUMENTS

Você vai implementar o workplan **$ARGUMENTS** da especificação de evolução, ponta a ponta.

## Contexto pré-carregado

- Branch atual: !`git branch --show-current`
- Status do repositório: !`git status --short`
- Trecho do workplan **$ARGUMENTS**: !`grep -B 1 -A 30 "$ARGUMENTS" specs/20250503_evolucao/work-plan.md || echo "[ATENÇÃO] $ARGUMENTS não encontrado em specs/20250503_evolucao/work-plan.md — verifique o identificador antes de prosseguir."`

## Fluxo obrigatório

1. **Ler a spec completa** em `specs/20250503_evolucao/work-plan.md` para entender dependências e ordem de execução.
2. **Apresentar um plano resumido** (máximo 10 bullets) do que será feito para implementar **$ARGUMENTS**. Aguardar aprovação implícita do modo de execução antes de modificar arquivos.
3. **Implementar** seguindo rigorosamente os padrões existentes do projeto:
   - Antes de criar qualquer arquivo novo, inspecionar arquivos vizinhos para entender convenções (nomenclatura, estrutura de pastas, imports, formatação).
   - Não fazer refatorações fora do escopo de **$ARGUMENTS**.
   - Quando houver componente de frontend descrito no workplan, implementar também.
4. **Validar localmente**: rodar lint, typecheck e/ou testes existentes no projeto (detecte os scripts em `package.json`, `pom.xml`, `build.gradle` etc.). Se nenhum desses existir, mencionar no resumo final.
5. **Atualizar status para `✅ Concluído`** em `specs/20250503_evolucao/work-plan.md`:
   - Status do workplan **$ARGUMENTS**.
   - Status geral da spec, **somente se** este for o último WP pendente.
6. **Commitar** com a mensagem exata: `feat: $ARGUMENTS implementado`
   - Adicionar apenas arquivos relacionados a **$ARGUMENTS**.
   - Nunca fazer `git push` automaticamente.

## Critérios de aceitação (autoavaliação antes de finalizar)

- [ ] O código segue os padrões existentes do projeto.
- [ ] Nenhuma refatoração não relacionada a **$ARGUMENTS** foi feita.
- [ ] Frontend implementado quando aplicável à especificação.
- [ ] Status do WP e da spec atualizados para `✅ Concluído`.
- [ ] Commit criado com a mensagem `feat: $ARGUMENTS implementado`.
- [ ] Lint/testes do projeto passam (ou ausência justificada).

## Resumo final

Ao terminar, retorne **apenas** este formato compacto (sem dumps de diff ou logs):

```
✅ $ARGUMENTS concluído

Arquivos tocados:
- <path 1>
- <path 2>

Setup/configuração novos (se houver):
- <instrução curta ou "Nenhum">

Validações executadas:
- <lint|typecheck|testes>: <ok|skip>

Commit: <hash curto>
```

Se algo bloquear a execução (workplan ambíguo, dependência não implementada, falha persistente em testes), **pare e reporte** em vez de improvisar.
