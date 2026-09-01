# Design: Menu "BI-Backlog" (Painel Geral + Instalação + Manutenção)

**Data:** 2026-07-23
**Status:** Aprovado para plano de implementação

## Contexto

Segunda fatia dos painéis do i-Manager portados pro Cabonnet React (a primeira foi `.planning/specs/2026-07-23-bi-gestao-tecnica-design.md`). O BI-Backlog original tem várias abas (Painel Geral, Painel Instalação, Painel Manutenção, Comparativo, Análise de Reagendamento ×2, 3× Dados Analisar) — esta rodada cobre só **Painel Geral + Painel Instalação + Painel Manutenção**, as demais ficam pra rodadas futuras.

**Suposição não verificada:** a extensão do navegador estava indisponível durante o brainstorming, então não foi possível abrir "Painel Instalação"/"Painel Manutenção" no iManager pra conferir o conteúdo real. Assume-se que são o mesmo layout do "Painel Geral", só filtrado por tipo de serviço (Instalação/Manutenção). Se isso se provar errado na prática, ajustar é tarefa de uma iteração, não motivo pra travar esta spec.

## Achado favorável: mesma fonte de dado do BI-Gestão Técnica

Todo o conteúdo do Painel Geral é derivável de `/backlog` (mesmo endpoint já usado pelo BI-Gestão Técnica e pelo `/erp/qualidade`) — zero SQL/endpoint novo:

| Elemento (visto no iManager) | Fonte |
|---|---|
| Qtde Equipes | `nomedaequipe` distintos |
| Total Pendentes / Atendimento / Sem Execução / Executadas / Geral | contagem por `descsituacao` |
| Visão Diária (gráfico) | bucketizado por `datacadastro` |
| Qtde por Ocorrências | agrupado por `servico` (mesmo padrão de `buildOcorrencias` já existente em `QualidadePage.tsx:87-98`, extraído pra reuso) |
| Total OS por Equipe Agendada e Tipo Situação | agrupado por `nomedaequipe` × `descsituacao` |

### Suposição sobre "Total Baixadas" vs "Total Executadas"

O iManager mostrava os dois separados com valores bem diferentes (ex: 0 vs 7.450) — a distinção semântica exata (baixa administrativa vs execução em campo?) não está clara e nosso `descsituacao` só tem 4 valores (`Pendente`/`Atendimento`/`Concluída`/`Concluída/Sem Execução`). **Decisão:** "Baixadas" não vira um KPI próprio nesta entrega — só "Total Executadas" (`descsituacao === 'Concluída'`). Se o usuário precisar da distinção depois, é uma investigação separada (provavelmente exige um campo que não existe em `BacklogRow` hoje).

### Mapeamento de status

| KPI iManager | `descsituacao` |
|---|---|
| Total Pendentes | `'Pendente'` |
| Total Atendimento | `'Atendimento'` |
| Total Sem Execução | `'Concluída/Sem Execução'` |
| Total Executadas | `'Concluída'` |
| Total Geral | todas as linhas (sem exclusão de REDE — "Geral" inclui tudo) |

## Escopo

Novo menu **"BI-Backlog"**, 3 abas (mesmo componente de conteúdo, filtrado por tipo):

| Aba | Filtro |
|---|---|
| Painel Geral | nenhum — todas as linhas do período |
| Painel Instalação | `getEquipeTipo(nomedaequipe, tiposervico) === 'INSTALACAO'` (já existe, reaproveitado de `biGestaoTecnicaPainel.ts`) |
| Painel Manutenção | `getEquipeTipo(...) === 'MANUTENCAO'` |

Cada aba mostra: 6 KPIs, gráfico "Visão Diária", "Qtde por Ocorrências" (top 12, clicável — reaproveita o padrão de drill-down já usado em `QualidadePage.tsx`), "Total OS por Equipe" (top 10 por volume, usa `topN` já existente em `_helpers.ts`).

## Arquitetura

```
useBacklog(inicio, fim)                          (já existe, mesmo hook)
  │  BacklogData bruto
  ▼
[getEquipeTipo filtra por aba]                    (já existe, reaproveitado)
  ▼
buildBiBacklogPainel(rows)                        (NOVO — client-side, puro)
  │  KPIs + visão diária + ocorrências + por equipe
  ▼
BiBacklogPage.tsx                                 (NOVO — mesmo padrão do BiGestaoTecnicaPage)
  ├─ controle de período (mesmo padrão já usado)
  └─ TabBar: Painel Geral / Painel Instalação / Painel Manutenção
      └─ PainelBacklogTab (NOVO, reutilizado nas 3 abas)
```

## Frontend

### 1. `src/lib/builders/biBacklogPainel.ts` (novo)

```ts
export interface BiBacklogMesPoint { dia: string; label: string; total: number; pendentes: number; atendimento: number; executadas: number }
export interface BiBacklogOcorrencia { servico: string; count: number; os: BacklogRow[] }
export interface BiBacklogEquipe { equipe: string; total: number; pendente: number; atendimento: number; executada: number; semExecucao: number }

export interface BiBacklogPainel {
  qtdeEquipes:       number
  totalPendentes:    number
  totalAtendimento:  number
  totalSemExecucao:  number
  totalExecutadas:   number
  totalGeral:        number
  visaoDiaria:       BiBacklogMesPoint[]
  ocorrencias:       BiBacklogOcorrencia[]   // top 12, ordenado por count desc
  porEquipe:         BiBacklogEquipe[]       // top 10, ordenado por total desc
}

export function buildBiBacklogPainel(rows: BacklogRow[]): BiBacklogPainel
```

Segue o padrão já estabelecido em `biGestaoTecnicaPainel.ts` (puro, sem I/O, testável com Vitest). `ocorrencias` reaproveita a mesma lógica de `buildOcorrencias` do `QualidadePage.tsx` (agrupa por `servico`, mantém as linhas pra permitir drill-down). `porEquipe`: monta o total por equipe primeiro (`Map<string, number>`), usa `topN` de `_helpers.ts` só pra decidir quais 10 equipes entram, depois computa o breakdown completo (`pendente`/`atendimento`/`executada`/`semExecucao`) apenas para essas 10 — `topN` decide o corte, não produz o breakdown sozinho.

### 2. `PainelBacklogTab.tsx` (novo, em `src/features/erp/biBacklog/`)

Recebe `rows: BacklogRow[]` já filtradas pelo tipo da aba (o filtro por `getEquipeTipo` acontece no componente, igual ao padrão de `RevisitaTab.tsx` recebendo `tipo` como prop — mas aqui mais simples, já que não precisa comparar contra `data.kpis.total` global). Chama `buildBiBacklogPainel(rows)` e renderiza os 4 blocos (KPIs, Visão Diária, Ocorrências com drill-down, Por Equipe).

### 3. `BiBacklogPage.tsx` (novo, em `src/features/erp/biBacklog/`)

Mesmo shell do `BiGestaoTecnicaPage.tsx` (controle de período Mês Atual/Anterior/Personalizado + `useBacklog`), com `TabBar` de 3 abas em vez de 4. Cada aba passa `data.rows` (ou a versão filtrada por tipo) pro `PainelBacklogTab`.

### 4. Navegação e permissão (mesmo padrão do BI-Gestão Técnica)

- `cabonnet/db.py` — novo módulo `erp_bi_backlog` em `ALL_MODULOS`
- `cabonnet/app.py` — label `"BI-Backlog"` em `_MODULO_LABELS`
- `src/lib/modulos.ts` — mapeamento `erp_bi_backlog → /erp/bi-backlog`
- `src/lib/navigation.ts` — novo link no grupo "Analisar"
- `src/pages/index.ts` + `src/App.tsx` — lazy import + rota

## Testes

- **Vitest:** `biBacklogPainel.test.ts` — contagens por status, bucketização diária, top 12 ocorrências (ordenado, com drill-down preservando as linhas), top 10 por equipe, zeros quando não há linhas.
- **Python:** teste do novo módulo de permissão (mesmo padrão do `test_erp_bi_tecnica_modulo_registrado`).

## Fora de escopo

- Comparativo, Análise de Reagendamento (2 versões), 3× Dados Analisar — ficam pra rodadas futuras.
- Distinção "Baixadas" vs "Executadas" — sem campo equivalente em `BacklogRow` hoje.
- Suposição do conteúdo de "Painel Instalação"/"Painel Manutenção" não foi verificada visualmente (extensão do navegador indisponível) — validar quando possível.
