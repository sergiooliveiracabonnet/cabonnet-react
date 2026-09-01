# Design: Filtro de Cidade/Fornecedor/Equipe no BI-Gestão Técnica

**Data:** 2026-07-23
**Status:** Aprovado para plano de implementação

## Contexto

O menu "BI-Gestão Técnica" (`.planning/specs/2026-07-23-bi-gestao-tecnica-design.md`) foi entregue só com um controle de período (Mês Atual/Anterior/Personalizado). O iManager original tinha filtros de Empresa/Cidade no sidebar; o pedido agora é trazer filtros equivalentes — **Cidade, Fornecedor e Equipe** — pras 4 abas (Painel + Revisita Instalação/Serviço/Manutenção), todas ao mesmo tempo (filtro global no topo da página, não por aba).

## Escopo

Três dropdowns de seleção única (não multi-select, não em cascata — decisão explícita abaixo), usando o componente `FilterSelect` que já existe no projeto (`src/components/ui/FilterSelect.tsx`), cada um começando em "Todos":

| Filtro | Fonte dos valores | Lógica |
|---|---|---|
| Cidade | `nomedacidade` das linhas do período | Distinct values presentes nos dados — não uma lista fixa hardcoded, para não mostrar cidade sem OS no período |
| Fornecedor | `getFornecedor(nomedaequipe)` (`src/lib/transform.ts:249-260`, já existe, reaproveitado sem mudança) | Distinct values do resultado de `getFornecedor` aplicado a cada linha |
| Equipe | `nomedaequipe` das linhas do período | Distinct values presentes nos dados |

Os 3 filtros são independentes (selecionar Fornecedor não estreita as opções de Equipe) e combinam com **E lógico** (uma linha só passa se bater com todos os filtros ativos).

## Achado técnico crítico: `kpis.total` precisa ser recalculado

`RevisitaTab.tsx` usa `data.kpis.total` (calculado no backend, em `/backlog`, sem filtro dimensional) como denominador do "% de revisitas no período" (`const totalPeriodo = data.kpis.total`). Se as linhas forem filtradas no cliente sem recalcular esse total, o percentual fica errado (denominador do período inteiro, numerador só do subconjunto filtrado).

**Decisão:** criar um objeto `BacklogData` derivado após aplicar o filtro, com:
- `rows`: só as linhas que passam nos 3 filtros
- `kpis.total`: `rows.length` (recalculado)
- Demais campos de `kpis` (`rev_inst`, `rev_manut`, `rev_serv`, etc.) e `por_equipe`/`por_cidade`/`por_tipo`: mantidos como vieram do backend — não são consumidos por `PainelTab`/`RevisitaTab` hoje (só `rows` e `kpis.total` são), então não precisam de recomputação para este escopo. Se um uso futuro passar a consumi-los, recalcular na hora.

`PainelTab` e `RevisitaTab` não mudam — ambos já recebem só um `BacklogData`; passam a receber a versão filtrada em vez da crua, de forma transparente.

## Arquitetura

```
useBacklog(inicio, fim)                    (já existe, sem mudança)
  │  BacklogData bruto (todas as OS do período, sem filtro dimensional)
  ▼
filtrarBacklogRows(data, filtros)           (NOVO — client-side, puro)
  │  BacklogData derivado (rows filtradas + kpis.total recalculado)
  ▼
BiGestaoTecnicaPage.tsx                     (guarda estado dos 3 filtros)
  ├─ FiltrosBiTecnica (NOVO — 3x FilterSelect)
  ├─ aba Painel        → PainelTab(data filtrado)       (sem mudança no componente)
  └─ abas Revisita x3  → RevisitaTab(data filtrado, tipo) (sem mudança no componente)
```

## Frontend

### 1. `src/lib/builders/biTecnicaFiltros.ts` (novo)

```ts
export interface BiTecnicaFiltros {
  cidade:     string  // '' = Todos
  fornecedor: string  // '' = Todos
  equipe:     string  // '' = Todos
}

export const FILTROS_VAZIOS: BiTecnicaFiltros = { cidade: '', fornecedor: '', equipe: '' }

export function opcoesCidade(rows: BacklogRow[]): string[]      // distinct nomedacidade, ordenado
export function opcoesFornecedor(rows: BacklogRow[]): Fornecedor[]  // distinct getFornecedor(nomedaequipe)
export function opcoesEquipe(rows: BacklogRow[]): string[]      // distinct nomedaequipe, ordenado

export function filtrarBacklogRows(data: BacklogData, filtros: BiTecnicaFiltros): BacklogData
```

`filtrarBacklogRows` retorna um novo objeto (não muta `data`), com `rows` filtradas e `kpis.total = rows.length`; demais campos copiados de `data` sem alteração.

### 2. `src/features/erp/biGestaoTecnica/FiltrosBiTecnica.tsx` (novo)

3x `FilterSelect` lado a lado (Cidade, Fornecedor, Equipe), recebendo os arrays de opções (computados via `opcoesCidade`/`opcoesFornecedor`/`opcoesEquipe` sobre `data.rows` bruto — antes do próprio filtro, pra não fazer as opções desaparecerem conforme o usuário filtra) e o estado atual + setters.

### 3. `BiGestaoTecnicaPage.tsx` (modificado)

- Novo `useState<BiTecnicaFiltros>(FILTROS_VAZIOS)`.
- Renderiza `<FiltrosBiTecnica>` ao lado do controle de período já existente.
- `const dataFiltrado = useMemo(() => data ? filtrarBacklogRows(data, filtros) : undefined, [data, filtros])`.
- Passa `dataFiltrado` (em vez de `data`) pras 4 abas.

## Testes

- **Vitest:** `biTecnicaFiltros.test.ts` — `opcoesCidade`/`opcoesFornecedor`/`opcoesEquipe` (distinct + ordenado), `filtrarBacklogRows` (combina os 3 filtros com E lógico, recalcula `kpis.total`, retorna tudo quando filtros vazios, não muta o `data` original).
- Sem teste de componente dedicado pro `FiltrosBiTecnica` (presentational puro sobre `FilterSelect` já usado/testado indiretamente em outras páginas) — mesma convenção do `RevisitaTab`/`PainelTab` na entrega anterior.

## Fora de escopo (decisões explícitas)

- Multi-seleção (checkboxes, mais fiel ao iManager original) — decisão do usuário: dropdowns de seleção única, componente já existente, menor esforço.
- Filtros em cascata (Fornecedor estreitando opções de Equipe) — decisão do usuário: os 3 filtros ficam independentes.
- Filtro por período dentro de cada aba — já existe (controle de período no topo), fora do escopo desta spec.
