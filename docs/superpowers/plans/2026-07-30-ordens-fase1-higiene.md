# Ordens — Fase 1 (Higiene) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar os quatro defeitos que tornam os números do menu Ordens contestáveis — KPIs que ignoram os filtros ativos, toggle de Rede duplicado e enganoso, drill-down destrutivo e estado morto de ordenação.

**Architecture:** Toda a lógica de filtragem vive hoje dentro de um `useMemo` no hook `useOrdens`, inacessível para testes e impossível de reaproveitar. O plano extrai essa cadeia para uma função pura exportada (`aplicarFiltros`) e a reutiliza para calcular os KPIs de agenda — que hoje são computados sobre `allRows` e por isso não respeitam nenhum filtro. As demais tasks são remoções: estado morto e UI redundante. Nenhuma task adiciona funcionalidade nova; todas reduzem código.

**Tech Stack:** React 19 + TypeScript, Zustand (`uiStore`), Vitest, Vite, Tailwind.

## Global Constraints

- Responder e comentar código em **português**. Comentários explicam **por quê**, não o quê.
- Indentação de **2 espaços**, sem tabs. Sem imports com wildcard.
- `npm run build` (que roda `tsc` via Vite) **deve passar antes de cada commit** — regra de `rules/frontend-react/FRONTEND.md`. Imports e variáveis órfãs após remoção de JSX são erro de build (`TS6133`), não aviso.
- `npm test` deve passar antes de cada commit.
- Não alterar `src/contexts/OSDataContext.tsx` nem `src/store/uiStore.ts` — o filtro global de Rede já funciona lá e é a fonte da verdade.
- Nenhuma task pode alterar o significado dos KPIs `Total`, `Críticas`, `Sem equipe`, `Agend. hoje`, `Instalação`, `Manutenção`, `Serviço`. Só os de agenda (`Amanhã`/`Futuro`) mudam, e mudam por serem defeituosos.
- Ordem das tasks é obrigatória: a Task 3 extrai a cadeia de filtros já **sem** `hideRede`, o que só é válido depois da Task 2.

## Decisão de produto registrada (Task 4)

Hoje "Agend. Futuro" significa *amanhã em diante* e portanto **contém** "Amanhã" — dois cards lado a lado onde um é subconjunto do outro, cuja soma não fecha. Este plano os torna **disjuntos**: `Amanhã` = exatamente amanhã; `Após amanhã` = de depois de amanhã em diante. Se a operação preferir manter o card acumulado, pare antes da Task 4 e reavalie — as Tasks 1-3 e 5 são independentes dessa escolha.

---

### Task 1: Remover o estado morto `sortBy`

`sortBy` (`useOrdens.ts:102`) só admite o valor `'agendamento'`; `setSortBy` é exportado e nunca chamado por nenhum consumidor. Remover o estado sem alterar comportamento: a ordenação por agendamento passa a ser incondicional, que é exatamente o que já acontecia.

**Files:**
- Modify: `src/hooks/useOrdens.ts` (linhas 102, 165-174, 196, 229, 248)

**Interfaces:**
- Consumes: nada.
- Produces: o retorno de `useOrdens()` deixa de expor `sortBy` e `setSortBy`. Nenhum consumidor usa esses campos (confirmado por grep na Step 1).

- [x] **Step 1: Confirmar que ninguém consome `sortBy`**

Run:
```bash
grep -rn "\.sortBy\|setSortBy" src --include=*.tsx --include=*.ts
```
Expected: apenas ocorrências dentro de `src/hooks/useOrdens.ts`. Se aparecer qualquer outro arquivo, **pare** e reporte — o plano assumiu que não há consumidores.

- [x] **Step 2: Rodar a suíte para registrar o baseline verde**

Run: `npm test`
Expected: PASS. Anote o número de testes; ele não pode diminuir ao fim da task.

- [x] **Step 3: Remover a declaração do estado**

Em `src/hooks/useOrdens.ts`, apague a linha:
```ts
  const [sortBy,      setSortBy]      = useState('agendamento')
```

- [x] **Step 4: Tornar a ordenação por agendamento incondicional**

Substitua o bloco condicional:
```ts
    if (sortBy === 'agendamento') {
      r = [...r].sort((a, b) => {
        const da = parseAgend(a.dataagendamento as string)
        const db = parseAgend(b.dataagendamento as string)
        if (!da && !db) return 0
        if (!da) return 1
        if (!db) return -1
        return da.getTime() - db.getTime()
      })
    }
```
por:
```ts
    // Ordem base sempre por agendamento. O sort por coluna abaixo aplica em
    // cima disto e, como Array.sort é estável, o agendamento continua sendo o
    // critério de desempate dentro de valores iguais.
    r = [...r].sort((a, b) => {
      const da = parseAgend(a.dataagendamento as string)
      const db = parseAgend(b.dataagendamento as string)
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return da.getTime() - db.getTime()
    })
```

- [x] **Step 5: Remover `sortBy` do array de dependências**

Localize o array de deps do `useMemo` de `filtered` e apague a entrada `sortBy`:
```ts
  }, [baseOrdens, search, status, reagendTipo, tipo, cidade, bairro, equipe, fornecedor, tipoOs, periodo, semEquipe, agendHoje, aging, critico, hideRede, tableSort])
```

- [x] **Step 6: Remover de `clearFilters` e do retorno do hook**

Em `clearFilters`, troque:
```ts
    setHideRede(false); setSortBy('agendamento'); setTableSort({ key: null, dir: 'asc' })
```
por:
```ts
    setHideRede(false); setTableSort({ key: null, dir: 'asc' })
```

No objeto retornado, apague a linha:
```ts
    sortBy, setSortBy,
```

- [x] **Step 7: Rodar testes e build**

Run: `npm test`
Expected: PASS, mesmo número de testes do Step 2.

Run: `npm run build`
Expected: build conclui sem erros de TypeScript.

- [x] **Step 8: Commit**

```bash
git add src/hooks/useOrdens.ts
git commit -m "refactor: remove estado morto sortBy do hook de ordens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Unificar o filtro de Rede no `uiStore`

Existem dois `hideRede`. O global (`uiStore.ts:90`, default `true`) já remove as OS de Rede em `OSDataContext.tsx:182-183`, **antes** de o hook receber os dados — e tem seu próprio botão em `DateFilterBar.tsx:194`. O local (`useOrdens.ts:101`, default `false`) pinta um botão verde "Rede ON", sugerindo que Rede está visível quando ela já foi removida upstream. Remover o local.

**Files:**
- Modify: `src/hooks/useOrdens.ts` (linhas 101, 148, 196, 229, 235, 247)
- Modify: `src/features/ordens/OrdensPage.tsx` (linhas 438-449, 466)

**Interfaces:**
- Consumes: o filtro global de Rede continua em `useUIStore().hideRede`, aplicado por `OSDataContext`. Nada a fazer nesses arquivos.
- Produces: o retorno de `useOrdens()` deixa de expor `hideRede` e `setHideRede`.

- [x] **Step 1: Confirmar que o único consumidor do `hideRede` local é a OrdensPage**

Run:
```bash
grep -rn "os\.hideRede\|os\.setHideRede" src --include=*.tsx
```
Expected: apenas `src/features/ordens/OrdensPage.tsx`, nas linhas do botão (≈443, 447, 448) e do chip do banner (≈466).

- [x] **Step 2: Remover o botão "Rede ON/OFF" da página**

Em `src/features/ordens/OrdensPage.tsx`, apague o bloco inteiro, incluindo o comentário:
```tsx
        {/* Toggle Rede */}
        <button
          onClick={() => os.setHideRede(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-semibold
                      border transition-all duration-fast flex-shrink-0
                      ${os.hideRede
                        ? 'bg-red/[0.08] border-red/20 text-red/80 hover:bg-red/[0.14]'
                        : 'bg-green/[0.08] border-green/20 text-green hover:bg-green/[0.14]'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${os.hideRede ? 'bg-red/70' : 'bg-green'}`} />
          Rede {os.hideRede ? 'OFF' : 'ON'}
        </button>

```

- [x] **Step 3: Remover o chip "Rede oculta" do banner de filtros ativos**

Apague a linha:
```tsx
            {os.hideRede     && <span className="rounded-full px-2 py-0.5 text-caption font-bold bg-red/10 text-red/80 border border-red/20">Rede oculta</span>}
```

- [x] **Step 4: Remover o estado e o filtro do hook**

Em `src/hooks/useOrdens.ts`:

Apague a declaração:
```ts
  const [hideRede,    setHideRede]    = useState(false)
```

Apague a linha da cadeia de filtros:
```ts
    if (hideRede)   r = r.filter(x => x._fornecedor !== 'REDE')
```

No array de deps do `useMemo` de `filtered`, apague a entrada `hideRede`.

Em `clearFilters`, troque:
```ts
    setHideRede(false); setTableSort({ key: null, dir: 'asc' })
```
por:
```ts
    setTableSort({ key: null, dir: 'asc' })
```

Em `filtersActive`, troque:
```ts
    tipoOs || periodo || semEquipe || agendHoje || agendAmanha || agendFuturo || critico || hideRede || tableSort.key
```
por:
```ts
    tipoOs || periodo || semEquipe || agendHoje || agendAmanha || agendFuturo || critico || tableSort.key
```

No objeto retornado, apague a linha:
```ts
    hideRede, setHideRede,
```

- [x] **Step 5: Não remover a opção "Rede" do select Fornecedor**

Verifique que `fornecedorOptions` em `OrdensPage.tsx` mantém `{ value: 'REDE', label: 'Rede' }`. Ela é legítima: quando o usuário desliga o toggle global na `DateFilterBar`, as OS de Rede voltam ao dataset e o filtro passa a ter resultado. Nenhuma edição nesta step — apenas confirmação.

- [x] **Step 6: Rodar testes e build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: build sem erros. Atenção a `TS6133` — se o botão removido era o único uso de algum ícone importado, o import ficou órfão e o build falha. Neste caso não há ícone dedicado (o botão usava só `<span>`), mas confirme a mensagem do build.

- [x] **Step 7: Verificação manual (não há teste unitário para remoção de UI)**

> Substituída por verificação estática — ver "Verificação final da Fase 1".

Run: `npm run dev` e abra `http://localhost:3000/ordens`.

Confirme, nesta ordem:
1. Em "Mais filtros" não existe mais o botão `Rede ON/OFF`.
2. O botão de Rede da barra de data (topo da tela) continua funcionando: ao clicar, a contagem total de OS muda.
3. Com o toggle global **desligado** (Rede visível), o select `Fornecedor → Rede` retorna linhas.
4. Com o toggle global **ligado** (padrão), o mesmo select retorna zero — comportamento correto, pois as linhas não existem mais no dataset.

- [x] **Step 8: Commit**

```bash
git add src/hooks/useOrdens.ts src/features/ordens/OrdensPage.tsx
git commit -m "fix: remove toggle de Rede duplicado da pagina de ordens

O filtro global do uiStore ja remove as OS de Rede no OSDataContext antes
do hook receber os dados. O toggle local exibia 'Rede ON' (verde) enquanto
as linhas ja haviam sido removidas upstream.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Extrair `aplicarFiltros` como função pura testável

A cadeia de filtros está presa dentro de um `useMemo` e por isso não pode ser testada nem reutilizada — é a razão de os KPIs de agenda terem sido escritos sobre `allRows` na Task 4. Extrair sem mudar comportamento.

**Files:**
- Modify: `src/hooks/useOrdens.ts`
- Test: `src/hooks/useOrdens.test.ts`

**Interfaces:**
- Consumes: `matchesOSSearch(row, query)`, `isAgendadaEm(row, diaBR)`, `dataBR(d?)` — já exportados do mesmo arquivo. `getReagendTipo(row)` de `../lib/transform`.
- Produces:
  - `export interface OrdensFiltros` com os campos `search, status, reagendTipo, tipo, cidade, bairro, equipe, fornecedor, tipoOs, periodo, aging` (todos `string`) e `semEquipe, critico, agendHoje` (todos `boolean`).
  - `export function matchesAgingFaixa(aging: number, faixa: string): boolean`
  - `export function aplicarFiltros(rows: OSRow[], f: OrdensFiltros, hoje?: string): OSRow[]` — `hoje` no formato `DD/MM/YYYY`, default `dataBR()`. A Task 4 consome essa assinatura.

- [x] **Step 1: Escrever os testes que falham**

Em `src/hooks/useOrdens.test.ts`, adicione ao import da linha 2 os três novos símbolos:
```ts
import { withCopeQuandoPendente, splitAgendaFutura, isAgendadaEm, dataBR, matchesOSSearch, aplicarFiltros, matchesAgingFaixa, type OrdensFiltros } from './useOrdens'
```

Apague o helper local duplicado (linhas ≈49-56), que agora vira import:
```ts
// Utilitário para filtro de aging (idêntico ao do hook)
function matchesAging(aging: number, filter: string): boolean {
  if (filter === '1')  return aging <= 1
  if (filter === '2')  return aging <= 2
  if (filter === '3')  return aging >= 3 && aging <= 5
  if (filter === '6')  return aging >= 6
  if (filter === '11') return aging >= 11
  return true
}
```

No `describe('matchesAging — filtro de aging', ...)` existente, troque todas as chamadas `matchesAging(` por `matchesAgingFaixa(`. São 12 chamadas em 6 testes.

Acrescente ao final do arquivo:
```ts
describe('aplicarFiltros — cadeia de filtros da página de Ordens', () => {
  const VAZIO: OrdensFiltros = {
    search: '', status: '', reagendTipo: '', tipo: '', cidade: '', bairro: '',
    equipe: '', fornecedor: '', tipoOs: '', periodo: '', aging: '',
    semEquipe: false, critico: false, agendHoje: false,
  }

  const rows = enrichRows([
    makeOS({ numos: '0000001', nomedacidade: 'TAUBATE',  nomedaequipe: 'EQUIPE F01' }),
    makeOS({ numos: '0000002', nomedacidade: 'CACAPAVA', nomedaequipe: 'EQUIPE F08' }),
    makeOS({ numos: '0000003', nomedacidade: 'TAUBATE',  nomedaequipe: '' }),
  ])

  it('sem nenhum filtro devolve a lista intacta', () => {
    expect(aplicarFiltros(rows, VAZIO)).toHaveLength(3)
  })

  it('filtra por cidade', () => {
    const r = aplicarFiltros(rows, { ...VAZIO, cidade: 'TAUBATE' })
    expect(r.map(x => x.numos)).toEqual(['0000001', '0000003'])
  })

  it('filtra por equipe', () => {
    const r = aplicarFiltros(rows, { ...VAZIO, equipe: 'EQUIPE F08' })
    expect(r.map(x => x.numos)).toEqual(['0000002'])
  })

  it('semEquipe pega apenas OS sem alocação', () => {
    const r = aplicarFiltros(rows, { ...VAZIO, semEquipe: true })
    expect(r.map(x => x.numos)).toEqual(['0000003'])
  })

  it('filtros combinam por interseção, não por substituição', () => {
    const r = aplicarFiltros(rows, { ...VAZIO, cidade: 'TAUBATE', semEquipe: true })
    expect(r.map(x => x.numos)).toEqual(['0000003'])
  })

  it('agendHoje usa a data BR injetada, não o relógio do sistema', () => {
    const hoje = dataBR()
    const comHoje = enrichRows([
      makeOS({ numos: '0000004', dataagendamento: `${hoje} 08:00` }),
      makeOS({ numos: '0000005', dataagendamento: '01/01/2020' }),
    ])
    const r = aplicarFiltros(comHoje, { ...VAZIO, agendHoje: true }, hoje)
    expect(r.map(x => x.numos)).toEqual(['0000004'])
  })

  it('não muta o array de entrada', () => {
    const antes = rows.map(r => r.numos)
    aplicarFiltros(rows, { ...VAZIO, cidade: 'TAUBATE' })
    expect(rows.map(r => r.numos)).toEqual(antes)
  })
})
```

- [x] **Step 2: Rodar os testes para verificar que falham**

Run: `npx vitest run src/hooks/useOrdens.test.ts`
Expected: FAIL com erro de import — `aplicarFiltros` / `matchesAgingFaixa` não existem em `./useOrdens`.

- [x] **Step 3: Implementar as funções puras**

Em `src/hooks/useOrdens.ts`, logo **acima** de `export function useOrdens()`, acrescente:
```ts
export interface OrdensFiltros {
  search:      string
  status:      string
  reagendTipo: string
  tipo:        string
  cidade:      string
  bairro:      string
  equipe:      string
  fornecedor:  string
  tipoOs:      string
  periodo:     string
  aging:       string
  semEquipe:   boolean
  critico:     boolean
  agendHoje:   boolean
}

export function matchesAgingFaixa(aging: number, faixa: string): boolean {
  if (faixa === '1')  return aging <= 1
  if (faixa === '2')  return aging <= 2
  if (faixa === '3')  return aging >= 3 && aging <= 5
  if (faixa === '6')  return aging >= 6
  if (faixa === '11') return aging >= 11
  return true
}

// Função pura para que os KPIs possam contar exatamente o mesmo recorte que a
// tabela mostra. Enquanto esta cadeia viveu dentro do useMemo, os cards de
// agenda foram escritos sobre allRows e passaram a ignorar todos os filtros.
export function aplicarFiltros(rows: OSRow[], f: OrdensFiltros, hoje: string = dataBR()): OSRow[] {
  let r = rows
  if (f.search)      r = r.filter(x => matchesOSSearch(x, f.search))
  if (f.status)      r = r.filter(x => x._situacaoEfetiva === f.status)
  if (f.reagendTipo) r = r.filter(x => getReagendTipo(x) === f.reagendTipo)
  if (f.tipo)        r = r.filter(x => x.tiposervico === f.tipo)
  if (f.cidade)      r = r.filter(x => x.nomedacidade === f.cidade)
  if (f.bairro)      r = r.filter(x => x.bairro === f.bairro)
  if (f.equipe)      r = r.filter(x => x.nomedaequipe === f.equipe)
  if (f.fornecedor)  r = r.filter(x => x._fornecedor === f.fornecedor)
  if (f.tipoOs)      r = r.filter(x => x._tipo === f.tipoOs)
  if (f.periodo)     r = r.filter(x => ((x.periodo as string) || '').trim().toLowerCase() === f.periodo.toLowerCase())
  if (f.semEquipe)   r = r.filter(x => !x.nomedaequipe)
  if (f.critico)     r = r.filter(x => x._slaCritico)
  if (f.agendHoje)   r = r.filter(x => isAgendadaEm(x, hoje))
  if (f.aging)       r = r.filter(x => matchesAgingFaixa(x._aging ?? x._agingAbertura ?? 0, f.aging))
  return r
}
```

- [x] **Step 4: Rodar os testes para verificar que passam**

Run: `npx vitest run src/hooks/useOrdens.test.ts`
Expected: PASS, incluindo os 7 testes novos de `aplicarFiltros` e os 6 de `matchesAgingFaixa`.

- [x] **Step 5: Fazer o hook consumir a função extraída**

Dentro de `useOrdens()`, acrescente logo **antes** do `useMemo` de `filtered`:
```ts
  const filtros: OrdensFiltros = useMemo(() => ({
    search, status, reagendTipo, tipo, cidade, bairro, equipe,
    fornecedor, tipoOs, periodo, aging, semEquipe, critico, agendHoje,
  }), [search, status, reagendTipo, tipo, cidade, bairro, equipe,
       fornecedor, tipoOs, periodo, aging, semEquipe, critico, agendHoje])
```

Substitua o corpo do `useMemo` de `filtered` — da linha `let r = baseOrdens` até o fim do bloco `if (aging) { ... }` — por uma única chamada, preservando os dois blocos de ordenação que vêm depois:
```ts
  const filtered = useMemo(() => {
    let r = aplicarFiltros(baseOrdens, filtros)

    // Ordem base sempre por agendamento. O sort por coluna abaixo aplica em
    // cima disto e, como Array.sort é estável, o agendamento continua sendo o
    // critério de desempate dentro de valores iguais.
    r = [...r].sort((a, b) => {
      const da = parseAgend(a.dataagendamento as string)
      const db = parseAgend(b.dataagendamento as string)
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return da.getTime() - db.getTime()
    })

    // Sort por coluna sobre o CONJUNTO filtrado — dentro do DataTable ordenaria
    // só a página de 50: "ordenar por Risco" não traria as piores do conjunto.
    if (tableSort.key) {
      const k = tableSort.key
      const val = (x: OSRow): number | string => {
        if (k === '_aging')          return (x._aging ?? x._agingAbertura ?? -1)
        if (k === 'dataagendamento') return parseAgend(x.dataagendamento as string)?.getTime() ?? Number.MAX_SAFE_INTEGER
        const v = x[k]
        return typeof v === 'number' ? v : String(v ?? '')
      }
      r = [...r].sort((a, b) => {
        const av = val(a), bv = val(b)
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true })
        return tableSort.dir === 'asc' ? cmp : -cmp
      })
    }

    return r
  }, [baseOrdens, filtros, tableSort])
```

- [x] **Step 6: Verificar que `getReagendTipo` continua importado**

`aplicarFiltros` usa `getReagendTipo`, que já é importado na linha 3 de `useOrdens.ts` (`import { isReagend, getReagendTipo, isCOPE } from '../lib/transform'`). Confirme que o import continua intacto — o `useMemo` antigo era o único outro uso e ele foi substituído.

- [x] **Step 7: Rodar suíte completa e build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: sem erros.

- [x] **Step 8: Verificação manual de não-regressão**

> Substituída pelos 7 testes unitários de `aplicarFiltros` — ver "Verificação final da Fase 1".

Run: `npm run dev`, abra `/ordens` e confirme que cada filtro ainda funciona: busca por texto, Status, Cidade, Equipe, e dentro de "Mais filtros" — Tipo, Bairro, Aging, Fornecedor, Período. A contagem no banner "Exibindo X de Y" deve mudar a cada filtro.

- [x] **Step 9: Commit**

```bash
git add src/hooks/useOrdens.ts src/hooks/useOrdens.test.ts
git commit -m "refactor: extrai aplicarFiltros como funcao pura testavel

A cadeia de filtros vivia dentro de um useMemo, sem teste e sem como ser
reusada. E por nao ser reusavel que os KPIs de agenda foram escritos sobre
allRows.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: KPIs de agenda passam a respeitar os filtros e viram disjuntos

Hoje `agendAmanha` e `agendFuturo` vêm de `splitAgendaFutura(allRows)` e ignoram todos os filtros — quatro cards da mesma linha respondem ao filtro e dois não. Além disso "Futuro" contém "Amanhã". Esta task corrige os dois defeitos.

**Files:**
- Modify: `src/hooks/useOrdens.ts`
- Modify: `src/features/ordens/OrdensPage.tsx` (cards "Amanhã" e "Agend. Futuro")
- Test: `src/hooks/useOrdens.test.ts`

**Interfaces:**
- Consumes: `aplicarFiltros(rows, f, hoje?)` e `OrdensFiltros` da Task 3.
- Produces: `splitAgendaFutura(allRows)` passa a retornar `{ amanhaOrdens: OSRow[]; posAmanhaOrdens: OSRow[] }` — a chave `futuroOrdens` **deixa de existir**. O KPI exposto continua chamando-se `agendFuturo` e o estado `agendFuturo`/`setAgendFuturo` permanece, para não quebrar a Task 5.

- [x] **Step 1: Escrever os testes que falham**

Em `src/hooks/useOrdens.test.ts`, substitua o bloco `describe('splitAgendaFutura — agenda de amanhã em diante', ...)` inteiro por:
```ts
describe('splitAgendaFutura — amanhã e após amanhã, disjuntos', () => {
  function emDias(n: number): string {
    const d = new Date(); d.setDate(d.getDate() + n)
    return dataBR(d)
  }

  it('inclui Pendente e Atendimento agendadas para amanhã', () => {
    const rows = enrichRows([
      makeOS({ numos: 'P1', descsituacao: 'Pendente',    dataagendamento: emDias(1) }),
      makeOS({ numos: 'A1', descsituacao: 'Atendimento', dataagendamento: emDias(1) }),
    ])
    const { amanhaOrdens, posAmanhaOrdens } = splitAgendaFutura(rows)
    expect(amanhaOrdens).toHaveLength(2)
    expect(posAmanhaOrdens).toHaveLength(0)
  })

  it('amanhã e após amanhã não se sobrepõem', () => {
    const rows = enrichRows([
      makeOS({ numos: 'A1', descsituacao: 'Pendente', dataagendamento: emDias(1) }),
      makeOS({ numos: 'D2', descsituacao: 'Pendente', dataagendamento: emDias(2) }),
      makeOS({ numos: 'D9', descsituacao: 'Pendente', dataagendamento: emDias(9) }),
    ])
    const { amanhaOrdens, posAmanhaOrdens } = splitAgendaFutura(rows)
    expect(amanhaOrdens.map(r => r.numos)).toEqual(['A1'])
    expect(posAmanhaOrdens.map(r => r.numos)).toEqual(['D2', 'D9'])
    const intersecao = amanhaOrdens.filter(a => posAmanhaOrdens.some(p => p.numos === a.numos))
    expect(intersecao).toHaveLength(0)
  })

  it('exclui COPE, reagendamento e concluídas com data futura', () => {
    const rows = enrichRows([
      makeOS({ numos: 'C1', nomedaequipe: 'COPE VALE',         dataagendamento: emDias(1) }),
      makeOS({ numos: 'R1', nomedaequipe: 'REAGENDAMENTO F01', dataagendamento: emDias(1) }),
      makeOS({ numos: 'X1', descsituacao: 'Concluída',         dataagendamento: emDias(1) }),
      makeOS({ numos: 'P1', descsituacao: 'Pendente',          dataagendamento: emDias(1) }),
    ])
    const { amanhaOrdens } = splitAgendaFutura(rows)
    expect(amanhaOrdens.map(r => r.numos)).toEqual(['P1'])
  })

  it('agendamento de hoje ou passado não entra em nenhum dos dois', () => {
    const rows = enrichRows([
      makeOS({ numos: 'H1', descsituacao: 'Pendente', dataagendamento: dataBR() }),
      makeOS({ numos: 'V1', descsituacao: 'Pendente', dataagendamento: '01/01/2020' }),
    ])
    const { amanhaOrdens, posAmanhaOrdens } = splitAgendaFutura(rows)
    expect(amanhaOrdens).toHaveLength(0)
    expect(posAmanhaOrdens).toHaveLength(0)
  })

  it('o recorte de agenda é filtrável por aplicarFiltros — base dos KPIs corrigidos', () => {
    const rows = enrichRows([
      makeOS({ numos: 'T1', descsituacao: 'Pendente', nomedacidade: 'TAUBATE',  dataagendamento: emDias(1) }),
      makeOS({ numos: 'C1', descsituacao: 'Pendente', nomedacidade: 'CACAPAVA', dataagendamento: emDias(1) }),
    ])
    const { amanhaOrdens } = splitAgendaFutura(rows)
    const soTaubate = aplicarFiltros(amanhaOrdens, {
      search: '', status: '', reagendTipo: '', tipo: '', cidade: 'TAUBATE', bairro: '',
      equipe: '', fornecedor: '', tipoOs: '', periodo: '', aging: '',
      semEquipe: false, critico: false, agendHoje: false,
    })
    expect(soTaubate.map(r => r.numos)).toEqual(['T1'])
  })
})
```

- [x] **Step 2: Rodar os testes para verificar que falham**

Run: `npx vitest run src/hooks/useOrdens.test.ts`
Expected: FAIL — `posAmanhaOrdens` é `undefined`, erro do tipo "Cannot read properties of undefined (reading 'map')" ou `expected undefined to have length 0`.

- [x] **Step 3: Tornar `splitAgendaFutura` disjunta**

Em `src/hooks/useOrdens.ts`, substitua a função inteira (comentário incluído) por:
```ts
// Agenda futura = OS ATIVAS com agendamento à frente de hoje. Sem o filtro de
// situação, COPE, reagendamentos e até concluídas adiantadas inflavam os KPIs
// (mesma correção da aba Cidades).
//
// Os dois baldes são DISJUNTOS: antes "futuro" significava "amanhã em diante" e
// portanto continha "amanhã" — dois cards lado a lado onde um era subconjunto
// do outro e cuja soma não fechava.
export function splitAgendaFutura(allRows: OSRow[]): { amanhaOrdens: OSRow[]; posAmanhaOrdens: OSRow[] } {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1)
  const posAmanha = new Date(hoje); posAmanha.setDate(hoje.getDate() + 2)
  const amanhaOrdens: OSRow[] = [], posAmanhaOrdens: OSRow[] = []
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r)) continue
    if (!['Pendente', 'Atendimento'].includes(r.descsituacao)) continue
    const raw = ((r.dataagendamento as string) || '').split(' ')[0]
    if (!raw) continue
    const parts = raw.split('/')
    if (parts.length !== 3) continue
    const d = new Date(+parts[2], +parts[1] - 1, +parts[0])
    if (d >= posAmanha) {
      posAmanhaOrdens.push(r)
    } else if (d >= amanha) {
      amanhaOrdens.push(r)
    }
  }
  return { amanhaOrdens, posAmanhaOrdens }
}
```

- [x] **Step 4: Rodar os testes para verificar que passam**

Run: `npx vitest run src/hooks/useOrdens.test.ts`
Expected: PASS.

- [x] **Step 5: Atualizar o consumo dentro do hook**

Em `useOrdens()`, troque a desestruturação:
```ts
  const { amanhaOrdens, futuroOrdens } = useMemo(() => splitAgendaFutura(allRows), [allRows])
```
por:
```ts
  const { amanhaOrdens, posAmanhaOrdens } = useMemo(() => splitAgendaFutura(allRows), [allRows])
```

E a seleção da base:
```ts
  const baseOrdens: OSRow[] = agendAmanha
    ? amanhaOrdens
    : agendFuturo
      ? futuroOrdens
      : verReagend
        ? reagendOrdens
        : ordensComCope
```
por:
```ts
  const baseOrdens: OSRow[] = agendAmanha
    ? amanhaOrdens
    : agendFuturo
      ? posAmanhaOrdens
      : verReagend
        ? reagendOrdens
        : ordensComCope
```

- [x] **Step 6: Fazer os KPIs de agenda respeitarem os filtros**

Substitua o `useMemo` de `kpis` inteiro por:
```ts
  const kpis = useMemo(() => {
    const hojeBR = dataBR()
    let criticas = 0, semEquipeCount = 0, agendHojeCount = 0, instalacao = 0, manutencao = 0, servico = 0
    for (const r of filtered) {
      // Mesma régua do resto do sistema (e do deep-link do Dashboard): > 2× o SLA
      if (r._slaCritico) criticas++
      if (!r.nomedaequipe) semEquipeCount++
      if (isAgendadaEm(r, hojeBR)) agendHojeCount++
      if (r._tipo === 'INSTALACAO') instalacao++
      else if (r._tipo === 'MANUTENCAO') manutencao++
      else if (r._tipo === 'OUTRO') servico++   // REDE não é serviço
    }

    // Os cards de agenda contam o MESMO recorte de filtros que a tabela mostra.
    // Os três toggles de agenda são zerados porque definem qual base está sendo
    // olhada — deixá-los ligados faria o recorte filtrar a si mesmo e zerar.
    const filtrosAgenda: OrdensFiltros = { ...filtros, agendHoje: false }

    return {
      total:       filtered.length,
      criticas,
      semEquipe:   semEquipeCount,
      agendHoje:   agendHojeCount,
      agendAmanha: aplicarFiltros(amanhaOrdens,    filtrosAgenda, hojeBR).length,
      agendFuturo: aplicarFiltros(posAmanhaOrdens, filtrosAgenda, hojeBR).length,
      instalacao, manutencao, servico,
    }
  }, [filtered, amanhaOrdens, posAmanhaOrdens, filtros])
```

- [x] **Step 7: Atualizar os rótulos dos dois cards na página**

Em `src/features/ordens/OrdensPage.tsx`, substitua:
```tsx
          <StatCard
            title="Amanhã" value={os.kpis.agendAmanha} icon={ORDENS_CARD_ICONS.agendAmanha}
            sub="ativas p/ amanhã · geral" delay={160}
            onClick={() => { os.clearFilters(); os.setAgendAmanha(true); scrollToTable() }}
          />
          <StatCard
            title="Agend. Futuro" value={os.kpis.agendFuturo} tone="warning" icon={ORDENS_CARD_ICONS.agendFuturo}
            sub="ativas, amanhã em diante · geral" delay={200}
            onClick={() => { os.clearFilters(); os.setAgendFuturo(true); scrollToTable() }}
          />
```
por:
```tsx
          <StatCard
            title="Amanhã" value={os.kpis.agendAmanha} icon={ORDENS_CARD_ICONS.agendAmanha}
            sub="agendadas para amanhã" delay={160}
            onClick={() => { os.clearFilters(); os.setAgendAmanha(true); scrollToTable() }}
          />
          <StatCard
            title="Após amanhã" value={os.kpis.agendFuturo} tone="warning" icon={ORDENS_CARD_ICONS.agendFuturo}
            sub="de depois de amanhã em diante" delay={200}
            onClick={() => { os.clearFilters(); os.setAgendFuturo(true); scrollToTable() }}
          />
```
O `os.clearFilters()` nos `onClick` é intencionalmente mantido aqui — é a Task 5 que o remove.

- [x] **Step 8: Atualizar o chip do banner de filtros ativos**

Substitua:
```tsx
            {os.agendFuturo  && <span className="badge-orange  rounded-full px-2 py-0.5 text-caption font-bold">Agend. Futuro</span>}
```
por:
```tsx
            {os.agendFuturo  && <span className="badge-orange  rounded-full px-2 py-0.5 text-caption font-bold">Após amanhã</span>}
```

- [x] **Step 9: Rodar suíte completa e build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: sem erros.

- [x] **Step 10: Verificação manual do defeito corrigido**

> Substituída por verificação estática — ver "Verificação final da Fase 1".

Run: `npm run dev`, abra `/ordens`.

1. Anote o valor dos cards `Amanhã` e `Após amanhã` sem filtro algum.
2. Selecione `Cidade → TAUBATE`. **Ambos os cards devem diminuir.** Antes desta task eles não se moviam — é esse o defeito.
3. Limpe os filtros. Confirme que `Amanhã` + `Após amanhã` agora contam OS distintas: clique em `Amanhã`, anote o total exibido na tabela; clique em `Após amanhã`, anote; a soma dos dois deve bater com o número de OS ativas agendadas de amanhã em diante, sem dupla contagem.

- [x] **Step 11: Commit**

```bash
git add src/hooks/useOrdens.ts src/hooks/useOrdens.test.ts src/features/ordens/OrdensPage.tsx
git commit -m "fix: KPIs de agenda respeitam os filtros e viram disjuntos

Amanha e Futuro eram calculados sobre allRows e ignoravam todos os filtros,
enquanto os outros quatro cards da mesma linha respondiam a eles. Futuro
tambem continha Amanha, entao a soma dos dois nao fechava.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Drill-down aditivo nos KPIs e nas pílulas de tipo

Todo card chama `os.clearFilters()` antes de aplicar o próprio filtro. Filtrar Taubaté e clicar em "Críticas" descarta Taubaté. O comportamento correto de drill-down é interseção. Os três recortes de agenda continuam mutuamente exclusivos entre si — eles definem *qual base temporal* está sendo olhada — mas param de apagar os filtros dimensionais.

**Files:**
- Modify: `src/hooks/useOrdens.ts`
- Modify: `src/features/ordens/OrdensPage.tsx` (StatCards e pílulas de tipo)
- Test: `src/hooks/useOrdens.test.ts`

**Interfaces:**
- Consumes: os estados `agendHoje`, `agendAmanha`, `agendFuturo` já existentes no hook.
- Produces:
  - `export type AgendaFoco = 'hoje' | 'amanha' | 'posAmanha' | null`
  - `export function proximoAgendaFoco(atual: AgendaFoco, clicado: Exclude<AgendaFoco, null>): AgendaFoco`
  - O retorno de `useOrdens()` ganha `agendaFoco: AgendaFoco` e `setAgendaFoco: (foco: Exclude<AgendaFoco, null>) => void`, e **perde** `setAgendHoje`, `setAgendAmanha`, `setAgendFuturo`. As leituras `agendHoje`/`agendAmanha`/`agendFuturo` permanecem (o banner de filtros ativos as usa).

- [x] **Step 1: Confirmar que os setters de agenda só são usados pela OrdensPage**

Run:
```bash
grep -rn "setAgendHoje\|setAgendAmanha\|setAgendFuturo" src --include=*.tsx --include=*.ts
```
Expected: apenas `src/hooks/useOrdens.ts` e `src/features/ordens/OrdensPage.tsx`. Se aparecer outro arquivo, **pare** e reporte.

- [x] **Step 2: Escrever o teste que falha**

Acrescente ao final de `src/hooks/useOrdens.test.ts`:
```ts
describe('proximoAgendaFoco — recortes de agenda mutuamente exclusivos', () => {
  it('clicar num foco inativo o ativa', () => {
    expect(proximoAgendaFoco(null, 'hoje')).toBe('hoje')
  })

  it('clicar no foco já ativo o desliga', () => {
    expect(proximoAgendaFoco('hoje', 'hoje')).toBeNull()
  })

  it('clicar em outro foco troca, nunca acumula', () => {
    expect(proximoAgendaFoco('hoje', 'amanha')).toBe('amanha')
    expect(proximoAgendaFoco('amanha', 'posAmanha')).toBe('posAmanha')
    expect(proximoAgendaFoco('posAmanha', 'hoje')).toBe('hoje')
  })
})
```

E adicione `proximoAgendaFoco` e `type AgendaFoco` ao import da linha 2:
```ts
import { withCopeQuandoPendente, splitAgendaFutura, isAgendadaEm, dataBR, matchesOSSearch, aplicarFiltros, matchesAgingFaixa, proximoAgendaFoco, type OrdensFiltros } from './useOrdens'
```

- [x] **Step 3: Rodar o teste para verificar que falha**

Run: `npx vitest run src/hooks/useOrdens.test.ts -t proximoAgendaFoco`
Expected: FAIL — `proximoAgendaFoco is not a function` / erro de import.

- [x] **Step 4: Implementar o helper puro**

Em `src/hooks/useOrdens.ts`, acima de `export function useOrdens()`:
```ts
export type AgendaFoco = 'hoje' | 'amanha' | 'posAmanha' | null

// Os três recortes de agenda definem qual base temporal está sendo olhada, então
// são mutuamente exclusivos entre si. Clicar no que já está ativo desliga.
export function proximoAgendaFoco(atual: AgendaFoco, clicado: Exclude<AgendaFoco, null>): AgendaFoco {
  return clicado === atual ? null : clicado
}
```

- [x] **Step 5: Expor `agendaFoco` / `setAgendaFoco` no hook**

Dentro de `useOrdens()`, logo após as declarações de estado, acrescente:
```ts
  const agendaFoco: AgendaFoco = agendHoje ? 'hoje' : agendAmanha ? 'amanha' : agendFuturo ? 'posAmanha' : null

  // Troca o recorte temporal sem tocar nos filtros dimensionais: clicar em
  // "Amanhã" com Taubaté selecionado deve mostrar "amanhã EM Taubaté".
  const setAgendaFoco = (clicado: Exclude<AgendaFoco, null>) => {
    const alvo = proximoAgendaFoco(agendaFoco, clicado)
    setAgendHoje(alvo === 'hoje')
    setAgendAmanha(alvo === 'amanha')
    setAgendFuturo(alvo === 'posAmanha')
  }
```

No objeto retornado, substitua:
```ts
    semEquipe, setSemEquipe, agendHoje, setAgendHoje,
    agendAmanha, setAgendAmanha, agendFuturo, setAgendFuturo,
```
por:
```ts
    semEquipe, setSemEquipe,
    agendHoje, agendAmanha, agendFuturo,
    agendaFoco, setAgendaFoco,
```

- [x] **Step 6: Rodar o teste para verificar que passa**

Run: `npx vitest run src/hooks/useOrdens.test.ts -t proximoAgendaFoco`
Expected: PASS (3 testes).

- [x] **Step 7: Tornar os StatCards aditivos**

Em `src/features/ordens/OrdensPage.tsx`, substitua o bloco inteiro dos seis `<StatCard>` por:
```tsx
          <StatCard
            title="Total OS" value={os.kpis.total} icon={ORDENS_CARD_ICONS.total}
            sub="limpar filtros" delay={0}
            onClick={() => { clearAllFilters(); scrollToTable() }}
          />
          <StatCard
            title="Críticas" value={os.kpis.criticas} tone="critical" icon={ORDENS_CARD_ICONS.criticas}
            sub="SLA 2× excedido" delay={40}
            onClick={() => { os.setCritico(!os.critico); scrollToTable() }}
          />
          <StatCard
            title="Sem equipe" value={os.kpis.semEquipe} tone="warning" icon={ORDENS_CARD_ICONS.semEquipe}
            sub="sem alocação" delay={80}
            onClick={() => { os.setSemEquipe(!os.semEquipe); scrollToTable() }}
          />
          <StatCard
            title="Agend. hoje" value={os.kpis.agendHoje} tone="ok" icon={ORDENS_CARD_ICONS.agendHoje}
            sub="para hoje" delay={120}
            onClick={() => { os.setAgendaFoco('hoje'); scrollToTable() }}
          />
          <StatCard
            title="Amanhã" value={os.kpis.agendAmanha} icon={ORDENS_CARD_ICONS.agendAmanha}
            sub="agendadas para amanhã" delay={160}
            onClick={() => { os.setAgendaFoco('amanha'); scrollToTable() }}
          />
          <StatCard
            title="Após amanhã" value={os.kpis.agendFuturo} tone="warning" icon={ORDENS_CARD_ICONS.agendFuturo}
            sub="de depois de amanhã em diante" delay={200}
            onClick={() => { os.setAgendaFoco('posAmanha'); scrollToTable() }}
          />
```

- [x] **Step 8: Tornar as pílulas de tipo aditivas e com estado visual, via `TipoPill`**

As três pílulas passam a ser um sub-componente local chamado 3×. Escrever os três blocos inline triplicaria o mesmo ternário de classes.

**Atenção ao Tailwind:** as classes precisam ser strings **literais** num mapa. Interpolar (`` `bg-${cor}/25` ``) não funciona — o scanner do Tailwind é estático e a classe some do CSS final sem erro de build, o que produz uma pílula sem cor em produção.

No fim de `src/features/ordens/OrdensPage.tsx`, **após** a chave de fechamento de `export default function OrdensPage()`, acrescente:
```tsx
// Classes literais por cor — o Tailwind faz varredura estática do código-fonte,
// então `bg-${cor}/25` seria purgado do CSS e a pílula sairia sem cor.
const TIPO_PILL_CLASSES = {
  cyan: {
    ativo: 'bg-cyan/25 border-cyan/50 text-cyan',
    idle:  'bg-cyan/10 border-cyan/20 text-cyan hover:bg-cyan/20',
    badge: 'bg-cyan/20 text-cyan',
  },
  orange: {
    ativo: 'bg-orange/25 border-orange/50 text-orange',
    idle:  'bg-orange/10 border-orange/20 text-orange hover:bg-orange/20',
    badge: 'bg-orange/20 text-orange',
  },
  purple: {
    ativo: 'bg-purple/25 border-purple/50 text-purple',
    idle:  'bg-purple/10 border-purple/20 text-purple hover:bg-purple/20',
    badge: 'bg-purple/20 text-purple',
  },
} as const

function TipoPill({ label, icone: Icone, cor, total, ativo, onClick }: {
  label:   string
  icone:   React.ComponentType<{ size?: number }>
  cor:     keyof typeof TIPO_PILL_CLASSES
  total:   number
  ativo:   boolean
  onClick: () => void
}) {
  const c = TIPO_PILL_CLASSES[cor]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full border
                  text-label font-semibold transition-all duration-fast
                  ${ativo ? c.ativo : c.idle}`}
    >
      <Icone size={12} /> {label}
      <span className={`${c.badge} rounded-full px-1.5 py-0 text-caption font-bold tabular-nums`}>
        {total}
      </span>
    </button>
  )
}
```

E substitua o bloco `{/* ── Resumo por Tipo ── */}` inteiro por:
```tsx
      {/* ── Resumo por Tipo ── */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <TipoPill
          label="Instalação" icone={Router} cor="cyan" total={os.kpis.instalacao}
          ativo={os.tipoOs === 'INSTALACAO'}
          onClick={() => { os.setTipoOs(os.tipoOs === 'INSTALACAO' ? '' : 'INSTALACAO'); scrollToTable() }}
        />
        <TipoPill
          label="Manutenção" icone={Wrench} cor="orange" total={os.kpis.manutencao}
          ativo={os.tipoOs === 'MANUTENCAO'}
          onClick={() => { os.setTipoOs(os.tipoOs === 'MANUTENCAO' ? '' : 'MANUTENCAO'); scrollToTable() }}
        />
        <TipoPill
          label="Serviço" icone={HardHat} cor="purple" total={os.kpis.servico}
          ativo={os.tipoOs === 'OUTRO'}
          onClick={() => { os.setTipoOs(os.tipoOs === 'OUTRO' ? '' : 'OUTRO'); scrollToTable() }}
        />
      </div>
```

Os imports `Router`, `Wrench` e `HardHat` continuam necessários — agora como props, não como JSX direto.

- [x] **Step 9: Ajustar o deep-link vindo do Dashboard**

O `useEffect` que lê `location.state.foco` **mantém** o `os.clearFilters()` — vir de outra página é contexto novo, não drill-down. Nenhuma edição no bloco `if (foco) { ... }`.

Mas ele referencia setters que a Step 5 removeu? Confirme:
```bash
grep -n "os.setAgendHoje\|os.setAgendAmanha\|os.setAgendFuturo" src/features/ordens/OrdensPage.tsx
```
Expected: nenhuma saída. O bloco `foco` usa apenas `os.setCritico`, `os.setSemEquipe`, `os.setStatus` e `os.setReagendTipo`, todos preservados.

- [x] **Step 10: Rodar suíte completa e build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: sem erros. Se surgir `TS6133` para algum ícone (`Router`, `Wrench`, `HardHat`), verifique que o bloco de pílulas foi substituído por completo e não removido.

Run: `npm run lint`
Expected: sem erros novos.

- [x] **Step 11: Verificação manual do comportamento aditivo**

> Substituída por verificação estática — ver "Verificação final da Fase 1".

Run: `npm run dev`, abra `/ordens`.

1. Selecione `Cidade → TAUBATE`. Anote o total no banner "Exibindo X de Y".
2. Clique no card `Críticas`. **Taubaté deve continuar selecionado** no select de Cidade, e o banner deve mostrar os dois chips juntos. Antes desta task, Taubaté era descartado.
3. Clique em `Críticas` de novo — o filtro deve desligar, mantendo Taubaté.
4. Clique em `Agend. hoje`, depois em `Amanhã`. Apenas um chip de agenda deve estar ativo por vez, e Taubaté continua.
5. As três pílulas devem manter suas cores: Instalação ciano, Manutenção laranja, Serviço roxo. **Pílula cinza/sem cor significa classe purgada pelo Tailwind** — revise o mapa `TIPO_PILL_CLASSES`. Clique em `Manutenção`: ela deve ficar visivelmente ativa (fundo e borda mais fortes). Clique de novo — desliga.
6. Clique no card `Total OS` — tudo limpa. Este é o único que limpa, e o `sub` agora diz "limpar filtros".
7. Volte ao Dashboard e clique num KPI de risco que leva a `/ordens`. O deep-link deve continuar chegando com contexto limpo e o filtro correto aplicado.

- [x] **Step 12: Commit**

```bash
git add src/hooks/useOrdens.ts src/hooks/useOrdens.test.ts src/features/ordens/OrdensPage.tsx
git commit -m "feat: drill-down aditivo nos KPIs e pilulas da pagina de ordens

Cada card chamava clearFilters() antes de aplicar o proprio filtro, entao
filtrar Taubate e clicar em Criticas descartava Taubate. Os recortes de
agenda continuam exclusivos entre si, mas param de apagar os dimensionais.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verificação final da Fase 1

Executada em 31/07/2026.

- [x] `npm test` — PASS, 623 testes em 69 arquivos, com os 12 novos: 7 de `aplicarFiltros`, 3 de `proximoAgendaFoco` e +2 no bloco reescrito de `splitAgendaFutura` (que foi de 3 para 5).
- [x] `npx tsc --noEmit` — exit 0. **Rodado à parte**: `npm run build` é só `vite build` e não faz type-check, ao contrário do que este plano assumia nas Global Constraints. É este comando, não o build, que garante a ausência de `TS6133` após as remoções de JSX.
- [x] `npm run build` — sem erros; só o aviso pré-existente de chunk acima de 500 kB.
- [x] `npm run lint` — sem erros.
- [x] `npm run audit:ds` — OK.
- [x] `git log --oneline -5` mostra os cinco commits, um por task.

### Verificação estática no lugar da manual

A verificação em browser não foi executada — decisão do dono do projeto. Os três pontos que ela cobriria foram verificados por outros meios, e o resultado fica registrado aqui porque a intenção original do plano era outra:

- **Cores das pílulas (o risco real).** As 15 classes de `TIPO_PILL_CLASSES` foram buscadas literalmente no CSS compilado, `dist/assets/index.DLq47SN3.css`: todas presentes, nenhuma purgada pelo Tailwind. Este era o único defeito possível que nem teste nem build detectariam, e está descartado.
- **Toggle de Rede local.** `grep` por `Rede ON`, `Rede OFF`, `hideRede` e `setHideRede` em `OrdensPage.tsx` e `useOrdens.ts`: zero ocorrências.
- **Drill-down aditivo.** Dos seis `onClick` dos StatCards, só o de `Total OS` chama `clearAllFilters()`; os outros cinco alternam o próprio filtro. Restam dois `clearFilters` no arquivo — o do `Total OS` e o do deep-link vindo do Dashboard, ambos intencionais.
- **KPIs de agenda.** `useOrdens.ts` conta `aplicarFiltros(amanhaOrdens, filtrosAgenda)` e `aplicarFiltros(posAmanhaOrdens, filtrosAgenda)` — o mesmo recorte que a tabela exibe, não mais `allRows`.

**O que continua sem verificação:** que os números na tela se movem como esperado ao clicar. A lógica está coberta por teste unitário e a fiação por leitura de código, então o risco residual é de integração, não de comportamento — e não é mais o risco silencioso das classes purgadas, que motivava a exigência da verificação visual.
