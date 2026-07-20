# Fix — OS Concluída/Sem Execução não conta pra equipe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrige 6 violações confirmadas da regra "OS Concluída/Sem Execução não conta mais como carga da equipe" — introduz um helper compartilhado `isFilaAtiva` em `transform.ts` e o usa nos 4 arquivos afetados (`AlertasPage.tsx`, `RelatoriosPage.tsx`, `auditoria.ts`).

**Architecture:** Um novo helper puro (`isFilaAtiva(s): boolean`) ao lado de `isConcluida`/`isExecucaoReal` já existentes em `src/lib/transform.ts`. Os 6 pontos de contagem por equipe passam a usar `_situacaoEfetiva` (campo já normalizado) filtrado por esse helper, em vez de contar todas as linhas sem checar status. Nenhuma outra lógica muda.

**Tech Stack:** React 18 + TypeScript, Vitest.

## Global Constraints

- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` devem passar limpos antes de qualquer commit.
- Escopo travado nos 6 pontos abaixo — não tocar nos 5 casos ambíguos (Planner, Fornecedor, gráficos, revisitas, "Sem Equipe" em Relatórios) nem na regra de anomalia (Instalação/Serviço).
- Não migrar os 7+ lugares já corretos (Fila/SLA/Campo/Cidades/Dashboard/Ranking) pro novo helper — funcionam certo hoje, fora de escopo.
- `RankEntry.queue` em `RelatoriosPage.tsx` (`ranking`) precisa de um guard cirúrgico só no incremento de `queue` — `execInst`/`execManut`/`execServico` (linhas 145-149) contam por `descsituacao === 'Concluída'` e devem continuar rodando pra TODAS as linhas do time (inclusive concluídas), já que são métrica de produtividade histórica, não de fila. Não envolver essas linhas num early-return.
- `auditoria.ts` `semEquipe` tem DUAS ocorrências do mesmo filtro (o contador na linha 5 e a lista de drill-down na linha 28, usada no card "OS sem equipe atribuída") — as duas precisam do mesmo guard, senão o número do resumo diverge da lista de detalhe.

---

### Task 1: Helper `isFilaAtiva` + correção dos 6 pontos de contagem por equipe

**Files:**
- Modify: `src/lib/transform.ts` (novo helper)
- Modify: `src/lib/transform.test.ts` (novos testes)
- Modify: `src/features/erp/alertas/AlertasPage.tsx` (`metricsByCode`, `totalFila`)
- Modify: `src/features/erp/relatorios/RelatoriosPage.tsx` (`byTeam`, `ranking`)
- Modify: `src/lib/builders/auditoria.ts` (`semEquipe`, x2 ocorrências)

**Interfaces:**
- Produces: `export const isFilaAtiva = (s: string | undefined | null): boolean` em `src/lib/transform.ts`, consumida pelos outros 3 arquivos via import relativo.

- [ ] **Step 1: Escrever os testes de `isFilaAtiva` (devem falhar — função ainda não existe)**

Em `src/lib/transform.test.ts`, adicionar ao import existente na linha 3:
```ts
import { enrichRows, getFornecedor, parseCSV, applyDateFilter, parseDate, parseDateTime, isConcluida, isExecucaoReal, isFilaAtiva } from './transform.js'
```

Adicionar após o bloco `describe('isExecucaoReal', ...)` (depois da linha 763, antes do comentário `// ─── buildAnomalias ───`):
```ts
describe('isFilaAtiva', () => {
  it('Pendente retorna true', () => {
    expect(isFilaAtiva('Pendente')).toBe(true)
  })

  it('Atendimento retorna true', () => {
    expect(isFilaAtiva('Atendimento')).toBe(true)
  })

  it('Concluída retorna false', () => {
    expect(isFilaAtiva('Concluída')).toBe(false)
  })

  it('Concluída/Sem Execução retorna false', () => {
    expect(isFilaAtiva('Concluída/Sem Execução')).toBe(false)
  })

  it('Reagendamento retorna false', () => {
    expect(isFilaAtiva('Reagendamento')).toBe(false)
  })

  it('null/undefined retorna false', () => {
    expect(isFilaAtiva(null)).toBe(false)
    expect(isFilaAtiva(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar os testes novos e confirmar que falham**

Run: `npx vitest run src/lib/transform.test.ts -t isFilaAtiva`
Expected: FAIL — `isFilaAtiva` não está exportado por `transform.ts`.

- [ ] **Step 3: Implementar `isFilaAtiva` em `transform.ts`**

Em `src/lib/transform.ts`, adicionar logo após `isExecucaoReal` (linhas 12-13):
```ts

// OS que ainda está na fila ativa de uma equipe (não fechada).
// Usar para: contagem de carga/fila por equipe — Concluída/Sem Execução não conta mais
// como carga da equipe assim que a OS fecha (procedimento interno da operação).
export const isFilaAtiva = (s: string | undefined | null): boolean =>
  s === 'Pendente' || s === 'Atendimento'
```

- [ ] **Step 4: Rodar os testes novos de novo e confirmar que passam**

Run: `npx vitest run src/lib/transform.test.ts -t isFilaAtiva`
Expected: PASS — 6/6 testes.

- [ ] **Step 5: Corrigir `AlertasPage.tsx` — `metricsByCode` e `totalFila`**

Adicionar import (após a linha `import { shortEquipe } from '../../../lib/osFormat'`):
```tsx
import { isFilaAtiva } from '../../../lib/transform'
```

Substituir (linhas 37-47):
```tsx
  const metricsByCode = useMemo(() => {
    const map: Record<string, { queue: number; criticas: number }> = {}
    rows.forEach(row => {
      if (!row.nomedaequipe) return
      const code = shortEquipe(row.nomedaequipe).split(' - ')[0].trim()
      if (!map[code]) map[code] = { queue: 0, criticas: 0 }
      map[code].queue++
      if (row._slaCritico) map[code].criticas++
    })
    return map
  }, [rows])
```
por:
```tsx
  const metricsByCode = useMemo(() => {
    const map: Record<string, { queue: number; criticas: number }> = {}
    rows.forEach(row => {
      if (!row.nomedaequipe) return
      if (!isFilaAtiva(row._situacaoEfetiva)) return
      const code = shortEquipe(row.nomedaequipe).split(' - ')[0].trim()
      if (!map[code]) map[code] = { queue: 0, criticas: 0 }
      map[code].queue++
      if (row._slaCritico) map[code].criticas++
    })
    return map
  }, [rows])
```

Substituir (linhas 63-66):
```tsx
  const totalFila   = useMemo(
    () => rows.filter(r => r._situacaoEfetiva !== 'Concluída').length,
    [rows]
  )
```
por:
```tsx
  const totalFila   = useMemo(
    () => rows.filter(r => isFilaAtiva(r._situacaoEfetiva)).length,
    [rows]
  )
```

(`AlertasComponents.tsx` — "Equipes Sobrecarregadas" — não precisa de nenhuma mudança de código: consome `metricsByCode` via prop, então o alerta passa a refletir a fila real automaticamente assim que este step for aplicado.)

- [ ] **Step 6: Corrigir `RelatoriosPage.tsx` — `byTeam` e `ranking`**

Adicionar import (após a linha `import { shortEquipe } from '../../../lib/osFormat'`):
```tsx
import { isFilaAtiva } from '../../../lib/transform'
```

Substituir `byTeam` (linhas 50-62):
```tsx
  const byTeam = useMemo(() => {
    const map: Record<string, { queue: number; criticas: number }> = {}
    filteredRows.forEach(r => {
      if (!r.nomedaequipe) return
      const code = shortEquipe(r.nomedaequipe).split(' - ')[0].trim()
      if (!map[code]) map[code] = { queue: 0, criticas: 0 }
      map[code].queue++
      if (r._slaExcedido || r._slaSemAgend) map[code].criticas++
    })
    return Object.entries(map)
      .sort((a, b) => b[1].queue - a[1].queue)
      .slice(0, 12)
  }, [filteredRows])
```
por:
```tsx
  const byTeam = useMemo(() => {
    const map: Record<string, { queue: number; criticas: number }> = {}
    filteredRows.forEach(r => {
      if (!r.nomedaequipe) return
      if (!isFilaAtiva(r._situacaoEfetiva)) return
      const code = shortEquipe(r.nomedaequipe).split(' - ')[0].trim()
      if (!map[code]) map[code] = { queue: 0, criticas: 0 }
      map[code].queue++
      if (r._slaExcedido || r._slaSemAgend) map[code].criticas++
    })
    return Object.entries(map)
      .sort((a, b) => b[1].queue - a[1].queue)
      .slice(0, 12)
  }, [filteredRows])
```

Dentro de `ranking` (linhas 131-159), substituir só a linha `map[code].queue++` (linha 143 — o resto do bloco continua igual, incluindo `agingSum`/`agingCount`/`execInst`/`execManut`/`execServico`):
```tsx
      map[code].queue++
      if (r._agingAbertura != null) { map[code].agingSum += r._agingAbertura; map[code].agingCount++ }
      if (r.descsituacao === 'Concluída') {
```
por:
```tsx
      if (isFilaAtiva(r._situacaoEfetiva)) map[code].queue++
      if (r._agingAbertura != null) { map[code].agingSum += r._agingAbertura; map[code].agingCount++ }
      if (r.descsituacao === 'Concluída') {
```

**Atenção:** NÃO envolver `execInst`/`execManut`/`execServico` (dentro do `if (r.descsituacao === 'Concluída')`) nem `agingSum`/`agingCount` em nenhum guard novo — eles já estão corretos e devem continuar rodando pra todas as linhas do time, inclusive concluídas.

- [ ] **Step 7: Corrigir `auditoria.ts` — `semEquipe` (2 ocorrências)**

Adicionar import no topo do arquivo (após `import type { OSRow } from '../types'`):
```ts
import { isFilaAtiva } from '../transform'
```

Substituir (linha 5):
```ts
  const semEquipe  = rows.filter(r => !r.nomedaequipe?.trim()).length
```
por:
```ts
  const semEquipe  = rows.filter(r => isFilaAtiva(r._situacaoEfetiva) && !r.nomedaequipe?.trim()).length
```

Substituir (linha 28, dentro do array `problems`, drill-down do card "OS sem equipe atribuída"):
```ts
      rows:  rows.filter(r => !r.nomedaequipe?.trim()).slice(0, 50).map(r => ({ numos: r.numos, status: r.descsituacao, cidade: r.nomedacidade })),
```
por:
```ts
      rows:  rows.filter(r => isFilaAtiva(r._situacaoEfetiva) && !r.nomedaequipe?.trim()).slice(0, 50).map(r => ({ numos: r.numos, status: r.descsituacao, cidade: r.nomedacidade })),
```

(As duas ocorrências precisam do mesmo filtro — senão o número do resumo "Sem Equipe" diverge da lista de OS mostrada no card de detalhe.)

- [ ] **Step 8: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão (nenhum teste existente cobre `AlertasPage.tsx`/`RelatoriosPage.tsx`/`auditoria.ts` hoje, então nenhuma fixture precisa de ajuste; só os 6 testes novos de `isFilaAtiva` são adicionados à contagem total).

- [ ] **Step 9: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros.

- [ ] **Step 10: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true`).

No navegador, autenticado:
1. Em `/erp/alertas`: KPI "OS na Fila" (badge `totalFila`) não conta mais OS Concluída/Concluída-Sem-Execução; alerta "Equipes Sobrecarregadas" (se disparar) reflete só carga ativa.
2. Em `/erp/relatorios`: gráfico "OS por Equipe" (barra "OS na Fila") reflete só OS ativas por equipe.
3. Em `/auditoria` (se a tela existir/for acessível) ou onde `buildAuditoria` for consumido: card "OS sem equipe atribuída" mostra um número e uma lista de OS consistentes entre si, e ambos excluem OS já concluídas.

Reportar o resultado de cada item antes de prosseguir. Se algo divergir do esperado, corrigir antes do commit.

- [ ] **Step 11: Commit**

```bash
git add src/lib/transform.ts src/lib/transform.test.ts src/features/erp/alertas/AlertasPage.tsx src/features/erp/relatorios/RelatoriosPage.tsx src/lib/builders/auditoria.ts
git commit -m "fix(equipe): OS Concluida/Sem Execucao nao conta mais como carga da equipe"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (helper) → Steps 1-4. §3.2/§3.3 (AlertasPage) → Step 5. §3.4 (AlertasComponents, sem mudança) → nota no Step 5. §3.5/§3.6 (RelatoriosPage) → Step 6. §3.7 (auditoria.ts) → Step 7, ampliado pra cobrir as 2 ocorrências (achado durante a leitura do arquivo real — a spec só citava a linha 5, mas a linha 28 usa o mesmo filtro pro drill-down e precisa do mesmo fix pra não divergir do resumo). §5 (testes) → Steps 1-4 (TDD do helper) + Step 8 (regressão) + Step 10 (manual).

**Placeholders:** nenhum "TBD" — código completo e literal; todos os blocos "antes" são cópia exata dos arquivos lidos durante o brainstorming/planejamento.

**Consistência de tipos:** `isFilaAtiva(s: string | undefined | null): boolean`, mesma assinatura de `isConcluida`/`isExecucaoReal` já existentes; `_situacaoEfetiva` é `SituacaoEfetiva` (union com fallback `string`, `src/lib/types.ts:6`), compatível com o parâmetro do helper sem cast.
