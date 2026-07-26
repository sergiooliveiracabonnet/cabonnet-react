# P2 — Painéis analíticos acionáveis e consistentes

## Problema

Os painéis analíticos inferiores do dashboard entregam informação útil, mas parecem ter sido montados por regras visuais diferentes. O título de `Fluxo de OS` é um parágrafo, `Meta do Mês` usa `span` e os demais usam `h2`. Aging, Cidades e Composição aceitam clique, porém não exibem uma indicação persistente de ação. Ritmo por Equipe e Fornecedores comparam desempenho, mas não permitem abrir as OS que explicam o resultado.

No baseline real do localhost, não há overflow, mas a inconsistência é objetiva:

- mobile 375 px: altura total de 4.556 px;
- desktop 1.280 px: altura total de 2.111 px;
- títulos com três semânticas diferentes (`h2`, `p` e `span`);
- Aging, Cidades e Composição têm botões sem affordance visível;
- Ritmo e Fornecedores não possuem drill-down;
- nenhum erro de console foi observado.

## Objetivo

Fazer os painéis analíticos funcionarem como uma família: título, contexto e ação seguem o mesmo contrato; comparações críticas permitem investigar as OS de origem em um clique; o dashboard não cresce nem muda suas regras de negócio.

## Escopo

1. Criar um cabeçalho compartilhado para painéis analíticos, composto sobre `SectionLabel`.
2. Garantir títulos `h2` consistentes em Fluxo, Meta e painéis já existentes.
3. Exibir a indicação compacta `Abrir OS` nos painéis com drill-down.
4. Tornar linhas de Ritmo por Equipe e Fornecedores acionáveis.
5. Abrir o modal existente com as OS do período filtradas por equipe ou fornecedor.
6. Melhorar nomes acessíveis dos itens já clicáveis em Aging, Cidades e Composição.

## Fora do escopo

- alterar fórmulas, metas, thresholds ou builders;
- criar endpoint ou buscar dados adicionais;
- transformar cards de Qualidade em filtros ambíguos;
- redesenhar os níveis P0/P1;
- tratar as vulnerabilidades registradas em `.memory/security-backlog.md`.

## Arquitetura de interface

`DashboardPanelHeader` centraliza três zonas compactas:

- identidade: ícone, acento e título semântico;
- contexto: legenda ou resumo da métrica;
- ação: ícone e texto persistente quando o conteúdo abre OS.

O cabeçalho aceita quebra de linha, mas mantém a mesma densidade dos cabeçalhos atuais. Ele não cria uma nova faixa vertical. Os componentes continuam responsáveis por seus cálculos e apenas recebem callbacks opcionais de abertura.

## Regras de drill-down

- Ritmo por Equipe: filtrar `rows` do período por `nomedaequipe`, com comparação normalizada e exata.
- Fornecedores: filtrar `rows` do período pela apresentação de `_fornecedor` via `FORN_LABEL`.
- Aging, Cidades e Composição: manter os filtros atuais e tornar o destino explícito no nome acessível.
- O modal reutiliza `KpiModalTable`, exportação CSV e drawer de OS já existentes.

## Acessibilidade

- todo título principal de painel é um `h2`;
- cada linha acionável é um `button` real;
- o nome acessível comunica dimensão, valor quando útil e a ação `Abrir OS`;
- foco por teclado permanece visível pelos estilos globais;
- cor não é o único sinal de interatividade.

## Critérios de aceite

- Fluxo de OS e Meta do Mês expõem títulos `h2`;
- Aging, Cidades, Composição, Ritmo e Fornecedores exibem `Abrir OS`;
- clicar em uma equipe abre somente as OS daquela equipe no período;
- clicar em um fornecedor abre somente as OS daquele fornecedor no período;
- nenhuma fórmula ou chamada de API muda;
- não há overflow horizontal em 375 px ou 1.280 px;
- altura da página fica em até 4.600 px no mobile e 2.150 px no desktop com o mesmo conjunto de dados;
- testes focados, suíte completa, lint, build e QA em browser passam.

