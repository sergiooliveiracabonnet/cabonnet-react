# Gráficos — aba Tendência

## Objetivo

Transformar a aba em uma leitura temporal confiável do fluxo de OS, distinguindo abertura, execução real, saldo operacional e conclusão das coortes.

## Regras

- Exibir o mesmo escopo de período, campo de data, frente e amostra usado em Distribuição.
- Resumir os últimos dias disponíveis com abertas, concluídas, saldo e pico de abertura.
- Usar data de cadastro para aberturas e data de baixa/execução para conclusões reais.
- Incluir no eixo dias e meses que possuam somente abertura ou somente conclusão.
- Remover o comparativo de status atual por data de abertura, pois ele não representa histórico de transições.
- Remover “Meta vs Realizado”: a série existente é uma média da amostra, não uma meta configurada.
- Manter a taxa por coorte, nomeando-a explicitamente como percentual das OS abertas no dia que hoje estão concluídas.
- Todo ponto selecionável deve abrir o detalhamento das OS e permitir abrir o drawer da ordem.

