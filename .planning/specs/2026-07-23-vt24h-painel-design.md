# Design: Card VT24H no Painel do BI-Gestão Técnica

**Data:** 2026-07-23
**Status:** Aprovado para plano de implementação

## Contexto

O Painel do BI-Gestão Técnica ficou com o KPI de VT (cumprimento de prazo VT3H/VT24H/VT4H) adiado por falta de definição (`.planning/specs/2026-07-23-bi-gestao-tecnica-design.md`, seção "KPIs adiados"). Investigando de novo: **VT24H já existe** no sistema — `_vtPrazoHoras`, `_vtCumpridaNoPrazo`, `_vtViolado` são calculados por linha em `src/lib/transform.ts:372-394`, usados hoje pela Fila de Prioridade (`src/lib/builders/fila.ts`). VT3H e VT4H continuam sem equivalente (só conhecemos VT08H/24H/48H) e ficam fora de escopo. Esta spec cobre só VT24H.

## Achado técnico: fonte de dado diferente

`_vtCumpridaNoPrazo` é um campo de `OSRow`, calculado em `enrichRows()` sobre os dados de `/query` (`OSDataContext.allRows`) — **não** existe em `BacklogRow`/`/backlog`, que é a fonte que o resto do BI-Gestão Técnica usa hoje. O card de VT24H precisa buscar `allRows` via `useOSDerived()` (mesmo hook já usado em `MapaPage.tsx`) como uma segunda fonte de dado só pra esse card, filtrando pelo período local da página (`inicio`/`fim`, o mesmo estado que já alimenta `useBacklog`).

**Critério de "no período":** usa `dataexecucao` da OS (não `datacadastro`) — o card mede cumprimento de prazo de OS **executadas**, então bucketiza pela data de execução. `_vtCumpridaNoPrazo` já é `null` pra OS não executadas, então essas são naturalmente excluídas do card sem filtro extra.

## Escopo

- **Card "VT24H"** na aba Painel, mesmo estilo visual dos cards já existentes (Instalação/Manutenção/Serviço): Executou Prazo, Executou Fora Prazo, Total, % dentro do prazo.
- Não inclui VT3H nem VT4H (sem fonte de dado).
- Não inclui breakdown por equipe/cidade — só o agregado do período, mesmo nível dos outros KPIs do Painel hoje.

## Arquitetura

```
useOSDerived()                              (já existe, mesmo hook do Mapa)
  │  allRows (OSRow[], com _vtPrazoHoras/_vtCumpridaNoPrazo já calculados)
  ▼
buildVt24hStats(allRows, inicio, fim)        (NOVO — client-side, puro)
  │  { executouPrazo, executouForaPrazo, total, pctPrazo }
  ▼
BiGestaoTecnicaPage.tsx → PainelTab (NOVO prop vt24h)
```

## Frontend

### 1. `src/lib/builders/vt24h.ts` (novo)

```ts
export interface Vt24hStats {
  executouPrazo:     number
  executouForaPrazo: number
  total:             number
  pctPrazo:          number
}

export function buildVt24hStats(allRows: OSRow[], inicio: string, fim: string): Vt24hStats
```

Filtra `r._vtPrazoHoras === 24` (isola OS tipo VT24H) e `r._vtCumpridaNoPrazo != null` (só executadas), bucketiza por `dataexecucao` dentro de `[inicio, fim)` usando `parseDate` (já existe em `transform.ts`, mesmo padrão de `biGestaoTecnicaPainel.ts`). Conta `_vtCumpridaNoPrazo === true` (Executou Prazo) vs `=== false` (Executou Fora Prazo).

### 2. `BiGestaoTecnicaPage.tsx` (modificado)

Adiciona `const { allRows } = useOSDerived()` (import de `../../../contexts/OSDataContext`) e `const vt24h = useMemo(() => buildVt24hStats(allRows, inicio, fim), [allRows, inicio, fim])`. Passa `vt24h` como nova prop pro `PainelTab`.

### 3. `PainelTab.tsx` (modificado)

Recebe `vt24h: Vt24hStats` como prop nova. Renderiza um card adicional (mesmo grid dos cards de tipo já existentes) com os 4 valores.

## Testes

- **Vitest:** `vt24h.test.ts` — filtra corretamente por `_vtPrazoHoras === 24`, ignora OS sem `_vtCumpridaNoPrazo` (não executadas), bucketiza por `dataexecucao` dentro do período, calcula `%` corretamente, retorna zeros quando não há OS VT24H no período.

## Fora de escopo

- VT3H / VT4H — sem fonte de dado no banco nem na lógica atual.
- Breakdown do VT24H por equipe/cidade/fornecedor.
