# Fila Ativa — Prazo Consumido

## Objetivo

Transformar o painel em uma leitura operacional clara da distribuição da fila por consumo do SLA.

## Requisitos

- Exibir uma barra horizontal empilhada representando 100% da fila.
- Exibir as quatro faixas em barras horizontais comparáveis.
- Mostrar quantidade e percentual diretamente em cada faixa.
- Destacar o total em risco, composto por Estourado e 2× SLA.
- Manter o drill-down de cada faixa e descrição textual acessível.
- Usar transições curtas e respeitar `prefers-reduced-motion`.

## Critérios de aceite

- A distribuição geral possui descrição acessível.
- Cada faixa possui barra com `aria-valuenow`, `aria-valuemin` e `aria-valuemax`.
- O clique continua abrindo somente as OS correspondentes à faixa.
