# Filtro de Cidade/Fornecedor/Equipe no BI-Gestão Técnica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um filtro global (Cidade/Fornecedor/Equipe, 3 dropdowns de seleção única) ao menu BI-Gestão Técnica, valendo pras 4 abas (Painel + Revisita Instalação/Serviço/Manutenção).

**Architecture:** Filtro 100% client-side sobre o `BacklogData` já buscado via `useBacklog` — zero chamada de rede nova. Um builder puro (`filtrarBacklogRows`) recalcula `kpis.total` sobre as linhas filtradas (crítico: `RevisitaTab` usa esse total como denominador do % de revisita). Um novo componente (`FiltrosBiTecnica`) renderiza os 3 dropdowns reaproveitando `FilterSelect` já existente. `BiGestaoTecnicaPage` guarda o estado dos filtros e passa o `BacklogData` filtrado pras abas — `PainelTab`/`RevisitaTab` não mudam.

**Tech Stack:** React + TypeScript, Vitest.

**Spec:** `.planning/specs/2026-07-23-bi-tecnica-filtros-design.md`

## Global Constraints

- Zero chamada de rede nova — tudo client-side sobre o `BacklogData` que `useBacklog` já retorna.
- Os 3 filtros são independentes (sem cascata) e combinam com E lógico.
- `kpis.total` do `BacklogData` filtrado DEVE ser recalculado como `rows.length` — os demais campos de `kpis` (`rev_inst`, `rev_manut`, `rev_serv`, `violacoes_*`) e `por_equipe`/`por_cidade`/`por_tipo` são copiados sem alteração (não são consumidos por `PainelTab`/`RevisitaTab` hoje).
- As opções de cada dropdown vêm do `BacklogData` **bruto** (antes do filtro), nunca do filtrado — senão as opções somem conforme o usuário filtra.
- `PainelTab.tsx` e `RevisitaTab.tsx` não devem ser modificados — ambos já recebem um `BacklogData` via prop `data`; a mudança é transparente pra eles.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/builders/biTecnicaFiltros.ts` (create) | Tipo `BiTecnicaFiltros`, funções de opções distintas por dimensão, `filtrarBacklogRows` |
| `src/lib/builders/biTecnicaFiltros.test.ts` (create) | Testes das funções acima |
| `src/features/erp/biGestaoTecnica/FiltrosBiTecnica.tsx` (create) | 3x `FilterSelect` (Cidade/Fornecedor/Equipe) |
| `src/features/erp/biGestaoTecnica/BiGestaoTecnicaPage.tsx` (modify) | Estado dos filtros + `useMemo` de `filtrarBacklogRows` + renderiza `FiltrosBiTecnica` |

---

## Task 1: `biTecnicaFiltros.ts` — tipo, opções e filtro

**Files:**
- Create: `src/lib/builders/biTecnicaFiltros.ts`
- Create: `src/lib/builders/biTecnicaFiltros.test.ts`

**Interfaces:**
- Consumes: `getFornecedor` (de `../transform`, já existe); `Fornecedor` (de `../types`, já existe); `BacklogData`, `BacklogRow` (de `../../hooks/useBacklog`, já existem)
- Produces: `BiTecnicaFiltros { cidade: string; fornecedor: string; equipe: string }`; `FILTROS_VAZIOS: BiTecnicaFiltros`; `opcoesCidade(rows: BacklogRow[]): string[]`; `opcoesFornecedor(rows: BacklogRow[]): Fornecedor[]`; `opcoesEquipe(rows: BacklogRow[]): string[]`; `filtrarBacklogRows(data: BacklogData, filtros: BiTecnicaFiltros): BacklogData`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/lib/builders/biTecnicaFiltros.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  FILTROS_VAZIOS, opcoesCidade, opcoesFornecedor, opcoesEquipe, filtrarBacklogRows,
} from './biTecnicaFiltros'
import type { BacklogData, BacklogRow } from '../../hooks/useBacklog'

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

function makeData(rows: BacklogRow[]): BacklogData {
  return {
    rows,
    kpis: { total: rows.length, rev_inst: 0, rev_manut: 0, rev_serv: 0, violacoes_24h: 0, violacoes_4h: 0, violacoes_3h: 0 },
    por_equipe: [], por_cidade: [], por_tipo: [],
    n: rows.length, periodo: '2026-07-01', fim: '2026-08-01',
  }
}

describe('opcoesCidade', () => {
  it('retorna cidades distintas ordenadas', () => {
    const rows = [
      makeRow({ nomedacidade: 'TAUBATE' }),
      makeRow({ nomedacidade: 'CACAPAVA' }),
      makeRow({ nomedacidade: 'TAUBATE' }),
    ]
    expect(opcoesCidade(rows)).toEqual(['CACAPAVA', 'TAUBATE'])
  })
})

describe('opcoesFornecedor', () => {
  it('deriva fornecedor via getFornecedor e retorna distintos ordenados', () => {
    const rows = [
      makeRow({ nomedaequipe: 'F01' }),   // Instacable (INST_CODES)
      makeRow({ nomedaequipe: 'F08' }),   // WES (WES_CODES)
      makeRow({ nomedaequipe: 'F01' }),
    ]
    expect(opcoesFornecedor(rows)).toEqual(['Instacable', 'WES'])
  })
})

describe('opcoesEquipe', () => {
  it('retorna equipes distintas ordenadas', () => {
    const rows = [
      makeRow({ nomedaequipe: 'F04' }),
      makeRow({ nomedaequipe: 'F01' }),
      makeRow({ nomedaequipe: 'F04' }),
    ]
    expect(opcoesEquipe(rows)).toEqual(['F01', 'F04'])
  })
})

describe('filtrarBacklogRows', () => {
  it('sem filtros retorna tudo, mesmo total', () => {
    const data = makeData([makeRow({ numos: '1' }), makeRow({ numos: '2' })])
    const result = filtrarBacklogRows(data, FILTROS_VAZIOS)
    expect(result.rows).toHaveLength(2)
    expect(result.kpis.total).toBe(2)
  })

  it('filtra por cidade', () => {
    const data = makeData([
      makeRow({ numos: '1', nomedacidade: 'TAUBATE' }),
      makeRow({ numos: '2', nomedacidade: 'CACAPAVA' }),
    ])
    const result = filtrarBacklogRows(data, { ...FILTROS_VAZIOS, cidade: 'TAUBATE' })
    expect(result.rows.map(r => r.numos)).toEqual(['1'])
    expect(result.kpis.total).toBe(1)
  })

  it('filtra por fornecedor (derivado de nomedaequipe)', () => {
    const data = makeData([
      makeRow({ numos: '1', nomedaequipe: 'F01' }),  // Instacable
      makeRow({ numos: '2', nomedaequipe: 'F08' }),  // WES
    ])
    const result = filtrarBacklogRows(data, { ...FILTROS_VAZIOS, fornecedor: 'WES' })
    expect(result.rows.map(r => r.numos)).toEqual(['2'])
  })

  it('filtra por equipe', () => {
    const data = makeData([
      makeRow({ numos: '1', nomedaequipe: 'F01' }),
      makeRow({ numos: '2', nomedaequipe: 'F04' }),
    ])
    const result = filtrarBacklogRows(data, { ...FILTROS_VAZIOS, equipe: 'F04' })
    expect(result.rows.map(r => r.numos)).toEqual(['2'])
  })

  it('combina os 3 filtros com E lógico', () => {
    const data = makeData([
      makeRow({ numos: '1', nomedacidade: 'TAUBATE',  nomedaequipe: 'F01' }),
      makeRow({ numos: '2', nomedacidade: 'TAUBATE',  nomedaequipe: 'F08' }),
      makeRow({ numos: '3', nomedacidade: 'CACAPAVA', nomedaequipe: 'F01' }),
    ])
    const result = filtrarBacklogRows(data, { cidade: 'TAUBATE', fornecedor: 'Instacable', equipe: '' })
    expect(result.rows.map(r => r.numos)).toEqual(['1'])
  })

  it('não muta o objeto data original', () => {
    const data = makeData([makeRow({ numos: '1', nomedacidade: 'TAUBATE' })])
    const originalRowsRef = data.rows
    filtrarBacklogRows(data, { ...FILTROS_VAZIOS, cidade: 'CACAPAVA' })
    expect(data.rows).toBe(originalRowsRef)
    expect(data.kpis.total).toBe(1)
  })

  it('preserva demais campos de kpis sem alteração', () => {
    const data = makeData([makeRow({ numos: '1' })])
    data.kpis.rev_manut = 5
    const result = filtrarBacklogRows(data, FILTROS_VAZIOS)
    expect(result.kpis.rev_manut).toBe(5)
  })
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx vitest run src/lib/builders/biTecnicaFiltros.test.ts
```

Esperado: FAIL — `Cannot find module './biTecnicaFiltros'`.

- [ ] **Step 3: Criar `src/lib/builders/biTecnicaFiltros.ts`**

```ts
import { getFornecedor } from '../transform'
import type { Fornecedor } from '../types'
import type { BacklogData, BacklogRow } from '../../hooks/useBacklog'

export interface BiTecnicaFiltros {
  cidade:     string
  fornecedor: string
  equipe:     string
}

export const FILTROS_VAZIOS: BiTecnicaFiltros = { cidade: '', fornecedor: '', equipe: '' }

export function opcoesCidade(rows: BacklogRow[]): string[] {
  return [...new Set(rows.map(r => r.nomedacidade).filter(Boolean))].sort()
}

export function opcoesFornecedor(rows: BacklogRow[]): Fornecedor[] {
  return [...new Set(rows.map(r => getFornecedor(r.nomedaequipe)))].sort()
}

export function opcoesEquipe(rows: BacklogRow[]): string[] {
  return [...new Set(rows.map(r => r.nomedaequipe).filter(Boolean))].sort()
}

export function filtrarBacklogRows(data: BacklogData, filtros: BiTecnicaFiltros): BacklogData {
  const rows = data.rows.filter(r =>
    (!filtros.cidade     || r.nomedacidade === filtros.cidade) &&
    (!filtros.fornecedor || getFornecedor(r.nomedaequipe) === filtros.fornecedor) &&
    (!filtros.equipe     || r.nomedaequipe === filtros.equipe)
  )
  return { ...data, rows, kpis: { ...data.kpis, total: rows.length } }
}
```

Sempre retorna um objeto novo (não muta `data`), mesmo quando nenhum filtro está ativo — mantém o comportamento simples e previsível descrito na spec, sem otimizações de referência.

- [ ] **Step 4: Rodar os testes**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx vitest run src/lib/builders/biTecnicaFiltros.test.ts
```

Esperado: 10 PASSED (1 opcoesCidade + 1 opcoesFornecedor + 1 opcoesEquipe + 7 filtrarBacklogRows).

- [ ] **Step 5: Build + suíte completa**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx tsc --noEmit && npm test
```

Esperado: type-check limpo, todos os testes passando.

- [ ] **Step 6: Commit**

```bash
git add src/lib/builders/biTecnicaFiltros.ts src/lib/builders/biTecnicaFiltros.test.ts
git commit -m "feat: builder biTecnicaFiltros — opções distintas e filtro de cidade/fornecedor/equipe"
```

---

## Task 2: `FiltrosBiTecnica.tsx` — os 3 dropdowns

**Files:**
- Create: `src/features/erp/biGestaoTecnica/FiltrosBiTecnica.tsx`

Sem teste dedicado — componente de apresentação puro sobre funções já testadas no Task 1, mesma convenção de `RevisitaTab`/`PainelTab` na entrega anterior.

**Interfaces:**
- Consumes: `FilterSelect` (de `../../../components/ui/FilterSelect`, já existe); `shortEquipe` (de `../../../lib/osFormat`, já existe); `opcoesCidade`, `opcoesFornecedor`, `opcoesEquipe`, `BiTecnicaFiltros` (Task 1); `BacklogRow` (de `../../../hooks/useBacklog`)
- Produces: `FiltrosBiTecnica({ rows, filtros, onChange }: { rows: BacklogRow[]; filtros: BiTecnicaFiltros; onChange: (f: BiTecnicaFiltros) => void }): JSX.Element`

- [ ] **Step 1: Ler `FilterSelect` pra confirmar a prop `options` (evita adivinhar o shape)**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && grep -n "interface\|Props" src/components/ui/FilterSelect.tsx
```

Esperado: `options: { value: string; label: string }[]`, `value: string`, `onChange: (value: string) => void`, `placeholder?: string`, `className?: string`.

- [ ] **Step 2: Criar `src/features/erp/biGestaoTecnica/FiltrosBiTecnica.tsx`**

```tsx
import { FilterSelect } from '../../../components/ui/FilterSelect'
import { shortEquipe } from '../../../lib/osFormat'
import { opcoesCidade, opcoesFornecedor, opcoesEquipe, type BiTecnicaFiltros } from '../../../lib/builders/biTecnicaFiltros'
import type { BacklogRow } from '../../../hooks/useBacklog'

interface FiltrosBiTecnicaProps {
  rows:     BacklogRow[]
  filtros:  BiTecnicaFiltros
  onChange: (filtros: BiTecnicaFiltros) => void
}

export function FiltrosBiTecnica({ rows, filtros, onChange }: FiltrosBiTecnicaProps) {
  const cidades      = opcoesCidade(rows)
  const fornecedores = opcoesFornecedor(rows)
  const equipes      = opcoesEquipe(rows)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <FilterSelect
        value={filtros.cidade}
        onChange={v => onChange({ ...filtros, cidade: v })}
        options={cidades.map(c => ({ value: c, label: c }))}
        placeholder="Todas as cidades"
        className="w-40"
      />
      <FilterSelect
        value={filtros.fornecedor}
        onChange={v => onChange({ ...filtros, fornecedor: v })}
        options={fornecedores.map(f => ({ value: f, label: f }))}
        placeholder="Todos os fornecedores"
        className="w-44"
      />
      <FilterSelect
        value={filtros.equipe}
        onChange={v => onChange({ ...filtros, equipe: v })}
        options={equipes.map(e => ({ value: e, label: shortEquipe(e) }))}
        placeholder="Todas as equipes"
        className="w-48"
      />
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx tsc --noEmit 2>&1 | grep -i "FiltrosBiTecnica"
```

Esperado: sem output (nenhum erro referenciando este arquivo). O projeto como um todo pode ter avisos não relacionados — ignore.

- [ ] **Step 4: Commit**

```bash
git add src/features/erp/biGestaoTecnica/FiltrosBiTecnica.tsx
git commit -m "feat: componente FiltrosBiTecnica — dropdowns de cidade/fornecedor/equipe"
```

---

## Task 3: Integrar o filtro em `BiGestaoTecnicaPage.tsx`

**Files:**
- Modify: `src/features/erp/biGestaoTecnica/BiGestaoTecnicaPage.tsx`

**Interfaces:**
- Consumes: `FiltrosBiTecnica` (Task 2); `filtrarBacklogRows`, `FILTROS_VAZIOS`, `BiTecnicaFiltros` (Task 1)

- [ ] **Step 1: Ler o arquivo atual (já carregado nesta sessão) antes de editar**

O arquivo atual (pós-merge da entrega anterior) tem esta estrutura relevante:

```tsx
import { useMemo, useState } from 'react'
import { RefreshCw, AlertTriangle, LayoutDashboard, Home, Wrench, Star } from 'lucide-react'
import { useBacklog } from '../../../hooks/useBacklog'
import { TabBar } from '../../../components/ui/TabBar'
import { PageHeader } from '../../../components/ui/PageHeader'
import { PainelTab } from './PainelTab'
import { RevisitaTab } from './RevisitaTab'
```//... (funções de data omitidas — sem mudança)

```tsx
export default function BiGestaoTecnicaPage() {
  const [tab,       setTab]       = useState('painel')
  const [preset,    setPreset]    = useState<Preset>('atual')
  const [customIni, setCustomIni] = useState(() => mesAnteriorRange()[0])
  const [customFim, setCustomFim] = useState(() => isoDate(new Date()))

  const [inicio, fim] = useMemo<[string, string]>(() => {
    // ... sem mudança
  }, [preset, customIni, customFim])

  const { data, isLoading, isError, refetch, isFetching } = useBacklog(inicio, fim)

  return (
    <div className="space-y-4 max-w-[1600px]">
      <PageHeader
        title="BI-Gestão Técnica"
        description="Painel técnico e revisitas por tipo de serviço — portado do i-Manager"
      />

      <div className="flex items-center gap-2 flex-wrap">
        {/* ... controle de período e botão Atualizar, sem mudança ... */}
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {isLoading && !data && ( /* ... sem mudança ... */ )}
      {isError && !data && ( /* ... sem mudança ... */ )}

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

- [ ] **Step 2: Adicionar os imports novos**

Troque:

```tsx
import { useMemo, useState } from 'react'
import { RefreshCw, AlertTriangle, LayoutDashboard, Home, Wrench, Star } from 'lucide-react'
import { useBacklog } from '../../../hooks/useBacklog'
import { TabBar } from '../../../components/ui/TabBar'
import { PageHeader } from '../../../components/ui/PageHeader'
import { PainelTab } from './PainelTab'
import { RevisitaTab } from './RevisitaTab'
```

por:

```tsx
import { useMemo, useState } from 'react'
import { RefreshCw, AlertTriangle, LayoutDashboard, Home, Wrench, Star } from 'lucide-react'
import { useBacklog } from '../../../hooks/useBacklog'
import { TabBar } from '../../../components/ui/TabBar'
import { PageHeader } from '../../../components/ui/PageHeader'
import { PainelTab } from './PainelTab'
import { RevisitaTab } from './RevisitaTab'
import { FiltrosBiTecnica } from './FiltrosBiTecnica'
import { filtrarBacklogRows, FILTROS_VAZIOS, type BiTecnicaFiltros } from '../../../lib/builders/biTecnicaFiltros'
```

- [ ] **Step 3: Adicionar o estado dos filtros e o `useMemo` de filtragem**

Troque:

```tsx
  const [tab,       setTab]       = useState('painel')
  const [preset,    setPreset]    = useState<Preset>('atual')
  const [customIni, setCustomIni] = useState(() => mesAnteriorRange()[0])
  const [customFim, setCustomFim] = useState(() => isoDate(new Date()))
```

por:

```tsx
  const [tab,       setTab]       = useState('painel')
  const [preset,    setPreset]    = useState<Preset>('atual')
  const [customIni, setCustomIni] = useState(() => mesAnteriorRange()[0])
  const [customFim, setCustomFim] = useState(() => isoDate(new Date()))
  const [filtros,   setFiltros]   = useState<BiTecnicaFiltros>(FILTROS_VAZIOS)
```

Logo após a linha `const { data, isLoading, isError, refetch, isFetching } = useBacklog(inicio, fim)`, adicione:

```tsx
  const dataFiltrado = useMemo(
    () => data ? filtrarBacklogRows(data, filtros) : undefined,
    [data, filtros]
  )
```

- [ ] **Step 4: Renderizar `FiltrosBiTecnica` e usar `dataFiltrado` nas abas**

Troque o bloco final:

```tsx
      {data && (
        <div className={`transition-opacity duration-200 ${isFetching ? 'opacity-60' : ''}`}>
          {tab === 'painel'     && <PainelTab data={data} />}
          {tab === 'instalacao' && <RevisitaTab data={data} tipo="instalacao" />}
          {tab === 'servico'    && <RevisitaTab data={data} tipo="servico" />}
          {tab === 'manutencao' && <RevisitaTab data={data} tipo="manutencao" />}
        </div>
      )}
```

por:

```tsx
      {data && (
        <div className={`space-y-4 transition-opacity duration-200 ${isFetching ? 'opacity-60' : ''}`}>
          <FiltrosBiTecnica rows={data.rows} filtros={filtros} onChange={setFiltros} />
          <div>
            {tab === 'painel'     && <PainelTab data={dataFiltrado} />}
            {tab === 'instalacao' && <RevisitaTab data={dataFiltrado} tipo="instalacao" />}
            {tab === 'servico'    && <RevisitaTab data={dataFiltrado} tipo="servico" />}
            {tab === 'manutencao' && <RevisitaTab data={dataFiltrado} tipo="manutencao" />}
          </div>
        </div>
      )}
```

Note que `FiltrosBiTecnica` recebe `data.rows` (bruto, sem filtro) pras opções dos dropdowns, enquanto as abas recebem `dataFiltrado` (já filtrado).

- [ ] **Step 5: Build + suíte completa**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx tsc --noEmit && npm test && npm run build
```

Esperado: type-check limpo, todos os testes passando, build sem erros.

- [ ] **Step 6: Rodar o audit de design system (não pule este passo — já causou falha de CI na entrega anterior)**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npm run audit:ds
```

Esperado: `audit:ds OK`. Se falhar por hex fora da baseline, adicione o hex à entrada do arquivo correspondente em `scripts/audit-ds-baseline.json` (siga o padrão dos outros arquivos já listados) — mas este componente não deveria introduzir nenhum hex novo (só reaproveita `FilterSelect`, que já usa classes Tailwind/tokens, sem hex inline).

- [ ] **Step 7: Commit**

```bash
git add src/features/erp/biGestaoTecnica/BiGestaoTecnicaPage.tsx
git commit -m "feat: integra FiltrosBiTecnica no shell do BI-Gestão Técnica"
```

---

## Task 4: Verificação final end-to-end

**Files:** nenhum (apenas verificação)

- [ ] **Step 1: Rodar toda a suíte de testes + build + audit**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && npx tsc --noEmit && npm test && npm run build && npm run audit:ds
```

Esperado: tudo passando, sem erros.

- [ ] **Step 2: Smoke test manual (se houver ferramenta de navegador disponível)**

Abra `/erp/bi-gestao-tecnica`, confirme que os 3 dropdowns aparecem, que trocar Cidade/Fornecedor/Equipe muda os números nas 4 abas, e que voltar pra "Todos" nos 3 restaura os números originais. Se não houver ferramenta de navegador disponível, registre isso explicitamente em vez de pular a verificação silenciosamente.

- [ ] **Step 3: Revisar o diff completo**

```bash
cd "C:\Users\Sergio Oliveira\Desktop\Claude\Sistemas\Cabonnet React" && git log --oneline -4
```

Esperado: 3 commits deste plano (Tasks 1-3), cada um com escopo único.
