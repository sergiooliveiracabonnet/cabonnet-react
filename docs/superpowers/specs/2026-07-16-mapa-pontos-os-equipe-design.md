# Mapa — Pontos individuais de OS por equipe (endereço real geocodificado)

**Data:** 2026-07-16
**Status:** Aprovado

## Problema

O filtro de equipe (feature anterior, já em produção neste branch) só mostra as OS da equipe agregadas por cidade/bairro — bolhas, não pontos individuais. O usuário quer ver cada OS da equipe selecionada como um ponto próprio no mapa, com detalhes do cliente, para avaliar visualmente qual equipe está mais perto de um endereço.

## Contexto de dados

Como já registrado na spec anterior, o mapa não tem coordenada real por OS — só para OS "em atendimento agora" (GPS capturado em campo). Para o restante, esta feature introduz geocodificação **sob demanda**, via Nominatim (mesmo serviço já usado na busca manual de endereço em `searchAddress.ts`), disparada apenas quando uma equipe específica está selecionada — nunca para "todas as equipes", o que evitaria uma avalanche de chamadas.

## Solução

### 1. Geocodificação com cache e limite de segurança

Novo arquivo `src/features/mapa/useGeocodedEquipeOS.ts`, hook `useGeocodedEquipeOS(rows: OSRow[], active: boolean)`:

- **Endereço de consulta:** `logradouro (ou enderecoconexao), numero - bairro, cidade` (mesmo padrão de campos que `OSHoverCard` já usa para exibir endereço). OS sem `logradouro`/`enderecoconexao` E sem `cidade` não entram na fila — vão direto para o fallback aproximado (não há endereço para geocodificar).
- **Cache em `localStorage`** (`cabonnet:geocode-cache`), chave = endereço normalizado (trim + uppercase), valor = `{ lat, lng }`. Carregado uma vez ao montar o hook; leitura/escrita protegidas por `try/catch` com `console.warn` em falha (nunca lança, nunca falha silenciosamente) — se `localStorage` não estiver disponível, o hook funciona só com cache em memória da sessão.
- **Fila sequencial**, 1 endereço por vez, **1100ms de intervalo** entre chamadas de rede (política de uso do Nominatim: máx. 1 req/s). Endereços já em cache resolvem instantaneamente, sem entrar na fila de rede.
- **Limite de segurança:** `MAX_GEOCODE_OS = 60`. Se `rows.length > 60`, só as primeiras 60 (na ordem em que já vêm) entram no hook; o hook expõe `capped: boolean` e `total: number` para a UI avisar o usuário — nunca esconde que há mais.
- **Fallback por falha ou endereço ausente:** cai para a posição aproximada do bairro (nova função `getBairroCoords(cidade, bairro)`, extraída de `geo.ts`, ver seção 2), marcado com `approx: true`. Nunca cacheia falhas (uma tentativa nova por sessão é aceitável, é só 1 request).
- **Cancelamento:** ao trocar de equipe (ou desativar `active`), a fila em andamento é cancelada via flag de cleanup do `useEffect` — não deixa resultados de uma equipe antiga vazarem pra outra.

**Retorno do hook:**
```typescript
interface GeocodedOSPoint {
  os:     OSRow
  lat:    number
  lng:    number
  approx: boolean
}
interface UseGeocodedEquipeOSResult {
  points:   GeocodedOSPoint[]
  resolved: number   // quantos já têm posição (cache, geocodificados ou fallback)
  total:    number    // min(rows.length, MAX_GEOCODE_OS)
  capped:   boolean   // rows.length > MAX_GEOCODE_OS
}
```

### 2. Refactor em `geo.ts` — `getBairroCoords` reutilizável

Hoje o deslocamento determinístico de bairro (`bairroOffset`) só é usado dentro de `aggregateByBairro`. Extrair:

```typescript
export function getBairroCoords(cidade: string, bairro: string): { lat: number; lng: number } | null {
  const cityCoords = getCityCoords(cidade)
  if (!cityCoords) return null
  const { dlat, dlng } = bairroOffset(normalize(bairro))
  return { lat: cityCoords.lat + dlat, lng: cityCoords.lng + dlng }
}
```

`aggregateByBairro` passa a chamar `getBairroCoords` internamente em vez de duplicar a conta — mesmo resultado, uma fonte só. `bairroOffset` continua privada.

### 3. Troca automática de visualização em `MapaPage.tsx`

Quando `filterEquipe` não é vazio:
- Heatmap e bolhas de cidade/bairro somem (bloco condicionado a `!filterEquipe`).
- Novo bloco de `CircleMarker`, um por `GeocodedOSPoint` retornado pelo hook, cor por criticidade (mesma paleta já usada nas bolhas: vermelho `_slaCritico`, laranja `_slaExcedido`, azul pendente/atendimento, verde demais). Pontos `approx: true` recebem `dashArray` na borda (`pathOptions.dashArray = '3 3'`) para diferenciar visualmente de posição real.
- **Hover:** `Tooltip` compacto — cliente, endereço curto, status, aging (mesmo padrão dos pinos de execução já existentes no arquivo).
- **Clique:** `setDrawerOS(point.os)` — abre o `OSDrawer` já usado no resto da página (mesmo padrão do clique nos pinos de execução).
- **Indicador de progresso:** badge flutuante (mesmo estilo visual da legenda existente) mostrando `Geocodificando resolved/total…` enquanto `resolved < total`; se `capped`, mostra `60 de N — refine por Status/Tipo/Aging` permanentemente enquanto a equipe estiver selecionada.
- Quando `filterEquipe` volta a vazio, tudo volta ao comportamento atual (heatmap/bolhas cidade-bairro).

Os toggles de granularidade (Cidade/Bairro) e de visualização (Calor/Bolhas/Ambos) continuam visíveis mas não têm efeito enquanto uma equipe está selecionada — modo pontos sempre tem prioridade. Não há necessidade de desabilitá-los visualmente: ao voltar para "Todas as equipes" eles voltam a fazer efeito imediatamente.

## Fora de escopo

- Geocodificação em lote para "todas as equipes" (o gatilho continua sendo só uma equipe específica selecionada).
- Persistência da geocodificação no backend (cache é só `localStorage`, por navegador).
- Mudança em `AddressSearchPanel`/cálculo de proximidade por bairro — continuam como estão, é uma feature ortogonal a esta.
- Desabilitar visualmente os toggles Cidade/Bairro/Calor/Bolhas quando uma equipe está selecionada (eles só ficam sem efeito).

## Arquivos afetados

- `src/features/mapa/useGeocodedEquipeOS.ts` — novo hook (geocodificação + cache + fila + limite).
- `src/features/mapa/geo.ts` — nova função exportada `getBairroCoords`; `aggregateByBairro` refatorado para reutilizá-la.
- `src/features/mapa/MapaPage.tsx` — troca condicional heatmap/bolhas ↔ pontos individuais, indicador de progresso.
- `src/features/mapa/MapaComponents.tsx` — pode ganhar um pequeno componente de badge de progresso, se fizer sentido isolar (decisão de implementação, não estrutural).
