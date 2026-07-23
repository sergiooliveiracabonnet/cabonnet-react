# Menu "BI-Gestão Técnica" (Painel + Revisitas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar o painel "BI-Gestão Técnica" do i-Manager (Painel + Revisita Instalação/Serviço/Manutenção) para o Cabonnet React, como um novo item de menu, sem nenhum código novo de backend em Python.

**Architecture:** Uma nova página React (`BiGestaoTecnicaPage`) reaproveita o endpoint `/backlog` já existente (mesmo usado por `QualidadePage`) como única fonte de dados para as 4 abas. Dois builders puros novos (`revisitaPorTipo.ts`, `biGestaoTecnicaPainel.ts`) computam os KPIs a partir das linhas retornadas. `QualidadePage.tsx` é refatorada para consumir o mesmo `revisitaPorTipo.ts`, eliminando lógica duplicada. Backend ganha só um novo módulo de permissão (`erp_bi_tecnica`) — nenhuma rota nova, nenhuma query SQL nova.

**Tech Stack:** React + TypeScript, TanStack Query (`useBacklog` já existente), Recharts (via `components/ui/bar-chart`), Vitest, FastAPI/pytest (só para o módulo de permissão).

**Spec:** `.planning/specs/2026-07-23-bi-gestao-tecnica-design.md`

## Global Constraints

- Sem código novo em `cabonnet_server.py`/`cabonnet/app.py` além do registro do módulo de permissão — todo o resto é reaproveitamento do `/backlog` já em produção.
- Materiais (Utilizado/Retirado/Rede) está fora de escopo (bloqueado por permissão no banco) — não implementar nada relacionado.
- VT3H/VT24H/VT4H e "Retirada de Equipamento" no Painel ficam fora de escopo (fase 2, sem definição).
- As 5 cidades do Vale do Paraíba já são garantidas pelo `/backlog` (mesma fonte de dado do resto do app) — nenhum filtro de cidade adicional é necessário no frontend.
- `Cumprimento de Agenda` usa a fórmula proposta na spec (`dataexecucao <= dataagendamento`, comparando só o dia) — se os números não baterem com o iManager depois de implementado, ajustar a fórmula é aceitável, não é bloqueio.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/builders/revisitaPorTipo.ts` (create) | Funções puras de revisita por tipo — extraídas do `QualidadePage.tsx` para reuso |
| `src/lib/builders/revisitaPorTipo.test.ts` (create) | Testes das funções acima |
| `src/features/erp/qualidade/QualidadePage.tsx` (modify) | Passa a consumir `revisitaPorTipo.ts` em vez de lógica inline duplicada |
| `src/lib/builders/biGestaoTecnicaPainel.ts` (create) | Builder do Painel: totais por tipo, série mensal, médias de execução, cumprimento de agenda, % revisita |
| `src/lib/builders/biGestaoTecnicaPainel.test.ts` (create) | Testes do builder acima |
| `cabonnet/db.py` (modify) | Adiciona `"erp_bi_tecnica"` a `ALL_MODULOS` |
| `cabonnet/app.py` (modify) | Adiciona label em `_MODULO_LABELS` |
| `tests/python/test_permissoes.py` (modify) | Teste do novo módulo de permissão |
| `src/lib/modulos.ts` (modify) | Mapeia `erp_bi_tecnica` → `/erp/bi-gestao-tecnica` |
| `src/lib/navigation.ts` (modify) | Novo link no grupo "Analisar" |
| `src/pages/index.ts` (modify) | Novo lazy import `ERPBiGestaoTecnicaPage` |
| `src/App.tsx` (modify) | Nova rota `/erp/bi-gestao-tecnica` |
| `src/features/erp/biGestaoTecnica/RevisitaTab.tsx` (create) | Conteúdo reutilizável das 3 abas de Revisita (parametrizado por tipo) |
| `src/features/erp/biGestaoTecnica/PainelTab.tsx` (create) | Conteúdo da aba Painel |
| `src/features/erp/biGestaoTecnica/BiGestaoTecnicaPage.tsx` (create) | Shell da página: controle de período + `TabBar` com as 4 abas |

---

## Task 1: `revisitaPorTipo.ts` — funções puras de revisita por tipo

**Files:**
- Create: `src/lib/builders/revisitaPorTipo.ts`
- Create: `src/lib/builders/revisitaPorTipo.test.ts`

**Interfaces:**
- Produces: `RevisitaTipo = 'instalacao' | 'manutencao' | 'servico'`; `isRevisitaAtiva(r: BacklogRow): boolean`; `filtrarRevisitasAtivas(rows: BacklogRow[]): BacklogRow[]`; `filtrarRevisitaPorTipo(rows: BacklogRow[], tipo: RevisitaTipo): BacklogRow[]`; `contarRevisitasPorTipo(rows: BacklogRow[]): Record<RevisitaTipo, number>`; `RevisitaCidadeRow { cidade: string; rev: number; total: number; taxa: number }`; `revisitaPorCidade(allRows: BacklogRow[], tipo: RevisitaTipo): RevisitaCidadeRow[]`; `RevisitaClienteCronico { nome: string; count: number }`; `clientesCronicos(rowsFiltradas: BacklogRow[], minCount?: number): RevisitaClienteCronico[]`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/lib/builders/revisitaPorTipo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  isRevisitaAtiva, filtrarRevisitasAtivas, filtrarRevisitaPorTipo, contarRevisitasPorTipo,
  revisitaPorCidade, clientesCronicos,
} from './revisitaPorTipo'
import type { BacklogRow } from '../../hooks/useBacklog'

function makeRow(overrides: Partial<BacklogRow> = {}): BacklogRow {
  return {
    nomecliente: 'CLIENTE TESTE', numos: '9000001', codigocliente: 'C1', codigocontrato: '100',
    servico: 'ASSISTENCIA TECNICA', tiposervico: 'MANUTENCAO', nomedacidade: 'TAUBATE', bairro: 'CENTRO',
    periodo: '2026-07', descsituacao: 'Concluída', nomedaequipe: 'F01', equipeexecutou: 'F01',
    datacadastro: '01/07/2026', dataagendamento: '02/07/2026', dataexecucao: '02/07/2026',
    horas_resolucao: 24, revisita_inst: 0, revisita_manut: 0, revisita_serv: 0,
    tempo_maior_24h: 0, tempo_maior_4h: 0, tempo_maior_3h: 0,
    ...overrides,
  }
}

describe('isRevisitaAtiva', () => {
  it('true quando qualquer flag está ativo', () => {
    expect(isRevisitaAtiva(makeRow({ revisita_manut: 1 }))).toBe(true)
  })
  it('false quando nenhum flag está ativo', () => {
    expect(isRevisitaAtiva(makeRow())).toBe(false)
  })
})

describe('filtrarRevisitasAtivas', () => {
  it('mantém só as linhas com algum flag ativo', () => {
    const rows = [makeRow({ numos: '1', revisita_inst: 1 }), makeRow({ numos: '2' })]
    expect(filtrarRevisitasAtivas(rows).map(r => r.numos)).toEqual(['1'])
  })
})

describe('filtrarRevisitaPorTipo', () => {
  it('filtra só o tipo pedido', () => {
    const rows = [
      makeRow({ numos: '1', revisita_inst: 1 }),
      makeRow({ numos: '2', revisita_manut: 1 }),
    ]
    expect(filtrarRevisitaPorTipo(rows, 'instalacao').map(r => r.numos)).toEqual(['1'])
    expect(filtrarRevisitaPorTipo(rows, 'manutencao').map(r => r.numos)).toEqual(['2'])
  })
})

describe('contarRevisitasPorTipo', () => {
  it('conta cada tipo independentemente', () => {
    const rows = [
      makeRow({ revisita_inst: 1 }),
      makeRow({ revisita_inst: 1 }),
      makeRow({ revisita_manut: 1 }),
      makeRow({ revisita_serv: 1 }),
    ]
    expect(contarRevisitasPorTipo(rows)).toEqual({ instalacao: 2, manutencao: 1, servico: 1 })
  })
})

describe('revisitaPorCidade', () => {
  it('calcula total e taxa por cidade pro tipo pedido', () => {
    const rows = [
      makeRow({ nomedacidade: 'TAUBATE', revisita_manut: 1 }),
      makeRow({ nomedacidade: 'TAUBATE' }),
      makeRow({ nomedacidade: 'CACAPAVA', revisita_manut: 1 }),
    ]
    const result = revisitaPorCidade(rows, 'manutencao')
    expect(result).toEqual(expect.arrayContaining([
      { cidade: 'TAUBATE',  rev: 1, total: 2, taxa: 50 },
      { cidade: 'CACAPAVA', rev: 1, total: 1, taxa: 100 },
    ]))
  })

  it('usa "Sem cidade" quando nomedacidade está vazio', () => {
    const result = revisitaPorCidade([makeRow({ nomedacidade: '', revisita_serv: 1 })], 'servico')
    expect(result[0].cidade).toBe('Sem cidade')
  })
})

describe('clientesCronicos', () => {
  it('só inclui clientes com 2 ou mais ocorrências', () => {
    const rows = [
      makeRow({ codigocliente: 'C1', nomecliente: 'JOAO' }),
      makeRow({ codigocliente: 'C1', nomecliente: 'JOAO' }),
      makeRow({ codigocliente: 'C2', nomecliente: 'MARIA' }),
    ]
    expect(clientesCronicos(rows)).toEqual([{ nome: 'JOAO', count: 2 }])
  })

  it('ordena do maior pro menor count', () => {
    const rows = [
      makeRow({ codigocliente: 'C1', nomecliente: 'A' }),
      makeRow({ codigocliente: 'C1', nomecliente: 'A' }),
      makeRow({ codigocliente: 'C2', nomecliente: 'B' }),
      makeRow({ codigocliente: 'C2', nomecliente: 'B' }),
      makeRow({ codigocliente: 'C2', nomecliente: 'B' }),
    ]
    const result = clientesCronicos(rows)
    expect(result[0]).toEqual({ nome: 'B', count: 3 })
    expect(result[1]).toEqual({ nome: 'A', count: 2 })
  })
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx vitest run src/lib/builders/revisitaPorTipo.test.ts
```

Esperado: FAIL — `Cannot find module './revisitaPorTipo'` (arquivo ainda não existe).

- [ ] **Step 3: Criar `src/lib/builders/revisitaPorTipo.ts`**

```ts
import type { BacklogRow } from '../../hooks/useBacklog'

export type RevisitaTipo = 'instalacao' | 'manutencao' | 'servico'

const FLAG_KEY: Record<RevisitaTipo, 'revisita_inst' | 'revisita_manut' | 'revisita_serv'> = {
  instalacao: 'revisita_inst',
  manutencao: 'revisita_manut',
  servico:    'revisita_serv',
}

export function isRevisitaAtiva(r: BacklogRow): boolean {
  return Number(r.revisita_inst) === 1 || Number(r.revisita_manut) === 1 || Number(r.revisita_serv) === 1
}

export function filtrarRevisitasAtivas(rows: BacklogRow[]): BacklogRow[] {
  return rows.filter(isRevisitaAtiva)
}

export function filtrarRevisitaPorTipo(rows: BacklogRow[], tipo: RevisitaTipo): BacklogRow[] {
  const flag = FLAG_KEY[tipo]
  return rows.filter(r => Number(r[flag]) === 1)
}

export function contarRevisitasPorTipo(rows: BacklogRow[]): Record<RevisitaTipo, number> {
  return {
    instalacao: rows.filter(r => Number(r.revisita_inst)  === 1).length,
    manutencao: rows.filter(r => Number(r.revisita_manut) === 1).length,
    servico:    rows.filter(r => Number(r.revisita_serv)  === 1).length,
  }
}

export interface RevisitaCidadeRow { cidade: string; rev: number; total: number; taxa: number }

export function revisitaPorCidade(allRows: BacklogRow[], tipo: RevisitaTipo): RevisitaCidadeRow[] {
  const flag = FLAG_KEY[tipo]
  const m: Record<string, { rev: number; total: number }> = {}
  for (const r of allRows) {
    const c = r.nomedacidade || 'Sem cidade'
    if (!m[c]) m[c] = { rev: 0, total: 0 }
    m[c].total++
    if (Number(r[flag]) === 1) m[c].rev++
  }
  return Object.entries(m)
    .map(([cidade, v]) => ({ cidade, ...v, taxa: v.total ? Math.round((v.rev / v.total) * 100) : 0 }))
    .sort((a, b) => b.rev - a.rev)
}

export interface RevisitaClienteCronico { nome: string; count: number }

export function clientesCronicos(rowsFiltradas: BacklogRow[], minCount = 2): RevisitaClienteCronico[] {
  const cnt: Record<string, { nome: string; count: number }> = {}
  for (const r of rowsFiltradas) {
    const k = String(r.codigocliente || r.nomecliente)
    if (!cnt[k]) cnt[k] = { nome: r.nomecliente, count: 0 }
    cnt[k].count++
  }
  return Object.values(cnt)
    .filter(c => c.count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
}
```

- [ ] **Step 4: Rodar o teste de novo**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx vitest run src/lib/builders/revisitaPorTipo.test.ts
```

Esperado: 8 PASSED.

- [ ] **Step 5: Commit**

```bash
git add src/lib/builders/revisitaPorTipo.ts src/lib/builders/revisitaPorTipo.test.ts
git commit -m "feat: extrai funções puras de revisita por tipo em revisitaPorTipo.ts"
```

---

## Task 2: Refatorar `QualidadePage.tsx` para usar `revisitaPorTipo.ts`

**Files:**
- Modify: `src/features/erp/qualidade/QualidadePage.tsx:1-181`

**Interfaces:**
- Consumes: `isRevisitaAtiva`, `filtrarRevisitasAtivas`, `filtrarRevisitaPorTipo`, `contarRevisitasPorTipo`, `revisitaPorCidade`, `clientesCronicos` (Task 1)

Sem teste dedicado (não existe teste do `QualidadePage.tsx` hoje). A verificação é: os testes já existentes de `revisitaPorTipo.ts` (Task 1) garantem que a lógica extraída se comporta igual à original, e o Step 3 abaixo faz uma comparação visual antes/depois.

- [ ] **Step 1: Capturar os números atuais pra comparação (antes da mudança)**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npm run dev
```

Abra `http://localhost:3000/erp/qualidade`, anote os valores de "Revisitas" (StatCard), "Por Cidade" (top 3) e "Crônicos" (top 3) pra cada aba de tipo (Todos/Instalação/Manutenção/Serviço). Esses números não podem mudar depois do refactor.

- [ ] **Step 2: Editar o import no topo do arquivo**

Adicione logo após a linha `import { CausaRaizSection } from './CausaRaizSection'`:

```tsx
import {
  isRevisitaAtiva, filtrarRevisitasAtivas, filtrarRevisitaPorTipo, contarRevisitasPorTipo,
  revisitaPorCidade, clientesCronicos,
} from '../../../lib/builders/revisitaPorTipo'
```

- [ ] **Step 3: Substituir o bloco de lógica (linhas 123-181) pelo uso das funções extraídas**

Troque:

```tsx
  // ── Revisitas = qualquer flag de revisita ativo ───────────────────────
  const revisitas = useMemo(
    () => (data?.rows ?? []).filter(r =>
      Number(r.revisita_inst) === 1 ||
      Number(r.revisita_manut) === 1 ||
      Number(r.revisita_serv) === 1
    ),
    [data]
  )
  const totalOS   = data?.kpis.total ?? 0

  // Filtradas pelo tipo ativo — usa os flags do SQL
  const revisitasFiltradas = useMemo(() => {
    if (tipoAtivo === 'todos')       return revisitas
    if (tipoAtivo === 'instalacao')  return revisitas.filter(r => Number(r.revisita_inst)  === 1)
    if (tipoAtivo === 'manutencao')  return revisitas.filter(r => Number(r.revisita_manut) === 1)
    if (tipoAtivo === 'servico')     return revisitas.filter(r => Number(r.revisita_serv)  === 1)
    return revisitas
  }, [revisitas, tipoAtivo])

  // Contagens diretas pelos flags SQL
  const contagens = useMemo(() => ({
    instalacao: revisitas.filter(r => Number(r.revisita_inst)  === 1).length,
    manutencao: revisitas.filter(r => Number(r.revisita_manut) === 1).length,
    servico:    revisitas.filter(r => Number(r.revisita_serv)  === 1).length,
  }), [revisitas])

  // Clientes crônicos (3+ revisitas no período)
  const cronicos = useMemo(() => {
    const cnt: Record<string, { nome: string; count: number }> = {}
    for (const r of revisitasFiltradas) {
      const k = String(r.codigocliente || r.nomecliente)
      if (!cnt[k]) cnt[k] = { nome: r.nomecliente, count: 0 }
      cnt[k].count++
    }
    return Object.values(cnt)
      .filter(c => c.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
  }, [revisitasFiltradas])

  // Por cidade
  const porCidade = useMemo(() => {
    const m: Record<string, { rev: number; total: number }> = {}
    for (const r of (data?.rows ?? [])) {
      const c     = r.nomedacidade || 'Sem cidade'
      const isRev = tipoAtivo === 'todos'
        ? (Number(r.revisita_inst) + Number(r.revisita_manut) + Number(r.revisita_serv)) > 0
        : tipoAtivo === 'instalacao' ? Number(r.revisita_inst)  === 1
        : tipoAtivo === 'manutencao' ? Number(r.revisita_manut) === 1
        :                               Number(r.revisita_serv)  === 1
      if (!m[c]) m[c] = { rev: 0, total: 0 }
      m[c].total++
      if (isRev) m[c].rev++
    }
    return Object.entries(m)
      .map(([cidade, v]) => ({ cidade, ...v, taxa: v.total ? Math.round((v.rev / v.total) * 100) : 0 }))
      .sort((a, b) => b.rev - a.rev)
  }, [data, tipoAtivo])
```

por:

```tsx
  // ── Revisitas = qualquer flag de revisita ativo ───────────────────────
  const revisitas = useMemo(() => filtrarRevisitasAtivas(data?.rows ?? []), [data])
  const totalOS   = data?.kpis.total ?? 0

  // Filtradas pelo tipo ativo — usa os flags do SQL
  const revisitasFiltradas = useMemo(() => {
    if (tipoAtivo === 'todos') return revisitas
    return filtrarRevisitaPorTipo(revisitas, tipoAtivo)
  }, [revisitas, tipoAtivo])

  // Contagens diretas pelos flags SQL
  const contagens = useMemo(() => contarRevisitasPorTipo(revisitas), [revisitas])

  // Clientes crônicos (2+ revisitas no período)
  const cronicos = useMemo(() => clientesCronicos(revisitasFiltradas), [revisitasFiltradas])

  // Por cidade
  const porCidade = useMemo(() => {
    if (tipoAtivo === 'todos') {
      const m: Record<string, { rev: number; total: number }> = {}
      for (const r of (data?.rows ?? [])) {
        const c = r.nomedacidade || 'Sem cidade'
        if (!m[c]) m[c] = { rev: 0, total: 0 }
        m[c].total++
        if (isRevisitaAtiva(r)) m[c].rev++
      }
      return Object.entries(m)
        .map(([cidade, v]) => ({ cidade, ...v, taxa: v.total ? Math.round((v.rev / v.total) * 100) : 0 }))
        .sort((a, b) => b.rev - a.rev)
    }
    return revisitaPorCidade(data?.rows ?? [], tipoAtivo)
  }, [data, tipoAtivo])
```

- [ ] **Step 4: Build + suíte completa**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npm run build && npm test
```

Esperado: build limpo, todos os testes passando.

- [ ] **Step 5: Comparação visual (depois da mudança)**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npm run dev
```

Abra `http://localhost:3000/erp/qualidade` de novo, confira que os números anotados no Step 1 são idênticos para as 4 abas de tipo.

- [ ] **Step 6: Commit**

```bash
git add src/features/erp/qualidade/QualidadePage.tsx
git commit -m "refactor: QualidadePage usa as funções extraídas de revisitaPorTipo.ts"
```

---

## Task 3: `biGestaoTecnicaPainel.ts` — builder do Painel

**Files:**
- Create: `src/lib/builders/biGestaoTecnicaPainel.ts`
- Create: `src/lib/builders/biGestaoTecnicaPainel.test.ts`

**Interfaces:**
- Consumes: `getEquipeTipo`, `parseDate` (de `../transform`); `contarRevisitasPorTipo`, `RevisitaTipo` (Task 1)
- Produces: `BiGestaoTecnicaMesPoint { mes: string; label: string; instalacao: number; manutencao: number; servico: number }`; `BiGestaoTecnicaPainel { totalInstalacao: number; totalManutencao: number; totalServico: number; totalGeral: number; taxaManutencaoPct: number; ostPorMes: BiGestaoTecnicaMesPoint[]; mediaDiasExecucao: Record<RevisitaTipo, number>; cumprimentoAgendaPct: Record<RevisitaTipo, number>; revisitaPct: Record<RevisitaTipo, number> }`; `buildBiGestaoTecnicaPainel(rows: BacklogRow[]): BiGestaoTecnicaPainel`

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/lib/builders/biGestaoTecnicaPainel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildBiGestaoTecnicaPainel } from './biGestaoTecnicaPainel'
import type { BacklogRow } from '../../hooks/useBacklog'

function makeRow(overrides: Partial<BacklogRow> = {}): BacklogRow {
  return {
    nomecliente: 'CLIENTE TESTE', numos: '9000001', codigocliente: 'C1', codigocontrato: '100',
    servico: 'ASSISTENCIA TECNICA', tiposervico: 'MANUTENCAO', nomedacidade: 'TAUBATE', bairro: 'CENTRO',
    periodo: '2026-07', descsituacao: 'Concluída', nomedaequipe: 'F01', equipeexecutou: 'F01',
    datacadastro: '01/07/2026', dataagendamento: '02/07/2026', dataexecucao: '02/07/2026',
    horas_resolucao: 24, revisita_inst: 0, revisita_manut: 0, revisita_serv: 0,
    tempo_maior_24h: 0, tempo_maior_4h: 0, tempo_maior_3h: 0,
    ...overrides,
  }
}

describe('buildBiGestaoTecnicaPainel', () => {
  it('classifica e totaliza por tipo, excluindo REDE', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01' }),
      makeRow({ numos: '2', tiposervico: 'INSTALACAO', nomedaequipe: 'F04' }),
      makeRow({ numos: '3', tiposervico: 'SERVICOS',   nomedaequipe: 'F09' }),
      makeRow({ numos: '4', tiposervico: 'MANUTENCAO', nomedaequipe: '03-VAL-REDE F04' }),
    ]
    const painel = buildBiGestaoTecnicaPainel(rows)
    expect(painel.totalManutencao).toBe(1)
    expect(painel.totalInstalacao).toBe(1)
    expect(painel.totalServico).toBe(1)
    expect(painel.totalGeral).toBe(3)
  })

  it('taxaManutencaoPct = manutencao / geral', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01' }),
      makeRow({ numos: '2', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01' }),
      makeRow({ numos: '3', tiposervico: 'INSTALACAO', nomedaequipe: 'F04' }),
    ]
    expect(buildBiGestaoTecnicaPainel(rows).taxaManutencaoPct).toBe(67)
  })

  it('agrupa Total de OS por Mês corretamente', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', datacadastro: '05/06/2026' }),
      makeRow({ numos: '2', tiposervico: 'INSTALACAO', nomedaequipe: 'F04', datacadastro: '10/06/2026' }),
      makeRow({ numos: '3', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', datacadastro: '01/07/2026' }),
    ]
    const { ostPorMes } = buildBiGestaoTecnicaPainel(rows)
    expect(ostPorMes).toEqual([
      { mes: '2026-06', label: 'Jun 2026', instalacao: 1, manutencao: 1, servico: 0 },
      { mes: '2026-07', label: 'Jul 2026', instalacao: 0, manutencao: 1, servico: 0 },
    ])
  })

  it('mediaDiasExecucao converte horas_resolucao pra dias', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', horas_resolucao: 24 }),
      makeRow({ numos: '2', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', horas_resolucao: 48 }),
    ]
    expect(buildBiGestaoTecnicaPainel(rows).mediaDiasExecucao.manutencao).toBe(1.5)
  })

  it('cumprimentoAgendaPct considera execução no dia agendado ou antes', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', dataagendamento: '10/07/2026', dataexecucao: '10/07/2026' }),
      makeRow({ numos: '2', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', dataagendamento: '10/07/2026', dataexecucao: '12/07/2026' }),
    ]
    expect(buildBiGestaoTecnicaPainel(rows).cumprimentoAgendaPct.manutencao).toBe(50)
  })

  it('revisitaPct usa contarRevisitasPorTipo sobre o total do tipo', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', revisita_manut: 1 }),
      makeRow({ numos: '2', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01' }),
    ]
    expect(buildBiGestaoTecnicaPainel(rows).revisitaPct.manutencao).toBe(50)
  })

  it('retorna zeros quando não há linhas', () => {
    const painel = buildBiGestaoTecnicaPainel([])
    expect(painel.totalGeral).toBe(0)
    expect(painel.taxaManutencaoPct).toBe(0)
    expect(painel.ostPorMes).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx vitest run src/lib/builders/biGestaoTecnicaPainel.test.ts
```

Esperado: FAIL — `Cannot find module './biGestaoTecnicaPainel'`.

- [ ] **Step 3: Criar `src/lib/builders/biGestaoTecnicaPainel.ts`**

```ts
import { getEquipeTipo, parseDate } from '../transform'
import { contarRevisitasPorTipo, type RevisitaTipo } from './revisitaPorTipo'
import type { BacklogRow } from '../../hooks/useBacklog'

export interface BiGestaoTecnicaMesPoint {
  mes:        string
  label:      string
  instalacao: number
  manutencao: number
  servico:    number
}

export interface BiGestaoTecnicaPainel {
  totalInstalacao:      number
  totalManutencao:      number
  totalServico:         number
  totalGeral:           number
  taxaManutencaoPct:    number
  ostPorMes:            BiGestaoTecnicaMesPoint[]
  mediaDiasExecucao:    Record<RevisitaTipo, number>
  cumprimentoAgendaPct: Record<RevisitaTipo, number>
  revisitaPct:          Record<RevisitaTipo, number>
}

const MESES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function classificar(r: BacklogRow): RevisitaTipo | 'rede' {
  const tipo = getEquipeTipo(r.nomedaequipe, r.tiposervico)
  if (tipo === 'REDE')       return 'rede'
  if (tipo === 'INSTALACAO') return 'instalacao'
  if (tipo === 'MANUTENCAO') return 'manutencao'
  return 'servico'
}

function truncDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function mediaDiasDeExecucao(rows: BacklogRow[]): number {
  const horas = rows.map(r => Number(r.horas_resolucao)).filter(h => Number.isFinite(h) && h >= 0)
  if (!horas.length) return 0
  const media = horas.reduce((a, b) => a + b, 0) / horas.length
  return Math.round((media / 24) * 100) / 100
}

function cumprimentoAgenda(rows: BacklogRow[]): number {
  let total = 0
  let noPrazo = 0
  for (const r of rows) {
    const agend = parseDate(r.dataagendamento)
    const exec  = parseDate(r.dataexecucao)
    if (!agend || !exec) continue
    total++
    if (truncDay(exec) <= truncDay(agend)) noPrazo++
  }
  return total > 0 ? Math.round((noPrazo / total) * 100) : 0
}

export function buildBiGestaoTecnicaPainel(rows: BacklogRow[]): BiGestaoTecnicaPainel {
  const porTipo: Record<RevisitaTipo, BacklogRow[]> = { instalacao: [], manutencao: [], servico: [] }
  for (const r of rows) {
    const c = classificar(r)
    if (c === 'rede') continue
    porTipo[c].push(r)
  }

  const totalInstalacao = porTipo.instalacao.length
  const totalManutencao = porTipo.manutencao.length
  const totalServico    = porTipo.servico.length
  const totalGeral      = totalInstalacao + totalManutencao + totalServico

  const mesMap = new Map<string, { instalacao: number; manutencao: number; servico: number }>()
  for (const tipo of ['instalacao', 'manutencao', 'servico'] as const) {
    for (const r of porTipo[tipo]) {
      const dt = parseDate(r.datacadastro)
      if (!dt) continue
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      if (!mesMap.has(key)) mesMap.set(key, { instalacao: 0, manutencao: 0, servico: 0 })
      mesMap.get(key)![tipo]++
    }
  }
  const ostPorMes = [...mesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [y, m] = key.split('-').map(Number)
      return { mes: key, label: `${MESES_LABEL[m - 1]} ${y}`, ...v }
    })

  const revisitas = contarRevisitasPorTipo(rows)

  return {
    totalInstalacao,
    totalManutencao,
    totalServico,
    totalGeral,
    taxaManutencaoPct: totalGeral > 0 ? Math.round((totalManutencao / totalGeral) * 100) : 0,
    ostPorMes,
    mediaDiasExecucao: {
      instalacao: mediaDiasDeExecucao(porTipo.instalacao),
      manutencao: mediaDiasDeExecucao(porTipo.manutencao),
      servico:    mediaDiasDeExecucao(porTipo.servico),
    },
    cumprimentoAgendaPct: {
      instalacao: cumprimentoAgenda(porTipo.instalacao),
      manutencao: cumprimentoAgenda(porTipo.manutencao),
      servico:    cumprimentoAgenda(porTipo.servico),
    },
    revisitaPct: {
      instalacao: totalInstalacao > 0 ? Math.round((revisitas.instalacao / totalInstalacao) * 100) : 0,
      manutencao: totalManutencao > 0 ? Math.round((revisitas.manutencao / totalManutencao) * 100) : 0,
      servico:    totalServico    > 0 ? Math.round((revisitas.servico    / totalServico)    * 100) : 0,
    },
  }
}
```

- [ ] **Step 4: Rodar os testes**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx vitest run src/lib/builders/biGestaoTecnicaPainel.test.ts
```

Esperado: 7 PASSED.

- [ ] **Step 5: Build + suíte completa**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npm run build && npm test
```

Esperado: build limpo, todos os testes passando.

- [ ] **Step 6: Commit**

```bash
git add src/lib/builders/biGestaoTecnicaPainel.ts src/lib/builders/biGestaoTecnicaPainel.test.ts
git commit -m "feat: builder biGestaoTecnicaPainel calcula KPIs do Painel BI-Gestão Técnica"
```

---

## Task 4: Backend — registrar o módulo de permissão `erp_bi_tecnica`

**Files:**
- Modify: `cabonnet/db.py:22-27`
- Modify: `cabonnet/app.py:529-546`
- Modify: `tests/python/test_permissoes.py`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final de `tests/python/test_permissoes.py`:

```python
def test_erp_bi_tecnica_modulo_registrado(client, gestor):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.get("/api/permissoes", headers=gestor)
    assert r.status_code == 200
    modulos = {m["key"]: m["label"] for m in r.json()["modulos"]}
    assert modulos.get("erp_bi_tecnica") == "BI-Gestão Técnica"
    assert "erp_bi_tecnica" in db.ALL_MODULOS
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && pytest tests/python/test_permissoes.py::test_erp_bi_tecnica_modulo_registrado -v
```

Esperado: FAIL — `modulos.get("erp_bi_tecnica")` é `None` (módulo ainda não existe).

- [ ] **Step 3: Adicionar o módulo em `cabonnet/db.py`**

Leia o trecho atual antes de editar (linhas 22-27):

```python
ALL_MODULOS = [
    "dashboard", "ordens", "graficos", "cidades", "fornecedor", "juniper",
    "fechamento", "mapa", "noc",
    "erp_relatorios", "erp_alertas", "erp_qualidade",
    "erp_planner", "erp_fila", "erp_ranking",
]
```

Troque por:

```python
ALL_MODULOS = [
    "dashboard", "ordens", "graficos", "cidades", "fornecedor", "juniper",
    "fechamento", "mapa", "noc",
    "erp_relatorios", "erp_alertas", "erp_qualidade",
    "erp_planner", "erp_fila", "erp_ranking", "erp_bi_tecnica",
]
```

- [ ] **Step 4: Adicionar o label em `cabonnet/app.py`**

Leia o trecho atual antes de editar (linhas 529-546):

```python
_MODULO_LABELS = {
    "dashboard":          "Dashboard",
    "ordens":             "Ordens de Serviço",
    "graficos":           "Gráficos",
    "cidades":            "Cidades",
    "fornecedor":         "Fornecedor",
    "juniper":            "Juniper",
    "fechamento":         "Fechamento",
    "mapa":               "Mapa",
    "noc":                "NOC",
    "erp_relatorios":     "Relatórios",
    "erp_alertas":        "Alertas",
    "erp_qualidade":      "Qualidade",
    "erp_planner":        "Planner",
    "erp_fila":           "Fila de Prioridade",
    "erp_ranking":        "Ranking Técnicos",
```

Adicione uma linha logo após `"erp_ranking": "Ranking Técnicos",`:

```python
    "erp_ranking":        "Ranking Técnicos",
    "erp_bi_tecnica":     "BI-Gestão Técnica",
```

- [ ] **Step 5: Rodar o teste**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && pytest tests/python/test_permissoes.py -v
```

Esperado: todos PASSED, incluindo o novo teste.

- [ ] **Step 6: Rodar a suíte completa de Python**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && pytest -v
```

Esperado: todos os testes PASSED (a mudança em `ALL_MODULOS` não quebra `test_get_permissoes_returns_all_roles_and_modulos`, que usa `set(db.ALL_MODULOS)` dinamicamente).

- [ ] **Step 7: Commit**

```bash
git add cabonnet/db.py cabonnet/app.py tests/python/test_permissoes.py
git commit -m "feat: registra o módulo de permissão erp_bi_tecnica"
```

---

## Task 5: Frontend — roteamento e menu

**Files:**
- Modify: `src/lib/modulos.ts:5-21`
- Modify: `src/lib/navigation.ts:1-51`
- Modify: `src/pages/index.ts`
- Modify: `src/App.tsx`

Sem teste dedicado novo — `src/lib/navigation.test.ts` já existente cobre `visibleNavGroups` de forma dinâmica (usa `NAV_GROUPS.length`, não um número fixo), então continua passando sem alteração. A verificação real é o build + smoke test manual no Step 5.

- [ ] **Step 1: Adicionar o mapeamento em `src/lib/modulos.ts`**

Troque:

```ts
export const MODULO_ROTA: Record<string, string> = {
  dashboard:         '/',
  ordens:            '/ordens',
  graficos:          '/graficos',
  cidades:           '/cidades',
  fornecedor:        '/fornecedor',
  juniper:           '/juniper',
  fechamento:        '/fechamento',
  mapa:              '/mapa',
  noc:               '/noc',
  erp_relatorios:    '/erp/relatorios',
  erp_alertas:       '/erp/alertas',
  erp_qualidade:     '/erp/qualidade',
  erp_planner:       '/erp/planner',
  erp_fila:          '/erp/fila',
  erp_ranking:       '/erp/ranking',
}
```

por:

```ts
export const MODULO_ROTA: Record<string, string> = {
  dashboard:         '/',
  ordens:            '/ordens',
  graficos:          '/graficos',
  cidades:           '/cidades',
  fornecedor:        '/fornecedor',
  juniper:           '/juniper',
  fechamento:        '/fechamento',
  mapa:              '/mapa',
  noc:               '/noc',
  erp_relatorios:    '/erp/relatorios',
  erp_alertas:       '/erp/alertas',
  erp_qualidade:     '/erp/qualidade',
  erp_planner:       '/erp/planner',
  erp_fila:          '/erp/fila',
  erp_ranking:       '/erp/ranking',
  erp_bi_tecnica:    '/erp/bi-gestao-tecnica',
}
```

- [ ] **Step 2: Adicionar o link no `src/lib/navigation.ts`**

Troque o import de ícones (linha 2-7):

```ts
import {
  LayoutDashboard, ClipboardList,
  BarChart2, PieChart, MapPin,
  Zap, Monitor, FileText, Map,
  Bell, Award, CalendarDays, Shield, Siren, Medal, Users,
} from 'lucide-react'
```

por:

```ts
import {
  LayoutDashboard, ClipboardList,
  BarChart2, PieChart, MapPin,
  Zap, Monitor, FileText, Map,
  Bell, Award, CalendarDays, Shield, Siren, Medal, Users, Wrench,
} from 'lucide-react'
```

E, no grupo `analisar` (linhas 41-51), adicione o link logo após "Qualidade":

```ts
  {
    key: 'analisar', label: 'Analisar', color: '#4ade80',
    links: [
      { to: '/cidades',        label: 'Cidades',          icon: MapPin    },
      { to: '/erp/ranking',    label: 'Ranking Técnicos', icon: Medal     },
      { to: '/erp/qualidade',  label: 'Qualidade',        icon: Award     },
      { to: '/erp/bi-gestao-tecnica', label: 'BI Técnico', icon: Wrench   },
      { to: '/erp/relatorios', label: 'Relatórios',       icon: BarChart2 },
      { to: '/graficos',       label: 'Gráficos',         icon: PieChart  },
      { to: '/fechamento',     label: 'Fechamento',       icon: FileText  },
    ],
  },
```

- [ ] **Step 3: Adicionar o lazy import em `src/pages/index.ts`**

Troque:

```ts
export const ERPRankingTecnicosPage = lazy(() => import('../features/erp/ranking/RankingTecnicosPage'))
```

por:

```ts
export const ERPRankingTecnicosPage = lazy(() => import('../features/erp/ranking/RankingTecnicosPage'))
export const ERPBiGestaoTecnicaPage = lazy(() => import('../features/erp/biGestaoTecnica/BiGestaoTecnicaPage'))
```

- [ ] **Step 4: Adicionar a rota em `src/App.tsx`**

Troque o import (linhas 8-16):

```tsx
import {
  ERPRelatoriosPage,
  ERPAlertasPage,
  ERPQualidadePage, ERPPlannerPage, ERPFilaPage, ERPRankingTecnicosPage,
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
  ERPQualidadePage, ERPPlannerPage, ERPFilaPage, ERPRankingTecnicosPage, ERPBiGestaoTecnicaPage,
  DashboardPage, OrdensPage,
  GraficosPage, CidadesGerencialPage,
  FornecedorPage, JuniperPage, NotFoundPage, NocPage, FechamentoPage,
  MapaPage, UsuariosPage,
} from './pages/index'
```

E adicione a rota logo após `qualidade` (linha 63):

```tsx
          <Route path="qualidade"     element={<RequireModulo modulo="erp_qualidade">    <ERPQualidadePage />    </RequireModulo>} />
          <Route path="bi-gestao-tecnica" element={<RequireModulo modulo="erp_bi_tecnica"><ERPBiGestaoTecnicaPage /></RequireModulo>} />
```

- [ ] **Step 5: Build (a página em si ainda não existe — Task 8 cria)**

Este build vai FALHAR até o Task 8 criar `BiGestaoTecnicaPage.tsx` — é esperado, o import é resolvido em tempo de módulo. Não rode `npm run build` ainda; siga direto para os Tasks 6-8 e só valide no Task 9.

- [ ] **Step 6: Commit**

```bash
git add src/lib/modulos.ts src/lib/navigation.ts src/pages/index.ts src/App.tsx
git commit -m "feat: adiciona rota e menu para BI-Gestão Técnica (página vem no próximo commit)"
```

---

## Task 6: `RevisitaTab.tsx` — aba de Revisita reutilizável

**Files:**
- Create: `src/features/erp/biGestaoTecnica/RevisitaTab.tsx`

Sem teste unitário dedicado — é um componente de apresentação puro sobre dados já testados (Task 1). A verificação é visual, feita no Task 9.

**Interfaces:**
- Consumes: `BacklogData` (de `../../../hooks/useBacklog`); `RevisitaTipo`, `filtrarRevisitasAtivas`, `filtrarRevisitaPorTipo`, `revisitaPorCidade`, `clientesCronicos` (Task 1)
- Produces: `RevisitaTab({ data, tipo }: { data: BacklogData | undefined; tipo: RevisitaTipo }): JSX.Element | null`

- [ ] **Step 1: Criar `src/features/erp/biGestaoTecnica/RevisitaTab.tsx`**

```tsx
import { MapPin, AlertTriangle } from 'lucide-react'
import type { BacklogData } from '../../../hooks/useBacklog'
import {
  filtrarRevisitasAtivas, filtrarRevisitaPorTipo, revisitaPorCidade, clientesCronicos,
  type RevisitaTipo,
} from '../../../lib/builders/revisitaPorTipo'
import { StatCard } from '../../../components/ui/StatCard'
import { SectionLabel } from '../../../components/ui/SectionLabel'

function taxaCor(taxa: number): string {
  if (taxa >= 15) return '#f87171'
  if (taxa >= 8)  return '#facc15'
  return '#4ade80'
}

function fmt(n: number): string { return n.toLocaleString('pt-BR') }

interface RevisitaTabProps {
  data: BacklogData | undefined
  tipo: RevisitaTipo
}

export function RevisitaTab({ data, tipo }: RevisitaTabProps) {
  if (!data) return null

  const rows            = data.rows
  const totalPeriodo     = data.kpis.total
  const ativas           = filtrarRevisitasAtivas(rows)
  const revisitasDoTipo  = filtrarRevisitaPorTipo(ativas, tipo)
  const taxa             = totalPeriodo > 0 ? Math.round((revisitasDoTipo.length / totalPeriodo) * 100) : 0
  const porCidade        = revisitaPorCidade(rows, tipo)
  const cronicos         = clientesCronicos(revisitasDoTipo)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard title="Revisitas no período" value={fmt(revisitasDoTipo.length)}
                  sub={`${taxa}% de ${fmt(totalPeriodo)} OS`}
                  tone={taxa >= 15 ? 'critical' : taxa >= 8 ? 'warning' : 'ok'} />
        <StatCard title="Cidades atingidas" value={fmt(porCidade.filter(c => c.rev > 0).length)} />
        <StatCard title="Clientes crônicos (2+)" value={fmt(cronicos.length)} tone="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="space-y-2">
          <SectionLabel icon={MapPin} color="#22d3ee">Por Cidade</SectionLabel>
          <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden divide-y divide-white/[0.04]">
            {porCidade.length === 0 && (
              <p className="px-4 py-6 text-caption text-muted text-center">Sem revisitas no período.</p>
            )}
            {porCidade.map(c => {
              const color = taxaCor(c.taxa)
              const maxC  = porCidade[0]?.rev ?? 1
              return (
                <div key={c.cidade} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-label font-semibold text-text w-32 flex-shrink-0 truncate">{c.cidade}</span>
                  <div className="flex-1 h-1.5 bg-surface/40 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: `${maxC ? Math.round((c.rev / maxC) * 100) : 0}%`, background: color }} />
                  </div>
                  <span className="font-mono font-bold text-body w-8 text-right" style={{ color }}>{c.rev}</span>
                  <span className="text-caption text-muted w-9 text-right">{c.taxa}%</span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="space-y-2">
          <SectionLabel icon={AlertTriangle} color="#f87171">Crônicos — 2+ revisitas</SectionLabel>
          <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
            {cronicos.length === 0 && (
              <p className="px-4 py-6 text-caption text-muted text-center">Nenhum cliente crônico no período.</p>
            )}
            <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.04]">
              {cronicos.map(c => {
                const color = c.count >= 4 ? '#f87171' : c.count >= 3 ? '#f97316' : '#facc15'
                return (
                  <div key={c.nome} className="flex items-center gap-2 px-4 py-2.5">
                    <p className="flex-1 text-[11.5px] text-text truncate">{c.nome}</p>
                    <span className="font-mono font-bold text-body" style={{ color }}>{c.count}×</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check (build completo só no Task 9, mas confira que este arquivo isolado não tem erro óbvio)**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx tsc --noEmit
```

Esperado: sem erros vindos deste arquivo (pode haver erros de outros arquivos ainda incompletos do Task 5/8 — ignore por enquanto, será revalidado no Task 9).

- [ ] **Step 3: Commit**

```bash
git add src/features/erp/biGestaoTecnica/RevisitaTab.tsx
git commit -m "feat: componente RevisitaTab reutilizável pras 3 abas de revisita"
```

---

## Task 7: `PainelTab.tsx` — aba Painel

**Files:**
- Create: `src/features/erp/biGestaoTecnica/PainelTab.tsx`

Sem teste unitário dedicado — componente de apresentação sobre `buildBiGestaoTecnicaPainel` (já testado no Task 3).

**Interfaces:**
- Consumes: `BacklogData` (de `../../../hooks/useBacklog`); `buildBiGestaoTecnicaPainel` (Task 3)
- Produces: `PainelTab({ data }: { data: BacklogData | undefined }): JSX.Element | null`

- [ ] **Step 1: Criar `src/features/erp/biGestaoTecnica/PainelTab.tsx`**

```tsx
import { useMemo } from 'react'
import { Wrench, Home, Star, Layers } from 'lucide-react'
import type { BacklogData } from '../../../hooks/useBacklog'
import { buildBiGestaoTecnicaPainel } from '../../../lib/builders/biGestaoTecnicaPainel'
import { StatCard } from '../../../components/ui/StatCard'
import { SectionLabel } from '../../../components/ui/SectionLabel'
import { BarChart, Bar, XAxis, YAxis, Grid, ChartTooltip, Legend } from '../../../components/ui/bar-chart'

function fmt(n: number): string { return n.toLocaleString('pt-BR') }

const TIPO_TITULO: Record<'instalacao' | 'manutencao' | 'servico', string> = {
  instalacao: 'Instalação',
  manutencao: 'Manutenção',
  servico:    'Serviço',
}

interface PainelTabProps {
  data: BacklogData | undefined
}

export function PainelTab({ data }: PainelTabProps) {
  const painel = useMemo(() => buildBiGestaoTecnicaPainel(data?.rows ?? []), [data])

  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Total Manutenção" value={fmt(painel.totalManutencao)} icon={Wrench} />
        <StatCard title="Total Instalação" value={fmt(painel.totalInstalacao)} icon={Home} />
        <StatCard title="Total Serviço"    value={fmt(painel.totalServico)}    icon={Star} />
        <StatCard title="Total OS Geral"   value={fmt(painel.totalGeral)}      icon={Layers} />
      </div>

      {painel.ostPorMes.length > 0 && (
        <section className="space-y-2">
          <SectionLabel icon={Layers} color="#c4b5fd">Total de OS por Mês</SectionLabel>
          <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
            <div style={{ height: 260 }}>
              <BarChart data={painel.ostPorMes}>
                <Grid />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <ChartTooltip />
                <Legend />
                <Bar dataKey="instalacao" name="Instalação" fill="#3b82f6" />
                <Bar dataKey="manutencao" name="Manutenção" fill="#f97316" />
                <Bar dataKey="servico"    name="Serviço"    fill="#facc15" />
              </BarChart>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['instalacao', 'manutencao', 'servico'] as const).map(tipo => (
          <section key={tipo} className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
            <h3 className="text-label font-semibold text-text">{TIPO_TITULO[tipo]}</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[18px] font-bold tabular-nums text-text">{painel.mediaDiasExecucao[tipo]}d</p>
                <p className="text-caption text-muted mt-0.5">Média execução</p>
              </div>
              <div>
                <p className="text-[18px] font-bold tabular-nums text-text">{painel.cumprimentoAgendaPct[tipo]}%</p>
                <p className="text-caption text-muted mt-0.5">Cumpr. agenda</p>
              </div>
              <div>
                <p className="text-[18px] font-bold tabular-nums text-text">{painel.revisitaPct[tipo]}%</p>
                <p className="text-caption text-muted mt-0.5">Revisita</p>
              </div>
            </div>
          </section>
        ))}
      </div>

      <StatCard title="Taxa Manutenção" value={`${painel.taxaManutencaoPct}%`} tone="warning" size="sm" className="max-w-[200px]" />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/erp/biGestaoTecnica/PainelTab.tsx
git commit -m "feat: componente PainelTab do BI-Gestão Técnica"
```

---

## Task 8: `BiGestaoTecnicaPage.tsx` — shell da página

**Files:**
- Create: `src/features/erp/biGestaoTecnica/BiGestaoTecnicaPage.tsx`

**Interfaces:**
- Consumes: `useBacklog` (de `../../../hooks/useBacklog`); `TabBar` (de `../../../components/ui/TabBar`); `PageHeader` (de `../../../components/ui/PageHeader`); `PainelTab` (Task 7); `RevisitaTab` (Task 6)

- [ ] **Step 1: Criar `src/features/erp/biGestaoTecnica/BiGestaoTecnicaPage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { RefreshCw, AlertTriangle, LayoutDashboard, Home, Wrench, Star } from 'lucide-react'
import { useBacklog } from '../../../hooks/useBacklog'
import { TabBar } from '../../../components/ui/TabBar'
import { PageHeader } from '../../../components/ui/PageHeader'
import { PainelTab } from './PainelTab'
import { RevisitaTab } from './RevisitaTab'

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
  { id: 'painel',     label: 'Painel',             icon: LayoutDashboard },
  { id: 'instalacao', label: 'Revisita Instalação', icon: Home            },
  { id: 'servico',    label: 'Revisita Serviço',    icon: Star            },
  { id: 'manutencao', label: 'Revisita Manutenção', icon: Wrench          },
]

export default function BiGestaoTecnicaPage() {
  const [tab,       setTab]       = useState('painel')
  const [preset,    setPreset]    = useState<Preset>('atual')
  const [customIni, setCustomIni] = useState(() => mesAnteriorRange()[0])
  const [customFim, setCustomFim] = useState(() => isoDate(new Date()))

  const [inicio, fim] = useMemo<[string, string]>(() => {
    if (preset === 'atual')    return mesAtualRange()
    if (preset === 'anterior') return mesAnteriorRange()
    const f      = customFim < customIni ? customIni : customFim
    const amanha = isoDate(new Date(new Date(f).getTime() + 86_400_000))
    return [customIni, amanha]
  }, [preset, customIni, customFim])

  const { data, isLoading, isError, refetch, isFetching } = useBacklog(inicio, fim)

  return (
    <div className="space-y-4 max-w-[1600px]">
      <PageHeader
        title="BI-Gestão Técnica"
        description="Painel técnico e revisitas por tipo de serviço — portado do i-Manager"
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
          {tab === 'painel'     && <PainelTab data={data} />}
          {tab === 'instalacao' && <RevisitaTab data={data} tipo="instalacao" />}
          {tab === 'servico'    && <RevisitaTab data={data} tipo="servico" />}
          {tab === 'manutencao' && <RevisitaTab data={data} tipo="manutencao" />}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx tsc --noEmit && npm run build
```

Esperado: type-check e build limpos (agora que a página existe, a rota do Task 5 resolve).

- [ ] **Step 3: Commit**

```bash
git add src/features/erp/biGestaoTecnica/BiGestaoTecnicaPage.tsx
git commit -m "feat: BiGestaoTecnicaPage — shell com controle de período e 4 abas"
```

---

## Task 9: Verificação final end-to-end

**Files:** nenhum (apenas verificação)

- [ ] **Step 1: Rodar toda a suíte de testes**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && pytest -v && npm test
```

Esperado: todos os testes Python e JS/TS passando.

- [ ] **Step 2: Build de produção**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npm run build
```

Esperado: build sem erros nem warnings de tipo.

- [ ] **Step 3: Smoke test manual com o servidor rodando**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npm run dev
```

No browser:
1. Faça login como gestor (ou usuário com o módulo liberado).
2. Confirme que "BI Técnico" aparece no grupo "Analisar" do menu lateral.
3. Abra `/erp/bi-gestao-tecnica`. Confirme que a aba "Painel" mostra os 4 totais, o gráfico "Total de OS por Mês" e os cards de Instalação/Manutenção/Serviço.
4. Clique nas abas "Revisita Instalação/Serviço/Manutenção" — confirme que cada uma mostra números diferentes (Revisitas no período, Por Cidade, Crônicos).
5. Troque o período (Mês Atual/Mês Anterior/Personalizado) e confirme que os números mudam em todas as abas.
6. Volte em `/erp/qualidade` e confirme que os números continuam idênticos aos anotados no Task 2 Step 1 (a refatoração não alterou nada visível lá).

- [ ] **Step 4: Revisar o diff completo antes de considerar a entrega pronta**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && git log --oneline -9
```

Esperado: 8 commits desde o início deste plano (Tasks 1-8), cada um com escopo único e mensagem clara.
