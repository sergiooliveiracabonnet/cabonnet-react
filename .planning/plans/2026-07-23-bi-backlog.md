# Menu "BI-Backlog" (Painel Geral + Instalação + Manutenção) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o menu "BI-Backlog" no Cabonnet React, com 3 abas (Painel Geral / Painel Instalação / Painel Manutenção) mostrando KPIs de backlog, visão diária, ocorrências (com drill-down) e total de OS por equipe — portado do i-Manager.

**Architecture:** Mesmo padrão do BI-Gestão Técnica: página nova reaproveita `/backlog` (zero SQL/endpoint novo). Um builder puro (`buildBiBacklogPainel`) computa KPIs+gráficos a partir de `BacklogRow[]`. As 3 abas são o MESMO componente (`PainelBacklogTab`), filtrado por tipo via `getEquipeTipo` (já existe) quando aplicável. Novo módulo de permissão (`erp_bi_backlog`), rota e item de menu, mesmo padrão do BI-Gestão Técnica.

**Tech Stack:** React + TypeScript, TanStack Query (`useBacklog` já existente), Recharts (via `components/ui/bar-chart`), Vitest, FastAPI/pytest (só pro módulo de permissão).

**Spec:** `.planning/specs/2026-07-23-bi-backlog-design.md`

## Global Constraints

- Zero SQL/endpoint novo no backend além do registro do módulo de permissão — tudo reaproveita `/backlog`.
- Mapeamento de status: Pendentes=`'Pendente'`, Atendimento=`'Atendimento'`, Sem Execução=`'Concluída/Sem Execução'`, Executadas=`'Concluída'`. "Baixadas" NÃO vira KPI separado nesta entrega (sem campo equivalente).
- Painel Geral = todas as linhas do período, sem exclusão de REDE.
- Painel Instalação/Manutenção = filtradas via `getEquipeTipo(nomedaequipe, tiposervico)` (já existe em `src/lib/transform.ts`) — mesma função já usada em `biGestaoTecnicaPainel.ts`.
- Ocorrências: top 12 por volume, agrupado por `servico`, com drill-down (clique mostra as OS daquela ocorrência) — mesmo padrão já usado em `QualidadePage.tsx`.
- Por Equipe: top 10 por volume total, com breakdown por `descsituacao`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/builders/biBacklogPainel.ts` (create) | KPIs, visão diária, ocorrências, por equipe — puro |
| `src/lib/builders/biBacklogPainel.test.ts` (create) | Testes do builder acima |
| `cabonnet/db.py` (modify) | Novo módulo `erp_bi_backlog` em `ALL_MODULOS` |
| `cabonnet/app.py` (modify) | Label em `_MODULO_LABELS` |
| `tests/python/test_permissoes.py` (modify) | Teste do novo módulo |
| `src/lib/modulos.ts` (modify) | Mapeia `erp_bi_backlog` → `/erp/bi-backlog` |
| `src/lib/navigation.ts` (modify) | Novo link no grupo "Analisar" |
| `src/pages/index.ts` (modify) | Lazy import `ERPBiBacklogPage` |
| `src/App.tsx` (modify) | Nova rota `/erp/bi-backlog` |
| `src/features/erp/biBacklog/PainelBacklogTab.tsx` (create) | Conteúdo reutilizado nas 3 abas, filtra por `tipo` opcional |
| `src/features/erp/biBacklog/BiBacklogPage.tsx` (create) | Shell: período + `TabBar` com 3 abas |

---

## Task 1: `biBacklogPainel.ts` — builder de KPIs, visão diária, ocorrências, por equipe

**Files:**
- Create: `src/lib/builders/biBacklogPainel.ts`
- Create: `src/lib/builders/biBacklogPainel.test.ts`

**Interfaces:**
- Consumes: `parseDate` (de `../transform`, já existe); `topN` (de `./_helpers`, já existe); `BacklogRow` (de `../../hooks/useBacklog`)
- Produces: `BiBacklogMesPoint { dia: string; label: string; total: number; pendentes: number; atendimento: number; executadas: number }`; `BiBacklogOcorrencia { servico: string; count: number; os: BacklogRow[] }`; `BiBacklogEquipe { equipe: string; total: number; pendente: number; atendimento: number; executada: number; semExecucao: number }`; `BiBacklogPainel { qtdeEquipes: number; totalPendentes: number; totalAtendimento: number; totalSemExecucao: number; totalExecutadas: number; totalGeral: number; visaoDiaria: BiBacklogMesPoint[]; ocorrencias: BiBacklogOcorrencia[]; porEquipe: BiBacklogEquipe[] }`; `buildBiBacklogPainel(rows: BacklogRow[]): BiBacklogPainel`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/lib/builders/biBacklogPainel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildBiBacklogPainel } from './biBacklogPainel'
import type { BacklogRow } from '../../hooks/useBacklog'

function makeRow(overrides: Partial<BacklogRow> = {}): BacklogRow {
  return {
    nomecliente: 'CLIENTE TESTE', numos: '9000001', codigocliente: 'C1', codigocontrato: '100',
    servico: 'ASSISTENCIA TECNICA', tiposervico: 'MANUTENCAO', nomedacidade: 'TAUBATE', bairro: 'CENTRO',
    periodo: '2026-07', descsituacao: 'Pendente', nomedaequipe: 'F01', equipeexecutou: 'F01',
    datacadastro: '01/07/2026', dataagendamento: '02/07/2026', dataexecucao: '02/07/2026',
    horas_resolucao: 24, revisita_inst: 0, revisita_manut: 0, revisita_serv: 0,
    tempo_maior_24h: 0, tempo_maior_4h: 0, tempo_maior_3h: 0,
    ...overrides,
  }
}

describe('buildBiBacklogPainel', () => {
  it('conta KPIs por status corretamente', () => {
    const rows = [
      makeRow({ numos: '1', descsituacao: 'Pendente' }),
      makeRow({ numos: '2', descsituacao: 'Atendimento' }),
      makeRow({ numos: '3', descsituacao: 'Concluída' }),
      makeRow({ numos: '4', descsituacao: 'Concluída/Sem Execução' }),
      makeRow({ numos: '5', descsituacao: 'Concluída' }),
    ]
    const painel = buildBiBacklogPainel(rows)
    expect(painel.totalPendentes).toBe(1)
    expect(painel.totalAtendimento).toBe(1)
    expect(painel.totalExecutadas).toBe(2)
    expect(painel.totalSemExecucao).toBe(1)
    expect(painel.totalGeral).toBe(5)
  })

  it('conta equipes distintas', () => {
    const rows = [
      makeRow({ numos: '1', nomedaequipe: 'F01' }),
      makeRow({ numos: '2', nomedaequipe: 'F04' }),
      makeRow({ numos: '3', nomedaequipe: 'F01' }),
    ]
    expect(buildBiBacklogPainel(rows).qtdeEquipes).toBe(2)
  })

  it('bucketiza visão diária por datacadastro', () => {
    const rows = [
      makeRow({ numos: '1', datacadastro: '05/07/2026', descsituacao: 'Pendente' }),
      makeRow({ numos: '2', datacadastro: '05/07/2026', descsituacao: 'Concluída' }),
      makeRow({ numos: '3', datacadastro: '06/07/2026', descsituacao: 'Atendimento' }),
    ]
    const { visaoDiaria } = buildBiBacklogPainel(rows)
    expect(visaoDiaria).toEqual([
      { dia: '2026-07-05', label: '05/07', total: 2, pendentes: 1, atendimento: 0, executadas: 1 },
      { dia: '2026-07-06', label: '06/07', total: 1, pendentes: 0, atendimento: 1, executadas: 0 },
    ])
  })

  it('agrupa ocorrências por servico, top 12, preservando as linhas pro drill-down', () => {
    const rows = [
      makeRow({ numos: '1', servico: 'TROCA DE EQUIPAMENTO' }),
      makeRow({ numos: '2', servico: 'TROCA DE EQUIPAMENTO' }),
      makeRow({ numos: '3', servico: 'VISITA TECNICA' }),
    ]
    const { ocorrencias } = buildBiBacklogPainel(rows)
    expect(ocorrencias[0]).toEqual({ servico: 'TROCA DE EQUIPAMENTO', count: 2, os: expect.arrayContaining([rows[0], rows[1]]) })
    expect(ocorrencias[1].servico).toBe('VISITA TECNICA')
    expect(ocorrencias[1].count).toBe(1)
  })

  it('limita ocorrências a 12, ordenado por count desc', () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      makeRow({ numos: `${i}`, servico: `SERVICO ${i}`, tiposervico: 'MANUTENCAO' })
    )
    // Duplica o serviço 0 mais 5 vezes pra garantir que ele fica em primeiro
    for (let i = 0; i < 5; i++) rows.push(makeRow({ numos: `dup${i}`, servico: 'SERVICO 0' }))
    const { ocorrencias } = buildBiBacklogPainel(rows)
    expect(ocorrencias).toHaveLength(12)
    expect(ocorrencias[0].servico).toBe('SERVICO 0')
    expect(ocorrencias[0].count).toBe(6)
  })

  it('agrupa por equipe com breakdown de situação, top 10 por volume', () => {
    const rows = [
      makeRow({ numos: '1', nomedaequipe: 'F01', descsituacao: 'Pendente' }),
      makeRow({ numos: '2', nomedaequipe: 'F01', descsituacao: 'Concluída' }),
      makeRow({ numos: '3', nomedaequipe: 'F04', descsituacao: 'Atendimento' }),
    ]
    const { porEquipe } = buildBiBacklogPainel(rows)
    expect(porEquipe).toEqual(expect.arrayContaining([
      { equipe: 'F01', total: 2, pendente: 1, atendimento: 0, executada: 1, semExecucao: 0 },
      { equipe: 'F04', total: 1, pendente: 0, atendimento: 1, executada: 0, semExecucao: 0 },
    ]))
    expect(porEquipe[0].equipe).toBe('F01')  // maior total primeiro
  })

  it('limita por equipe a 10 times', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      makeRow({ numos: `${i}`, nomedaequipe: `F${String(i).padStart(2, '0')}` })
    )
    expect(buildBiBacklogPainel(rows).porEquipe).toHaveLength(10)
  })

  it('retorna zeros e arrays vazios quando não há linhas', () => {
    const painel = buildBiBacklogPainel([])
    expect(painel.totalGeral).toBe(0)
    expect(painel.qtdeEquipes).toBe(0)
    expect(painel.visaoDiaria).toEqual([])
    expect(painel.ocorrencias).toEqual([])
    expect(painel.porEquipe).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx vitest run src/lib/builders/biBacklogPainel.test.ts
```

Esperado: FAIL — `Cannot find module './biBacklogPainel'`.

- [ ] **Step 3: Criar `src/lib/builders/biBacklogPainel.ts`**

```ts
import { parseDate } from '../transform'
import { topN } from './_helpers'
import type { BacklogRow } from '../../hooks/useBacklog'

export interface BiBacklogMesPoint {
  dia:         string
  label:       string
  total:       number
  pendentes:   number
  atendimento: number
  executadas:  number
}

export interface BiBacklogOcorrencia {
  servico: string
  count:   number
  os:      BacklogRow[]
}

export interface BiBacklogEquipe {
  equipe:      string
  total:       number
  pendente:    number
  atendimento: number
  executada:   number
  semExecucao: number
}

export interface BiBacklogPainel {
  qtdeEquipes:      number
  totalPendentes:   number
  totalAtendimento: number
  totalSemExecucao: number
  totalExecutadas:  number
  totalGeral:       number
  visaoDiaria:      BiBacklogMesPoint[]
  ocorrencias:      BiBacklogOcorrencia[]
  porEquipe:        BiBacklogEquipe[]
}

export function buildBiBacklogPainel(rows: BacklogRow[]): BiBacklogPainel {
  const totalPendentes   = rows.filter(r => r.descsituacao === 'Pendente').length
  const totalAtendimento = rows.filter(r => r.descsituacao === 'Atendimento').length
  const totalSemExecucao = rows.filter(r => r.descsituacao === 'Concluída/Sem Execução').length
  const totalExecutadas  = rows.filter(r => r.descsituacao === 'Concluída').length
  const totalGeral       = rows.length
  const qtdeEquipes      = new Set(rows.map(r => r.nomedaequipe).filter(Boolean)).size

  const diaMap = new Map<string, { total: number; pendentes: number; atendimento: number; executadas: number }>()
  for (const r of rows) {
    const dt = parseDate(r.datacadastro)
    if (!dt) continue
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    if (!diaMap.has(key)) diaMap.set(key, { total: 0, pendentes: 0, atendimento: 0, executadas: 0 })
    const bucket = diaMap.get(key)!
    bucket.total++
    if (r.descsituacao === 'Pendente')    bucket.pendentes++
    if (r.descsituacao === 'Atendimento') bucket.atendimento++
    if (r.descsituacao === 'Concluída')   bucket.executadas++
  }
  const visaoDiaria = [...diaMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [, m, d] = key.split('-')
      return { dia: key, label: `${d}/${m}`, ...v }
    })

  const ocMap = new Map<string, BacklogRow[]>()
  for (const r of rows) {
    const key = (r.servico || 'Sem descrição').trim()
    if (!ocMap.has(key)) ocMap.set(key, [])
    ocMap.get(key)!.push(r)
  }
  const ocorrencias = [...ocMap.entries()]
    .map(([servico, os]) => ({ servico, count: os.length, os }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  const eqTotalMap = new Map<string, number>()
  for (const r of rows) {
    const eq = (r.nomedaequipe || 'Sem equipe').trim()
    eqTotalMap.set(eq, (eqTotalMap.get(eq) ?? 0) + 1)
  }
  const topEquipes = new Set(topN(eqTotalMap, 10).map(([eq]) => eq))
  const eqBreakdown = new Map<string, BiBacklogEquipe>()
  for (const r of rows) {
    const eq = (r.nomedaequipe || 'Sem equipe').trim()
    if (!topEquipes.has(eq)) continue
    if (!eqBreakdown.has(eq)) {
      eqBreakdown.set(eq, { equipe: eq, total: 0, pendente: 0, atendimento: 0, executada: 0, semExecucao: 0 })
    }
    const b = eqBreakdown.get(eq)!
    b.total++
    if (r.descsituacao === 'Pendente')               b.pendente++
    if (r.descsituacao === 'Atendimento')            b.atendimento++
    if (r.descsituacao === 'Concluída')              b.executada++
    if (r.descsituacao === 'Concluída/Sem Execução') b.semExecucao++
  }
  const porEquipe = [...eqBreakdown.values()].sort((a, b) => b.total - a.total)

  return {
    qtdeEquipes, totalPendentes, totalAtendimento, totalSemExecucao, totalExecutadas, totalGeral,
    visaoDiaria, ocorrencias, porEquipe,
  }
}
```

- [ ] **Step 4: Rodar os testes**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx vitest run src/lib/builders/biBacklogPainel.test.ts
```

Esperado: 8 PASSED.

- [ ] **Step 5: Build + suíte completa**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx tsc --noEmit && npm test
```

Esperado: type-check limpo, todos os testes passando.

- [ ] **Step 6: Commit**

```bash
git add src/lib/builders/biBacklogPainel.ts src/lib/builders/biBacklogPainel.test.ts
git commit -m "feat: builder biBacklogPainel calcula KPIs, visão diária, ocorrências e por equipe"
```

---

## Task 2: Backend — registrar o módulo de permissão `erp_bi_backlog`

**Files:**
- Modify: `cabonnet/db.py:22-27`
- Modify: `cabonnet/app.py:534-551`
- Modify: `tests/python/test_permissoes.py`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final de `tests/python/test_permissoes.py`:

```python
def test_erp_bi_backlog_modulo_registrado(client, gestor):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.get("/api/permissoes", headers=gestor)
    assert r.status_code == 200
    modulos = {m["key"]: m["label"] for m in r.json()["modulos"]}
    assert modulos.get("erp_bi_backlog") == "BI-Backlog"
    assert "erp_bi_backlog" in db.ALL_MODULOS
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && python -m pytest tests/python/test_permissoes.py::test_erp_bi_backlog_modulo_registrado -v
```

Esperado: FAIL — `modulos.get("erp_bi_backlog")` é `None`.

- [ ] **Step 3: Adicionar o módulo em `cabonnet/db.py`**

Leia o trecho atual antes de editar (linhas 22-27):

```python
ALL_MODULOS = [
    "dashboard", "ordens", "graficos", "cidades", "fornecedor", "juniper",
    "fechamento", "mapa", "noc",
    "erp_relatorios", "erp_alertas", "erp_qualidade",
    "erp_planner", "erp_fila", "erp_ranking", "erp_bi_tecnica",
]
```

Troque por:

```python
ALL_MODULOS = [
    "dashboard", "ordens", "graficos", "cidades", "fornecedor", "juniper",
    "fechamento", "mapa", "noc",
    "erp_relatorios", "erp_alertas", "erp_qualidade",
    "erp_planner", "erp_fila", "erp_ranking", "erp_bi_tecnica", "erp_bi_backlog",
]
```

- [ ] **Step 4: Adicionar o label em `cabonnet/app.py`**

Leia o trecho atual antes de editar (linhas 534-551). A última entrada é:

```python
    "erp_bi_tecnica":     "BI-Gestão Técnica",
}
```

Troque por:

```python
    "erp_bi_tecnica":     "BI-Gestão Técnica",
    "erp_bi_backlog":     "BI-Backlog",
}
```

- [ ] **Step 5: Rodar o teste**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && python -m pytest tests/python/test_permissoes.py -v
```

Esperado: todos PASSED, incluindo o novo teste.

- [ ] **Step 6: Rodar a suíte completa de Python**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && python -m pytest -q
```

Esperado: todos os testes PASSED.

- [ ] **Step 7: Commit**

```bash
git add cabonnet/db.py cabonnet/app.py tests/python/test_permissoes.py
git commit -m "feat: registra o módulo de permissão erp_bi_backlog"
```

---

## Task 3: Frontend — roteamento e menu

**Files:**
- Modify: `src/lib/modulos.ts:5-22`
- Modify: `src/lib/navigation.ts:1-52`
- Modify: `src/pages/index.ts`
- Modify: `src/App.tsx`

Sem teste dedicado novo — `src/lib/navigation.test.ts` já cobre `visibleNavGroups` de forma dinâmica. A página em si (`BiBacklogPage.tsx`) só é criada no Task 5 — até lá, o build fica quebrado por causa do import em `pages/index.ts`. Isso é esperado, mesmo padrão da entrega anterior.

- [ ] **Step 1: Adicionar o mapeamento em `src/lib/modulos.ts`**

Troque:

```ts
  erp_ranking:       '/erp/ranking',
  erp_bi_tecnica:    '/erp/bi-gestao-tecnica',
}
```

por:

```ts
  erp_ranking:       '/erp/ranking',
  erp_bi_tecnica:    '/erp/bi-gestao-tecnica',
  erp_bi_backlog:    '/erp/bi-backlog',
}
```

- [ ] **Step 2: Adicionar o link em `src/lib/navigation.ts`**

Troque o import de ícones:

```ts
import {
  LayoutDashboard, ClipboardList,
  BarChart2, PieChart, MapPin,
  Zap, Monitor, FileText, Map,
  Bell, Award, CalendarDays, Shield, Siren, Medal, Users, Wrench,
} from 'lucide-react'
```

por:

```ts
import {
  LayoutDashboard, ClipboardList,
  BarChart2, PieChart, MapPin,
  Zap, Monitor, FileText, Map,
  Bell, Award, CalendarDays, Shield, Siren, Medal, Users, Wrench, Layers,
} from 'lucide-react'
```

No grupo `analisar`, adicione o link logo após "BI Técnico":

```ts
      { to: '/erp/bi-gestao-tecnica', label: 'BI Técnico', icon: Wrench   },
      { to: '/erp/bi-backlog',        label: 'BI-Backlog', icon: Layers   },
```

- [ ] **Step 3: Adicionar o lazy import em `src/pages/index.ts`**

Troque:

```ts
export const ERPBiGestaoTecnicaPage = lazy(() => import('../features/erp/biGestaoTecnica/BiGestaoTecnicaPage'))
```

por:

```ts
export const ERPBiGestaoTecnicaPage = lazy(() => import('../features/erp/biGestaoTecnica/BiGestaoTecnicaPage'))
export const ERPBiBacklogPage       = lazy(() => import('../features/erp/biBacklog/BiBacklogPage'))
```

- [ ] **Step 4: Adicionar a rota em `src/App.tsx`**

Troque o import:

```tsx
import {
  ERPRelatoriosPage,
  ERPAlertasPage,
  ERPQualidadePage, ERPPlannerPage, ERPFilaPage, ERPRankingTecnicosPage, ERPBiGestaoTecnicaPage,
  DashboardPage, OrdensPage,
  GraficosPage, CidadesGerencialPage,
  FornecedorPage, JuniperPage, NotFoundPage, NocPage, FechamentoPage,
  MapaPage, UsuariosPage,
} from './pages/index'
```

por:

```tsx
import {
  ERPRelatoriosPage,
  ERPAlertasPage,
  ERPQualidadePage, ERPPlannerPage, ERPFilaPage, ERPRankingTecnicosPage, ERPBiGestaoTecnicaPage, ERPBiBacklogPage,
  DashboardPage, OrdensPage,
  GraficosPage, CidadesGerencialPage,
  FornecedorPage, JuniperPage, NotFoundPage, NocPage, FechamentoPage,
  MapaPage, UsuariosPage,
} from './pages/index'
```

Adicione a rota logo após `bi-gestao-tecnica`:

```tsx
          <Route path="bi-gestao-tecnica" element={<RequireModulo modulo="erp_bi_tecnica"><ERPBiGestaoTecnicaPage /></RequireModulo>} />
          <Route path="bi-backlog"        element={<RequireModulo modulo="erp_bi_backlog"><ERPBiBacklogPage /></RequireModulo>} />
```

- [ ] **Step 5: Não rode build ainda**

O build vai falhar até o Task 5 criar `BiBacklogPage.tsx` — esperado, não é bug. Prossiga direto pros Tasks 4-5.

- [ ] **Step 6: Commit**

```bash
git add src/lib/modulos.ts src/lib/navigation.ts src/pages/index.ts src/App.tsx
git commit -m "feat: adiciona rota e menu para BI-Backlog (página vem nos próximos commits)"
```

---

## Task 4: `PainelBacklogTab.tsx` — conteúdo reutilizado nas 3 abas

**Files:**
- Create: `src/features/erp/biBacklog/PainelBacklogTab.tsx`

Sem teste dedicado — componente de apresentação sobre `buildBiBacklogPainel` (já testado no Task 1).

**Interfaces:**
- Consumes: `getEquipeTipo` (de `../../../lib/transform`, já existe); `buildBiBacklogPainel`, `BiBacklogOcorrencia` (Task 1); `BacklogRow` (de `../../../hooks/useBacklog`); `StatCard`, `SectionLabel` (de `../../../components/ui/`); `BarChart`/`Bar`/`XAxis`/`YAxis`/`Grid`/`ChartTooltip`/`Legend` (de `../../../components/ui/bar-chart`)
- Produces: `PainelBacklogTab({ rows, tipo }: { rows: BacklogRow[]; tipo?: 'instalacao' | 'manutencao' }): JSX.Element`

- [ ] **Step 1: Criar o diretório e o arquivo `src/features/erp/biBacklog/PainelBacklogTab.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { Layers, Activity, BarChart3, Users, Search } from 'lucide-react'
import { getEquipeTipo } from '../../../lib/transform'
import { buildBiBacklogPainel, type BiBacklogOcorrencia } from '../../../lib/builders/biBacklogPainel'
import type { BacklogRow } from '../../../hooks/useBacklog'
import { StatCard } from '../../../components/ui/StatCard'
import { SectionLabel } from '../../../components/ui/SectionLabel'
import { BarChart, Bar, XAxis, YAxis, Grid, ChartTooltip, Legend } from '../../../components/ui/bar-chart'

function fmt(n: number): string { return n.toLocaleString('pt-BR') }

interface PainelBacklogTabProps {
  rows: BacklogRow[]
  tipo?: 'instalacao' | 'manutencao'
}

export function PainelBacklogTab({ rows, tipo }: PainelBacklogTabProps) {
  const rowsFiltradas = useMemo(() => {
    if (!tipo) return rows
    const alvo = tipo === 'instalacao' ? 'INSTALACAO' : 'MANUTENCAO'
    return rows.filter(r => getEquipeTipo(r.nomedaequipe, r.tiposervico) === alvo)
  }, [rows, tipo])

  const painel = useMemo(() => buildBiBacklogPainel(rowsFiltradas), [rowsFiltradas])
  const [ocSelecionada, setOcSelecionada] = useState<BiBacklogOcorrencia | null>(null)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Qtde Equipes"       value={fmt(painel.qtdeEquipes)} />
        <StatCard title="Total Pendentes"    value={fmt(painel.totalPendentes)} />
        <StatCard title="Total Atendimento"  value={fmt(painel.totalAtendimento)} />
        <StatCard title="Total Sem Execução" value={fmt(painel.totalSemExecucao)} tone="warning" />
        <StatCard title="Total Executadas"   value={fmt(painel.totalExecutadas)} tone="ok" />
        <StatCard title="Total Geral"        value={fmt(painel.totalGeral)} icon={Layers} />
      </div>

      {painel.visaoDiaria.length > 0 && (
        <section className="space-y-2">
          <SectionLabel icon={Activity} color="#a78bfa">Visão Diária</SectionLabel>
          <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
            <div style={{ height: 260 }}>
              <BarChart data={painel.visaoDiaria}>
                <Grid />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <ChartTooltip />
                <Legend />
                <Bar dataKey="pendentes"   name="Pendentes"   fill="#facc15" />
                <Bar dataKey="atendimento" name="Atendimento" fill="#3b82f6" />
                <Bar dataKey="executadas"  name="Executadas"  fill="#4ade80" />
              </BarChart>
            </div>
          </div>
        </section>
      )}

      {painel.ocorrencias.length > 0 && (
        <section className="space-y-2">
          <SectionLabel icon={BarChart3} color="#f97316">Qtde por Ocorrências — clique para ver as OS</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
            <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
              <div style={{ height: Math.max(180, painel.ocorrencias.length * 34) }}>
                <BarChart
                  data={painel.ocorrencias.map(o => ({
                    servico: o.servico.length > 32 ? o.servico.slice(0, 32) + '…' : o.servico,
                    _full:   o.servico,
                    count:   o.count,
                  }))}
                  layout="vertical"
                >
                  <Grid horizontal={false} vertical />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="servico" width={200} tick={{ fontSize: 10 }} />
                  <ChartTooltip suffix=" OS" />
                  <Bar
                    dataKey="count"
                    name="OS"
                    fill="#f97316"
                    radius={3}
                    onClick={(row: any) => {
                      const found = painel.ocorrencias.find(o => o.servico === row._full)
                      setOcSelecionada(found ?? null)
                    }}
                  />
                </BarChart>
              </div>
              <p className="text-caption text-muted mt-2 text-center">Clique numa barra para ver as OS</p>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
              {ocSelecionada ? (
                <>
                  <div className="px-4 py-3 border-b border-white/[0.05] flex items-start justify-between gap-2">
                    <div>
                      <p className="text-caption font-bold text-text leading-tight">{ocSelecionada.servico}</p>
                      <p className="text-caption text-muted mt-0.5">{ocSelecionada.count} OS</p>
                    </div>
                    <button onClick={() => setOcSelecionada(null)}
                            className="text-caption text-muted hover:text-text transition-colors flex-shrink-0">✕</button>
                  </div>
                  <div className="overflow-y-auto max-h-[340px] divide-y divide-white/[0.04]">
                    {ocSelecionada.os.map(r => (
                      <div key={r.numos} className="px-4 py-2.5 hover:bg-surface/20 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-label text-primary flex-shrink-0">{r.numos}</span>
                          <span className="text-caption text-muted flex-shrink-0">{r.datacadastro}</span>
                        </div>
                        <p className="text-[11.5px] text-text truncate mt-0.5">{r.nomecliente}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-caption text-muted">{r.nomedacidade}</span>
                          <span className="text-caption text-muted/50">·</span>
                          <span className="text-caption text-muted truncate">{r.nomedaequipe || '—'}</span>
                          <span className="text-caption text-muted/50 ml-auto flex-shrink-0">·</span>
                          <span className="text-caption text-muted flex-shrink-0">{r.descsituacao}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted">
                  <Search size={24} className="opacity-30" />
                  <p className="text-label">Selecione uma ocorrência no gráfico</p>
                  <p className="text-caption opacity-60">para ver as OS associadas</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {painel.porEquipe.length > 0 && (
        <section className="space-y-2">
          <SectionLabel icon={Users} color="#22d3ee">Total OS por Equipe</SectionLabel>
          <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
            <div style={{ height: Math.max(200, painel.porEquipe.length * 34) }}>
              <BarChart data={painel.porEquipe} layout="vertical">
                <Grid horizontal={false} vertical />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="equipe" width={140} tick={{ fontSize: 10 }} />
                <ChartTooltip />
                <Legend />
                <Bar dataKey="pendente"    name="Pendente"     fill="#facc15" />
                <Bar dataKey="atendimento" name="Atendimento"  fill="#3b82f6" />
                <Bar dataKey="executada"   name="Executada"    fill="#4ade80" />
                <Bar dataKey="semExecucao" name="Sem Execução" fill="#f87171" />
              </BarChart>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx tsc --noEmit 2>&1 | grep -i "PainelBacklogTab"
```

Esperado: sem output — pode haver erro em `pages/index.ts` (import de `BiBacklogPage`, que ainda não existe até o Task 5) — ignore por enquanto.

- [ ] **Step 3: Commit**

```bash
git add src/features/erp/biBacklog/PainelBacklogTab.tsx
git commit -m "feat: componente PainelBacklogTab reutilizado nas 3 abas do BI-Backlog"
```

---

## Task 5: `BiBacklogPage.tsx` — shell da página

**Files:**
- Create: `src/features/erp/biBacklog/BiBacklogPage.tsx`

**Interfaces:**
- Consumes: `useBacklog` (de `../../../hooks/useBacklog`); `TabBar`, `PageHeader` (de `../../../components/ui/`); `PainelBacklogTab` (Task 4)

- [ ] **Step 1: Criar `src/features/erp/biBacklog/BiBacklogPage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { RefreshCw, AlertTriangle, LayoutDashboard, Home, Wrench } from 'lucide-react'
import { useBacklog } from '../../../hooks/useBacklog'
import { TabBar } from '../../../components/ui/TabBar'
import { PageHeader } from '../../../components/ui/PageHeader'
import { PainelBacklogTab } from './PainelBacklogTab'

function isoDate(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mesAtualRange():    [string, string] {
  const h = new Date()
  return [isoDate(new Date(h.getFullYear(), h.getMonth(), 1)),
          isoDate(new Date(h.getFullYear(), h.getMonth() + 1, 1))]
}
function mesAnteriorRange(): [string, string] {
  const h = new Date()
  return [isoDate(new Date(h.getFullYear(), h.getMonth() - 1, 1)),
          isoDate(new Date(h.getFullYear(), h.getMonth(), 1))]
}

type Preset = 'atual' | 'anterior' | 'custom'

const TABS = [
  { id: 'geral',      label: 'Painel Geral',      icon: LayoutDashboard },
  { id: 'instalacao', label: 'Painel Instalação', icon: Home            },
  { id: 'manutencao', label: 'Painel Manutenção', icon: Wrench          },
]

export default function BiBacklogPage() {
  const [tab,       setTab]       = useState('geral')
  const [preset,    setPreset]    = useState<Preset>('atual')
  const [customIni, setCustomIni] = useState(() => mesAnteriorRange()[0])
  const [customFim, setCustomFim] = useState(() => isoDate(new Date()))

  const [inicio, fim] = useMemo<[string, string]>(() => {
    if (preset === 'atual')    return mesAtualRange()
    if (preset === 'anterior') return mesAnteriorRange()
    const [ini, fimEscolhido] = customIni <= customFim ? [customIni, customFim] : [customFim, customIni]
    const amanha = isoDate(new Date(new Date(fimEscolhido).getTime() + 86_400_000))
    return [ini, amanha]
  }, [preset, customIni, customFim])

  const { data, isLoading, isError, refetch, isFetching } = useBacklog(inicio, fim)

  return (
    <div className="space-y-4 max-w-[1600px]">
      <PageHeader
        title="BI-Backlog"
        description="Backlog geral, instalação e manutenção — portado do i-Manager"
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-white/[0.08] bg-surface/40 overflow-hidden text-label">
          {(['atual', 'anterior', 'custom'] as Preset[]).map((v, i) => (
            <button key={v} onClick={() => setPreset(v)}
                    className={`px-3 py-1.5 transition-colors ${
                      preset === v ? 'bg-primary/20 text-primary font-semibold' : 'text-muted hover:text-text'
                    }`}>
              {['Mês Atual', 'Mês Anterior', 'Personalizado'][i]}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={customIni} onChange={e => setCustomIni(e.target.value)}
                   className="px-2 py-1.5 rounded-lg border border-white/[0.08] bg-surface/40
                              text-label text-text focus:outline-none" />
            <span className="text-caption text-muted">até</span>
            <input type="date" value={customFim} onChange={e => setCustomFim(e.target.value)}
                   className="px-2 py-1.5 rounded-lg border border-white/[0.08] bg-surface/40
                              text-label text-text focus:outline-none" />
          </div>
        )}
        <button onClick={() => refetch()} disabled={isFetching}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08]
                           bg-surface/40 text-label text-muted hover:text-text transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {isLoading && !data && (
        <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Carregando…
        </div>
      )}

      {isError && !data && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-8 text-center">
          <AlertTriangle size={20} className="text-red-400 mx-auto mb-2" />
          <p className="text-body text-red-400">Erro ao carregar dados.</p>
          <button onClick={() => refetch()} className="mt-3 text-caption text-muted underline">Tentar novamente</button>
        </div>
      )}

      {data && (
        <div className={`transition-opacity duration-200 ${isFetching ? 'opacity-60' : ''}`}>
          {tab === 'geral'      && <PainelBacklogTab rows={data.rows} />}
          {tab === 'instalacao' && <PainelBacklogTab rows={data.rows} tipo="instalacao" />}
          {tab === 'manutencao' && <PainelBacklogTab rows={data.rows} tipo="manutencao" />}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Adicionar `#f97316` à baseline do audit:ds**

Leia `scripts/audit-ds-baseline.json` antes de editar. `#f97316` (usado no ícone/barras de Ocorrências de `PainelBacklogTab.tsx`) não está em `globalHex` — precisa de uma entrada por arquivo, mesmo problema que já quebrou o CI numa entrega anterior. A entrega anterior (BI-Gestão Técnica) já adicionou `"src/features/erp/biGestaoTecnica/PainelTab.tsx"` e `"src/features/erp/biGestaoTecnica/RevisitaTab.tsx"` à lista, logo depois de `"src/features/erp/alertas/AlertasPage.tsx"` e antes de `"src/features/erp/fila/FilaPage.tsx"`. Adicione a entrada nova **nesse mesmo bloco**, em ordem alfabética (`biBacklog` vem antes de `biGestaoTecnica`):

```json
    "src/features/erp/alertas/AlertasPage.tsx": [
      "#f97316"
    ],
    "src/features/erp/biBacklog/PainelBacklogTab.tsx": [
      "#f97316"
    ],
    "src/features/erp/biGestaoTecnica/PainelTab.tsx": [
      "#f97316"
    ],
    "src/features/erp/biGestaoTecnica/RevisitaTab.tsx": [
      "#f97316"
    ],
    "src/features/erp/fila/FilaPage.tsx": [
```

(O trecho acima mostra o contexto ao redor — só a entrada `biBacklog/PainelBacklogTab.tsx` é nova; as outras três já existem no arquivo.)

- [ ] **Step 3: Build + suíte completa + audit**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx tsc --noEmit && npm test && npm run build && npm run audit:ds
```

Esperado: tudo limpo. Agora que `BiBacklogPage.tsx` existe, o import em `pages/index.ts` (Task 3) resolve e o build passa.

- [ ] **Step 4: Commit**

```bash
git add src/features/erp/biBacklog/BiBacklogPage.tsx scripts/audit-ds-baseline.json
git commit -m "feat: BiBacklogPage — shell com controle de período e 3 abas"
```

---

## Task 6: Verificação final end-to-end

**Files:** nenhum (apenas verificação)

- [ ] **Step 1: Rodar toda a suíte de testes**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && python -m pytest -q && npx vitest run
```

Esperado: todos os testes Python e JS/TS passando.

- [ ] **Step 2: Build de produção + audit**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npm run build && npm run audit:ds
```

Esperado: build sem erros, `audit:ds OK`.

- [ ] **Step 3: Smoke test manual (se houver ferramenta de navegador disponível)**

Abra `/erp/bi-backlog`. Confirme que "BI-Backlog" aparece no menu, que as 3 abas (Painel Geral/Instalação/Manutenção) mostram números diferentes, que clicar numa barra de "Qtde por Ocorrências" abre a lista de OS daquela ocorrência, e que trocar o período muda os números. Se não houver ferramenta de navegador disponível, registre isso explicitamente em vez de pular a verificação silenciosamente — e nesse caso, dê atenção extra à suposição não verificada da spec (conteúdo de Painel Instalação/Manutenção) na próxima oportunidade de checar visualmente.

- [ ] **Step 4: Revisar o diff completo**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && git log --oneline -6
```

Esperado: 5 commits deste plano (Tasks 1-5).
