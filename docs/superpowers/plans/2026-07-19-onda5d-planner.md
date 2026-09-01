# Onda 5d — Planner de Equipes (PageHeader + dedup local) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `PlannerPage.tsx` adota o `PageHeader` (já usado em Ordens/Fila/Qualidade/Ranking/Relatórios), com o `PlannerModeToggle` no slot `actions`. `PlannerExecutadoView.tsx` para de duplicar a definição de `SectionLabel` que já existe em `PlannerComponents.tsx` (usada por `PlannerPlanejadoView.tsx`), e seu grid de KPIs ganha o breakpoint responsivo que faltava.

**Architecture:** Duas mudanças independentes em dois arquivos diferentes. `PlannerPage.tsx` (a casca, 26 linhas) troca `<h1>+<p>+toggle` por `<PageHeader title description actions={<PlannerModeToggle .../>} />`. `PlannerExecutadoView.tsx` remove sua função `SectionLabel` local (idêntica, byte a byte, à de `PlannerComponents.tsx`) e passa a importá-la de lá — zero mudança visual, já que as duas cópias eram idênticas — e corrige `grid-cols-2 lg:grid-cols-4` pra `grid-cols-2 sm:grid-cols-4` (padrão de 4 itens já usado em Ranking e no próprio `PlannerPlanejadoView.tsx`).

**Tech Stack:** React 18 + TypeScript.

## Global Constraints

- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- Antes de cada commit: `npx tsc --noEmit`, `npm run lint`, `npm run audit:ds`, `npm test`, `npm run build` devem passar limpos.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — `buildProdutividade`, `buildPlanner`, `getDayLabelsFromRange`, `getWeekDays`, `tipoIcon`, `TeamRow`, `PlannerCell`, `PlannerDrillModal`, `DeltaBadge`, `useAIProdutividade`/`useAIPlanner` não mudam.
- `SectionLabel` **não migra** pro canônico neutro (`src/components/ui/SectionLabel.tsx`) nesta onda — só dedup local entre as 2 cópias já idênticas dentro do Planner. `PlannerComponents.tsx` não é modificado (já exporta `SectionLabel`, só ganha um segundo consumidor).
- Mudanças de UI exigem verificação manual no navegador — o controller faz essa verificação depois que as tasks e reviews terminam (mesmo padrão das ondas anteriores).

---

### Task 1: `PlannerPage.tsx` — adotar `PageHeader`

**Files:**
- Modify: `src/features/erp/planner/PlannerPage.tsx` (arquivo inteiro, 26 linhas)

**Interfaces:**
- Consumes: `PageHeader` de `../../../components/ui/PageHeader` (`{ title, description, actions }`, já existe, sem mudanças de API necessárias aqui). `PlannerModeToggle` de `./PlannerModeToggle` (já existe, sem mudanças).

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import { useState } from 'react'
import { PageHeader } from '../../../components/ui/PageHeader'
import { PlannerModeToggle, type PlannerModo } from './PlannerModeToggle'
import PlannerExecutadoView from './PlannerExecutadoView'
import PlannerPlanejadoView from './PlannerPlanejadoView'

export default function PlannerPage() {
  const [modo, setModo] = useState<PlannerModo>('executado')

  return (
    <div className="space-y-4 max-w-[1600px]">
      <PageHeader
        title="Planner de Equipes"
        description={modo === 'executado'
          ? 'Histórico de execuções por equipe'
          : 'Agenda futura por equipe — clique numa célula para ver as OS'}
        actions={<PlannerModeToggle modo={modo} onChange={setModo} />}
      />

      {modo === 'executado' ? <PlannerExecutadoView /> : <PlannerPlanejadoView />}
    </div>
  )
}
```

- [ ] **Step 2: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão (`PlannerPage.tsx` não tem testes próprios hoje).

- [ ] **Step 3: Type-check, lint e audit de design system**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/features/erp/planner/PlannerPage.tsx
git commit -m "refactor(planner): casca adota PageHeader com toggle de modo em actions"
```

---

### Task 2: `PlannerExecutadoView.tsx` — dedup local do `SectionLabel`, grid de KPIs responsivo

**Files:**
- Modify: `src/features/erp/planner/PlannerExecutadoView.tsx`

**Interfaces:**
- Consumes: `SectionLabel` de `./PlannerComponents` (já existe, exportado, mesma assinatura `{ icon: IconComp; color: string; children: React.ReactNode }` da função local removida — `IconComp` de `PlannerComponents.tsx` tem a mesma forma estrutural do `IconComp` local deste arquivo, `ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>`, então são compatíveis sem cast).

- [ ] **Step 1: Adicionar o import do `SectionLabel`**

Adicionar, após `import { useAIProdutividade } from '../../../hooks/useAIProdutividade'`:

```tsx
import { SectionLabel } from './PlannerComponents'
```

- [ ] **Step 2: Remover a definição local de `SectionLabel`**

Remover completamente o bloco:

```tsx
// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ icon: Icon, color, children }: { icon: IconComp; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} style={{ color }} className="flex-shrink-0" />
      <span className="text-caption font-bold uppercase tracking-[0.07em]" style={{ color }}>{children}</span>
    </div>
  )
}

```

(esse bloco fica entre o fim de `buildProdutividade` e o comentário `// ─── DeltaBadge ─── `; remover o bloco inteiro, incluindo a linha de comentário `// ─── SectionLabel ─── ` acima dele e a linha em branco logo depois, deixando só uma linha em branco entre o fim de `buildProdutividade` e `// ─── DeltaBadge ─── `.)

Não remover o `type IconComp = ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>` (linha 18) — continua em uso por `tipoIcon()`.

- [ ] **Step 3: Grid de KPIs responsivo**

Substituir:
```tsx
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
```
por:
```tsx
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
```

(os 4 cards de KPI dentro dessa `div` não mudam.)

- [ ] **Step 4: Confirmar que o uso de `SectionLabel` no JSX continua igual**

A chamada `<SectionLabel icon={BarChart3} color="#3b82f6">Ranking — {teams.length} equipes · {days.length} dias</SectionLabel>` (dentro da `<section>` "Tabela") não muda — só a fonte do import é diferente agora.

- [ ] **Step 5: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão.

- [ ] **Step 6: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros — confirma que `SectionLabel` importado tem o tipo compatível com o uso existente e que `IconComp` local não ficou órfão.

- [ ] **Step 7: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true`).

No navegador, autenticado, em `/erp/planner`:
1. `PageHeader` mostra título "Planner de Equipes" + descrição (muda conforme o modo) + o toggle Executado/Planejado no lugar de sempre (ao lado do título).
2. Trocar entre Executado/Planejado continua funcionando (troca a view renderizada, descrição do `PageHeader` atualiza).
3. Modo "Executado" — grid de KPIs (4 cards) degrada corretamente em ~375px (2 colunas) e ~640px+ (4 colunas); seção "Ranking" com `SectionLabel` (barra+ícone azul, texto colorido) renderiza igual a antes; expandir uma equipe e clicar num dia ainda abre a tabela inline de OS.
4. Modo "Planejado" — seções "Grade" e "Cidades cobertas" (`SectionLabel`) continuam idênticas visualmente; navegação entre semanas, clique em célula (drill-down), edição de metas (se gestor) continuam funcionando.

Reportar o resultado de cada item antes de prosseguir. Se algo divergir do esperado, corrigir antes do commit.

- [ ] **Step 8: Commit**

```bash
git add src/features/erp/planner/PlannerExecutadoView.tsx
git commit -m "refactor(planner): dedup local do SectionLabel, grid de KPIs responsivo"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (casca adota `PageHeader`) → Task 1. §3.2 (dedup do `SectionLabel`, grid responsivo) → Task 2. §3.3 (Planejado/`PlannerComponents.tsx` sem mudança) → confirmado explicitamente no Step 4 da Task 2, nenhuma task extra necessária. §5 (testes) → regressão da suíte completa em cada task; verificação manual centralizada na Task 2 (última), cobrindo os dois modos e os dois arquivos.

**Placeholders:** nenhum "TBD" — código completo e literal; os blocos "antes" são cópia exata do arquivo lido durante o brainstorming.

**Consistência de tipos:** `SectionLabel` de `PlannerComponents.tsx` (`{ icon: IconComp; color: string; children: React.ReactNode }`, com `IconComp` também exportado de lá) substitui a função local idêntica de `PlannerExecutadoView.tsx` sem mudança de assinatura — o `IconComp` local deste último continua existindo separadamente (usado por `tipoIcon`), mas os dois tipos são estruturalmente idênticos (`ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>`), então a chamada `<SectionLabel icon={BarChart3} .../>` compila sem cast.
