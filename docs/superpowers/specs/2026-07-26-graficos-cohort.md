# Gráficos — aba Cohort

## Objetivo

Explicar o destino das OS agrupadas pelo mês de abertura, sem comparar uma coorte ainda em formação como se estivesse madura.

## Regras

- Uma coorte é definida pelo mês de cadastro da OS.
- Encerramento segue a regra canônica do projeto (`isConcluida`).
- Exibir encerradas e ainda abertas como partes complementares do total da coorte.
- Exibir taxa de encerramento total e taxa de encerramento no mesmo mês.
- Identificar visualmente a coorte do mês atual como “em formação”.
- Calcular MTTR com todos os intervalos não negativos que possuem datas válidas, sem corte arbitrário de 90 dias.
- Exibir escopo, denominadores e tabela acessível com drill-down.

