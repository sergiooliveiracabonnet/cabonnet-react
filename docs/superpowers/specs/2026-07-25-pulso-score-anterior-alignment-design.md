# Pulso Operacional — alinhamento do score anterior

## Problema

O indicador de tendência ocupa a mesma coluna de 84 px do gauge, mas o texto “↓ -3 vs anterior” quebra em duas linhas dentro de um badge. Embora o centro geométrico esteja correto, o bloco parece solto, tem peso visual excessivo e o score anterior só aparece no tooltip.

## Solução

Substituir o badge por um comparativo compacto, semanticamente estruturado e alinhado ao eixo do gauge:

- rótulo curto “Anterior”;
- score do período anterior visível;
- delta com seta e cor de tendência na mesma linha do valor;
- separador sutil, sem formato de botão;
- largura limitada à coluna do gauge e conteúdo sem quebra.

## Fora do escopo

- alterar cálculo, cor ou faixa do score;
- alterar o gauge ou o restante do Pulso Operacional;
- modificar o painel de tendência detalhada.

## Critérios de aceite

- valor anterior e delta ficam visíveis sem tooltip;
- bloco anterior, gauge e coluna compartilham o mesmo centro horizontal;
- conteúdo não quebra em 375 px ou 1.280 px;
- não há overflow horizontal;
- testes, lint, build e QA em browser passam.

