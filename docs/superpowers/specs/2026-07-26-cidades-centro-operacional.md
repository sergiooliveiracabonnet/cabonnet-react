# Cidades — centro de decisão operacional

## Objetivo

Permitir identificar em poucos segundos qual cidade precisa de ação, entender o
motivo e abrir as OS correspondentes sem percorrer painéis repetidos.

## Hierarquia

1. Título e escopos temporais explícitos: fila ao vivo e capacidade de 14 dias.
2. Filtros persistentes na tela: cidade e categoria.
3. Quatro indicadores acionáveis: cidade prioritária, acumulando, críticas e sem equipe.
4. Matriz comparativa das cinco cidades, ordenada por backlog.
5. Detalhamento progressivo da cidade selecionada.
6. Painéis operacionais existentes recolhidos por padrão.

## Interação e responsividade

- Cards e linhas são botões com foco visível e alvo mínimo de 44 px.
- Selecionar uma cidade filtra o detalhamento; "Todas" restaura a comparação.
- Categoria filtra toda a visão sem mudar a janela temporal.
- Cor nunca é o único sinal: estados possuem rótulo ou valor.
- Em 375 px, indicadores usam duas colunas, filtros empilham e tabelas rolam.
- Em 768 px, filtros ficam em linha; em 1024 px, a matriz fica completa.
- A primeira coluna permanece fixa durante rolagem horizontal.

## Design system

Manter tokens, Inter, Lucide e superfícies existentes. A recomendação automática
de hero com vídeo foi descartada por ser inadequada para ferramenta interna.
