# Fluxo de OS — curvas suaves e preenchimento

## Objetivo

Melhorar a leitura do gráfico “Fluxo de OS” no Dashboard, especialmente quando a janela possui poucos dias, usando curvas suaves e áreas preenchidas sem esconder a comparação entre as séries.

## Requisitos

- Renderizar Entradas e Concluídas com curvas cúbicas suaves.
- Preencher a área abaixo de cada curva com gradiente translúcido.
- Manter Entradas com linha contínua e Concluídas com linha tracejada para não depender apenas da cor.
- Preservar crosshair, tooltip, resumo e tabela acessível.
- Identificar semanticamente as áreas e linhas no SVG para testes e manutenção.

## Critérios de aceite

- As duas linhas usam comandos cúbicos (`C`) no caminho SVG.
- Existem duas áreas preenchidas, uma por série.
- O preenchimento não captura eventos do ponteiro e não interfere no hover.
- Os testes existentes continuam passando.
