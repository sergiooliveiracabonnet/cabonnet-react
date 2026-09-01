# Mapa — Filtro de Equipe

**Data:** 2026-07-16
**Status:** Aprovado

## Problema

No Menu Mapa não é possível filtrar as OS por equipe. Para saber qual equipe está mais próxima de um endereço, o usuário precisa olhar o painel de proximidade (que já lista todas as equipes com OS ativas perto do endereço buscado), mas não consegue isolar visualmente no mapa apenas as OS de uma equipe específica.

## Contexto de dados

O mapa não tem coordenadas reais por OS, exceto para OS "em atendimento agora" (GPS capturado pelo técnico via `useOSExecucaoGeo`). As demais OS são agregadas por bairro/cidade, com o bairro posicionado por um deslocamento determinístico ao redor do centro da cidade (`bairroOffset` em `geo.ts`) — não é o endereço real. Por isso, a solução aprovada filtra o conjunto de OS que já alimenta as agregações existentes, em vez de introduzir pinos individuais por OS (que dariam falsa precisão de localização).

## Solução

Adicionar um `FilterSelect` de "Equipe" na barra de filtros do `MapaPage`, ao lado dos filtros de Status/Tipo/Aging já existentes.

- **Opções:** derivadas de `globalRows` (mesma fonte usada pelos outros filtros), extraindo valores únicos de `nomedaequipe`, ordenados alfabeticamente. Label exibido via `shortEquipe()`, valor = `nomedaequipe` completo (para casar com o dado bruto nas comparações).
- **Efeito do filtro:** quando uma equipe é selecionada, o `useMemo` de `rows` (que já aplica os filtros de status/tipo/aging) passa a filtrar também por `nomedaequipe === filterEquipe`. Como `rows` é a fonte única para heatmap, bolhas de cidade/bairro, ranking lateral, painéis de detalhe (`CidadePanel`/`BairroPanel`) e o cálculo de proximidade por endereço (`proximidade` useMemo), todos esses elementos passam a refletir automaticamente só as OS da equipe selecionada — sem nenhuma mudança em `MapaComponents.tsx` ou `geo.ts`.
- **Combinação com busca de endereço:** ao buscar um endereço com uma equipe já filtrada, o painel `AddressSearchPanel` mostra a distância dos bairros daquela equipe até o ponto buscado — respondendo diretamente "essa equipe está perto desse endereço?".

## Fora de escopo

- Pinos individuais por OS (mantém granularidade cidade/bairro já existente).
- Qualquer mudança no backend ou nos hooks de dados.

## Arquivos afetados

- `src/features/mapa/MapaPage.tsx` — novo state `filterEquipe`, `equipeOpts` derivado de `globalRows`, inclusão no filtro de `rows`, novo `FilterSelect` na barra de filtros.
