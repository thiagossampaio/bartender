---
name: exec-wp-batch
description: Executa múltiplos workplans em sequência, cada um em contexto isolado via subagent wp-executor. Use quando o usuário pedir para rodar vários WPs de uma vez (ex: "execute WP-35, WP-36, WP-37" ou "rode todos os WPs pendentes").
argument-hint: [WP-NN WP-NN WP-NN...]
disable-model-invocation: false
---

# Executar Workplans em Lote

Lista de workplans a executar: **$ARGUMENTS**

## Contexto

- Branch atual: !`git branch --show-current`
- Status do repositório: !`git status --short`
- WPs pendentes na spec: !`grep -E "^\s*-\s*\[ \]\s*WP-" specs/20250503_evolucao/work-plan.md 2>/dev/null | head -20 || echo "Não foi possível inspecionar work-plan.md automaticamente."`

## Fluxo

Para cada WP listado em `$ARGUMENTS`, **na ordem fornecida**:

1. Delegue ao subagent `wp-executor` via Agent tool, passando o WP-NN como tarefa.
2. Aguarde o resumo de retorno do subagent.
3. Se o subagent retornar sucesso (`✅`), prossiga para o próximo WP.
4. Se o subagent retornar erro ou bloqueio, **pare imediatamente** e reporte ao usuário:
   - Qual WP falhou
   - Resumo do motivo
   - Quais WPs ainda estão pendentes na fila

Não tente "consertar" um WP falhando dentro deste batch — o usuário decide se
quer investigar manualmente ou pular.

## Por que delegar a um subagent

Cada execução do `wp-executor` roda em uma janela de contexto isolada. Isso
significa:

- O contexto principal não é poluído com leituras de arquivos, greps, logs de
  lint e diffs.
- Você pode encadear muitos WPs em sequência sem precisar de `/clear` no meio.
- O retorno de cada subagent é apenas o resumo executivo do que foi feito.

## Resumo final consolidado

Quando terminar (todos os WPs concluídos ou parada por erro), apresente um
resumo consolidado:

```
📋 Lote concluído: <X de Y WPs executados>

✅ Concluídos:
- WP-NN: <commit hash>
- WP-NN: <commit hash>

❌ Falhou (se houver):
- WP-NN: <motivo curto>

⏸ Não executados (se houver):
- WP-NN, WP-NN, ...

Próximos passos sugeridos:
- <ex: revisar commits, push, executar próximos WPs>
```
