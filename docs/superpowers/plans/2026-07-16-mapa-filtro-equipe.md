# Mapa — Filtro de Equipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um filtro de equipe no Menu Mapa que restringe todas as visualizações (heatmap, bolhas de cidade/bairro, ranking, painéis de detalhe, proximidade por endereço) às OS de uma equipe específica.

**Architecture:** Uma função pura `buildEquipeOptions` em `geo.ts` extrai a lista de equipes distintas de um conjunto de OS. `MapaPage.tsx` usa essa função para popular um novo `FilterSelect`, e inclui o filtro de equipe no `useMemo` de `rows` já existente — que é a única fonte de dados consumida por todo o resto da página (heatmap, agregações, ranking, painéis, proximidade). Nenhum outro arquivo precisa mudar.

**Tech Stack:** React + TypeScript, Vitest (testes), react-leaflet (mapa, não testado diretamente).

## Global Constraints

- Filtrar SEMPRE respeitando os dados já carregados via `useOSDerived()` — nenhuma nova chamada de API.
- `nomedaequipe` deve ser comparado após `.trim()` — o dado bruto pode ter espaços.
- Rótulos de equipe exibidos via `shortEquipe()` (já usado em todo o resto do app) — nunca o nome bruto.
- Seguir o padrão existente dos outros filtros da página (`statusOpts`, `tipoOpts`, `agingOpts`): primeira opção com `value: ''` representando "todas".
- Rodar `npm run build` e `npm run lint` antes de qualquer commit que toque `.tsx`/`.ts` (regra do projeto).

---

### Task 1: Função pura `buildEquipeOptions` em `geo.ts`

**Files:**
- Modify: `src/features/mapa/geo.ts`
- Test: `src/features/mapa/geo.test.ts` (novo arquivo)

**Interfaces:**
- Produces: `buildEquipeOptions(rows: OSRow[]): { value: string; label: string }[]` — exportado de `geo.ts`. Recebe uma lista de `OSRow`, retorna as equipes distintas (`nomedaequipe` trimado, não vazio), com `label` formatado via `shortEquipe()` e ordenado alfabeticamente por `label`. Não inclui nenhuma entrada "todas as equipes" — isso é responsabilidade de quem consome (Task 2).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/features/mapa/geo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildEquipeOptions } from './geo'
import type { OSRow } from '../../lib/types'

function makeOS(overrides: Record<string, unknown> = {}): OSRow {
  return {
    numos:           '0000001',
    nomecliente:     'CLIENTE TESTE',
    nomedacidade:    'TAUBATE',
    nomedaequipe:    'INST F01',
    tiposervico:     'INSTALACAO',
    servico:         'INSTALACAO RESIDENCIAL',
    descsituacao:    'Pendente',
    datacadastro:    '01/01/2026',
    dataagendamento: '',
    dataexecucao:    '',
    databaixa:       '',
    bairro:          'CENTRO',
    logradouro:      'RUA TESTE',
    complemento:     '',
    numero:          '1',
    empresa:         '',
    obs:             '',
    periodo:         '',
    ...overrides,
  } as unknown as OSRow
}

describe('buildEquipeOptions', () => {
  it('retorna lista vazia quando não há OS', () => {
    expect(buildEquipeOptions([])).toEqual([])
  })

  it('extrai equipes únicas, formatadas com shortEquipe e ordenadas por label', () => {
    const rows = [
      makeOS({ numos: 'A', nomedaequipe: 'INST F05' }),
      makeOS({ numos: 'B', nomedaequipe: 'INST F01' }),
      makeOS({ numos: 'C', nomedaequipe: 'INST F01' }), // duplicata, deve aparecer uma vez
    ]
    expect(buildEquipeOptions(rows)).toEqual([
      { value: 'INST F01', label: 'INST F01 - FELIPE' },
      { value: 'INST F05', label: 'INST F05 - JADIEL' },
    ])
  })

  it('ignora OS sem equipe (nulo, vazio ou só espaços) e trima o valor', () => {
    const rows = [
      makeOS({ numos: 'A', nomedaequipe: null }),
      makeOS({ numos: 'B', nomedaequipe: '' }),
      makeOS({ numos: 'C', nomedaequipe: '   ' }),
      makeOS({ numos: 'D', nomedaequipe: '  INST F01  ' }),
    ]
    expect(buildEquipeOptions(rows)).toEqual([{ value: 'INST F01', label: 'INST F01 - FELIPE' }])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/features/mapa/geo.test.ts`
Expected: FAIL — `buildEquipeOptions` não existe em `./geo` (erro de import/undefined).

- [ ] **Step 3: Implementar `buildEquipeOptions`**

Em `src/features/mapa/geo.ts`, adicionar o import de `shortEquipe` no topo do arquivo (junto ao import existente de `OSRow`):

```typescript
import type { OSRow } from '../../lib/types'
import { shortEquipe } from '../../lib/osFormat'
```

Adicionar a função no final do arquivo (depois de `buildHeatPoints`):

```typescript
export function buildEquipeOptions(rows: OSRow[]): { value: string; label: string }[] {
  const set = new Set<string>()
  for (const r of rows) {
    const eq = (r.nomedaequipe || '').trim()
    if (eq) set.add(eq)
  }
  return Array.from(set)
    .map(nome => ({ value: nome, label: shortEquipe(nome) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/features/mapa/geo.test.ts`
Expected: PASS — 3 testes passando.

- [ ] **Step 5: Commit**

```bash
git add src/features/mapa/geo.ts src/features/mapa/geo.test.ts
git commit -m "feat(mapa): adiciona buildEquipeOptions para extrair equipes distintas das OS"
```

---

### Task 2: Filtro de Equipe na UI do Mapa

**Files:**
- Modify: `src/features/mapa/MapaPage.tsx:8` (import), `:30-34` (state), `:81-104` (useMemo de `rows`), `:106` (novo `useMemo` de opções), `:246-248` (JSX da barra de filtros)

**Interfaces:**
- Consumes: `buildEquipeOptions(rows: OSRow[]): { value: string; label: string }[]` da Task 1.
- Produces: nenhuma nova interface pública — mudança contida em `MapaPage.tsx`.

- [ ] **Step 1: Importar `buildEquipeOptions`**

Em `src/features/mapa/MapaPage.tsx:8`, trocar:

```typescript
import { aggregateByCidade, aggregateByBairro, buildHeatPoints, type BairroAgg } from './geo'
```

por:

```typescript
import { aggregateByCidade, aggregateByBairro, buildHeatPoints, buildEquipeOptions, type BairroAgg } from './geo'
```

- [ ] **Step 2: Adicionar state `filterEquipe`**

Em `src/features/mapa/MapaPage.tsx:32`, logo abaixo de `filterAging`, adicionar:

```typescript
  const [filterAging,  setFilterAging]  = useState('')
  const [filterEquipe, setFilterEquipe] = useState('')
```

- [ ] **Step 3: Incluir o filtro de equipe no `useMemo` de `rows`**

Em `src/features/mapa/MapaPage.tsx:98-104`, o bloco atual é:

```typescript
    if (filterTipo)   r = r.filter(x => (x._tipo || '').toUpperCase() === filterTipo.toUpperCase())
    if (filterAging === '1-2')   r = r.filter(x => x._aging != null && x._aging <= 2)
    if (filterAging === '3-5')   r = r.filter(x => x._aging != null && x._aging >= 3  && x._aging <= 5)
    if (filterAging === '6-10')  r = r.filter(x => x._aging != null && x._aging >= 6  && x._aging <= 10)
    if (filterAging === '11+')   r = r.filter(x => x._aging != null && x._aging >= 11)
    return r
  }, [globalRows, filterStatus, filterTipo, filterAging])
```

Trocar por:

```typescript
    if (filterTipo)   r = r.filter(x => (x._tipo || '').toUpperCase() === filterTipo.toUpperCase())
    if (filterEquipe) r = r.filter(x => (x.nomedaequipe || '').trim() === filterEquipe)
    if (filterAging === '1-2')   r = r.filter(x => x._aging != null && x._aging <= 2)
    if (filterAging === '3-5')   r = r.filter(x => x._aging != null && x._aging >= 3  && x._aging <= 5)
    if (filterAging === '6-10')  r = r.filter(x => x._aging != null && x._aging >= 6  && x._aging <= 10)
    if (filterAging === '11+')   r = r.filter(x => x._aging != null && x._aging >= 11)
    return r
  }, [globalRows, filterStatus, filterTipo, filterEquipe, filterAging])
```

- [ ] **Step 4: Adicionar `equipeOpts` derivado de `globalRows`**

Em `src/features/mapa/MapaPage.tsx:106`, imediatamente antes da linha `const cidades    = useMemo(() => aggregateByCidade(rows), [rows])`, adicionar:

```typescript
  const equipeOpts = useMemo(() => [
    { value: '', label: 'Todas as equipes' },
    ...buildEquipeOptions(globalRows || []),
  ], [globalRows])

```

(As opções vêm de `globalRows`, não de `rows`, para que a lista de equipes disponíveis no filtro não encolha conforme outros filtros — como Status — são aplicados.)

- [ ] **Step 5: Adicionar o `FilterSelect` de equipe na barra de filtros**

Em `src/features/mapa/MapaPage.tsx:246-248`, o bloco atual é:

```typescript
        <FilterSelect value={filterStatus} onChange={setFilterStatus} options={statusOpts} placeholder="Status" />
        <FilterSelect value={filterTipo}   onChange={setFilterTipo}   options={tipoOpts}   placeholder="Tipo" />
        <FilterSelect value={filterAging}  onChange={setFilterAging}  options={agingOpts}  placeholder="Aging" />
```

Trocar por:

```typescript
        <FilterSelect value={filterStatus} onChange={setFilterStatus} options={statusOpts} placeholder="Status" />
        <FilterSelect value={filterTipo}   onChange={setFilterTipo}   options={tipoOpts}   placeholder="Tipo" />
        <FilterSelect value={filterEquipe} onChange={setFilterEquipe} options={equipeOpts} placeholder="Equipe" />
        <FilterSelect value={filterAging}  onChange={setFilterAging}  options={agingOpts}  placeholder="Aging" />
```

- [ ] **Step 6: Checagem de tipos e lint**

Run: `npm run build`
Expected: build sem erros de TypeScript (sem imports não usados, sem tipos incompatíveis).

Run: `npm run lint`
Expected: sem erros de lint.

- [ ] **Step 7: Verificação manual no navegador**

Run: `npm run dev`

No navegador (`http://localhost:3000/mapa`):
1. Confirmar que o novo seletor "Equipe" aparece na barra de filtros, entre "Tipo" e "Aging".
2. Selecionar uma equipe com OS ativas — confirmar que o heatmap/bolhas, o ranking lateral e os KPIs inline (topo da barra) passam a refletir só as OS dessa equipe.
3. Com a equipe ainda selecionada, buscar um endereço no campo de busca — confirmar que o painel de proximidade mostra só a equipe selecionada (ou "nenhuma equipe" se ela não tiver OS nos bairros próximos).
4. Voltar o seletor para "Todas as equipes" — confirmar que o mapa volta a mostrar todas as OS normalmente.

- [ ] **Step 8: Commit**

```bash
git add src/features/mapa/MapaPage.tsx
git commit -m "feat(mapa): adiciona filtro de equipe na barra de filtros do mapa"
```

---

## Self-Review Notes

- **Cobertura da spec:** "novo FilterSelect de Equipe" → Task 2 Step 5. "opções derivadas de globalRows, ordenadas alfabeticamente, label via shortEquipe" → Task 1. "filtro entra no useMemo de rows" → Task 2 Step 3. "nenhuma mudança em MapaComponents.tsx ou geo.ts além da nova função" → confirmado, só `geo.ts` ganha a função nova, `MapaComponents.tsx` não é tocado.
- **Sem placeholders:** todos os steps têm código completo, nenhum "TODO"/"implementar depois".
- **Consistência de tipos:** `buildEquipeOptions` retorna `{ value: string; label: string }[]`, mesmo formato que `FilterSelect` espera (`Option[]` com `value`/`label`) e que `tipoOpts`/`statusOpts`/`agingOpts` já usam na mesma página.
