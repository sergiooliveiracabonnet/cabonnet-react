# Dashboard — hierarquia operacional

## Problema

O Dashboard contém sinais úteis, mas mistura urgência, execução diária, planejamento e diagnóstico histórico em uma única sequência. A prioridade operacional perde contraste e a página exige rolagem e reclassificação mental excessivas.

## Objetivo

Permitir que um gestor responda, nesta ordem:

1. O que exige ação agora?
2. A operação de hoje está ganhando ou perdendo fila?
3. Onde está a causa do desvio?
4. Qual análise aprofundada preciso abrir?

## Regras de experiência

- Prioridades, pulso e alertas ativos permanecem visíveis no topo.
- Entrega diária e saúde da fila formam o segundo nível.
- Diagnósticos ficam agrupados em visões nomeadas, com uma visão por vez.
- A visão selecionada deve ser acessível por teclado e anunciada corretamente.
- Nenhum dado ou drill-down existente pode ser removido.
- O layout deve funcionar sem rolagem horizontal entre 375px e 1440px.
- Cores complementam texto e ícones; nunca são o único indicador.

## Estrutura

- **Agir agora:** alertas, Pulso operacional, prioridades e mudanças.
- **Controlar hoje:** capacidade/entrega, executadas, fluxo e prazo consumido.
- **Investigar:**
  - Operação: capacidade futura e ritmo das equipes.
  - Território e demanda: cidades e Pareto de serviços.
  - Qualidade e tendência: coorte, reincidência, meta, fornecedores e qualidade.

## Critérios de aceite

- A página apresenta títulos e descrições que deixam os três níveis inequívocos.
- A área Investigar usa tabs WAI-ARIA com seleção por clique e teclado.
- Apenas o painel investigativo selecionado fica montado/visível.
- Os callbacks de equipe, fornecedor e OS continuam funcionais.
- Testes do Dashboard, build e lint dos arquivos alterados passam.
