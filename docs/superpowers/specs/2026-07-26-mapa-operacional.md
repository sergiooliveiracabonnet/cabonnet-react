# Mapa Operacional — melhoria de precisão e usabilidade

## Objetivo

Tornar o Mapa adequado para decisão operacional, deixando explícito quando uma posição é aproximada, reduzindo a sobrecarga de controles e melhorando uso em desktop e celular.

## Escopo

- Renomear o produto para “Mapa Operacional”.
- Usar Bolhas como visualização padrão e “Concentração por cidade” como camada alternativa.
- Impedir concentração agregada quando a granularidade for Bairro.
- Exibir aviso persistente de coordenadas aproximadas no modo Bairro.
- Organizar filtros em painel recolhível, com contador e ação para limpar.
- Manter busca e KPIs em uma faixa principal mais compacta.
- Adicionar legenda completa para cor, tamanho, aproximação e execução em campo.
- Restaurar controles visíveis de zoom e escala.
- Adaptar ranking e detalhes para larguras móveis.
- Adicionar nomes acessíveis, estados selecionados e alvos de toque adequados.
- Priorizar OS críticas e mais antigas no limite de geocodificação por equipe.

## Fora de escopo

- Inventar coordenadas reais para bairros sem uma fonte confiável.
- Persistência de geocodificação no backend.
- Troca do provedor externo de mapas/geocodificação.

## Critérios de aceite

- O usuário distingue claramente coordenadas reais e aproximadas.
- Não existe opção “Ambos”.
- O mapa possui zoom, escala, legenda textual e região acessível.
- Filtros podem ser recolhidos e limpos em uma ação.
- Painéis não ultrapassam a largura útil de 375 px.
- A geocodificação limitada ordena crítico, excedido e maior aging primeiro.
