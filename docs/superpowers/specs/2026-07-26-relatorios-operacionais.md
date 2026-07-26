# Relatórios Operacionais

## Objetivo

Transformar o menu em uma prévia de relatório confiável e exportável, com filtros explícitos e métricas que compartilham o mesmo escopo.

## Regras

- Filtros locais: período real, campo de data, categoria, cidade, equipe e situação.
- O período deve usar datas, nunca aging.
- Estoque/fila deve usar estados atuais; produção deve usar `isExecucaoReal`.
- REDE deve permanecer categoria própria.
- Equipes desconhecidas no cadastro não podem desaparecer dos totais.
- KPIs, gráficos, ranking, drill-down e exportação devem derivar das mesmas linhas filtradas.
- CSV deve escapar separadores, aspas, quebras de linha e fórmulas de planilha.
- A prévia deve oferecer CSV e PDF, informar o escopo e permitir abrir o drawer da OS.
- Controles e cards devem funcionar por teclado e expor estado acessível.

