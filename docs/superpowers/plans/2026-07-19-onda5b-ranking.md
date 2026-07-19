# Onda 5b — Ranking de Técnicos (PageHeader + icon) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `RankingTecnicosPage.tsx` adota o `PageHeader` (já usado em Ordens/Fila/Qualidade), que precisa ganhar uma prop `icon?` opcional pra suportar o ícone `Award` que o título desta tela já tem — algo que nenhuma das 3 telas anteriores precisou.

**Architecture:** `PageHeader.tsx` ganha uma prop `icon?: ComponentType<{ size?: number; className?: string }>` — mudança aditiva, retrocompatível (sem `icon`, renderiza exatamente como hoje). `RankingTecnicosPage.tsx` substitui seu cabeçalho artesanal por `<PageHeader icon={Award} .../>` e corrige o grid de KPIs pro padrão responsivo de 4 itens já usado em outras 6+ telas do repo.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library (mesmo padrão RTL de `PageHeader.test.tsx`, já existente).

## Global Constraints

- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- Antes de cada commit: `npx tsc --noEmit`, `npm run lint`, `npm run audit:ds`, `npm test`, `npm run build` devem passar limpos.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — só reorganização de UI. `buildRankingTecnicos`, `SortIcon`/`toggleSort`, `TecnicoCell` não mudam.
- A mudança em `PageHeader.tsx` deve ser retrocompatível: `OrdensPage.tsx`, `FilaPage.tsx`, `QualidadePage.tsx` (já usam `PageHeader` sem `icon`) não podem ter seu cabeçalho alterado por esta onda.
- Grid de KPIs de Ranking usa `grid-cols-2 sm:grid-cols-4` (padrão de 4 itens), **não** `md:grid-cols-3 lg:grid-cols-N` (padrão de 5 itens usado em Qualidade/Fila) — são grids de tamanhos diferentes, não confundir os dois padrões.
- Mudanças de UI exigem verificação manual no navegador — o controller faz essa verificação depois que as tasks e review terminam (mesmo padrão das ondas anteriores).

---

### Task 1: `PageHeader` ganha prop `icon?`

**Files:**
- Modify: `src/components/ui/PageHeader.tsx`
- Modify: `src/components/ui/PageHeader.test.tsx`

**Interfaces:**
- Produces: `export interface PageHeaderProps { title: string; description?: string; icon?: ComponentType<{ size?: number; className?: string }>; actions?: ReactNode; className?: string }` — usado pela Task 2.

- [ ] **Step 1: Escrever os testes que falham**

Ler o arquivo atual `src/components/ui/PageHeader.test.tsx` (2 testes existentes) e adicionar, sem remover os existentes:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Award } from 'lucide-react'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('renderiza título como heading e descrição', () => {
    render(<PageHeader title="Ordens de Serviço" description="Fila ativa do período" />)
    expect(screen.getByRole('heading', { name: 'Ordens de Serviço' })).toBeInTheDocument()
    expect(screen.getByText('Fila ativa do período')).toBeInTheDocument()
  })
  it('renderiza slot de ações', () => {
    render(<PageHeader title="X" actions={<button>Exportar</button>} />)
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeInTheDocument()
  })
  it('renderiza o ícone antes do título quando fornecido', () => {
    const { container } = render(<PageHeader title="Ranking de Técnicos" icon={Award} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ranking de Técnicos' })).toBeInTheDocument()
  })
  it('não renderiza nenhum ícone quando icon não é fornecido', () => {
    const { container } = render(<PageHeader title="Ordens de Serviço" />)
    expect(container.querySelector('svg')).not.toBeInTheDocument()
  })
})
```

(Note: o import de `Award` no topo do arquivo precisa ser adicionado junto com o de `PageHeader` — o bloco acima já mostra o arquivo completo com os 4 testes.)

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/components/ui/PageHeader.test.tsx`
Expected: FAIL nos 2 novos testes — o primeiro porque nenhum `<svg>` é renderizado ainda (prop `icon` é ignorada silenciosamente, sem erro de TypeScript em tempo de execução do Vitest), o segundo passaria por acidente (também não há `<svg>` hoje) mas roda mesmo assim como parte do ciclo RED antes da implementação.

- [ ] **Step 3: Atualizar `src/components/ui/PageHeader.tsx`**

Substituir o arquivo inteiro por:

```tsx
import type { ComponentType, ReactNode } from 'react'

export interface PageHeaderProps {
  title:        string
  description?: string
  icon?:        ComponentType<{ size?: number; className?: string }>
  actions?:     ReactNode
  className?:   string
}

export function PageHeader({ title, description, icon: Icon, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 flex-wrap ${className}`}>
      <div className="min-w-0">
        <h1 className="text-title font-semibold text-text flex items-center gap-2">
          {Icon && <Icon size={18} className="text-primary" />}
          {title}
        </h1>
        {description && <p className="text-label text-muted mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/components/ui/PageHeader.test.tsx`
Expected: PASS — 4 testes.

- [ ] **Step 5: Rodar a suíte completa (regressão nos 3 consumidores existentes)**

Run: `npm test`
Expected: PASS — confirma que `OrdensPage.tsx`/`FilaPage.tsx`/`QualidadePage.tsx` (que usam `PageHeader` sem `icon`) não quebraram com a mudança de assinatura.

- [ ] **Step 6: Type-check, lint e audit de design system**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/PageHeader.tsx src/components/ui/PageHeader.test.tsx
git commit -m "feat(ui): PageHeader ganha prop icon opcional"
```

---

### Task 2: `RankingTecnicosPage.tsx` — adotar `PageHeader`, grid de KPIs responsivo

**Files:**
- Modify: `src/features/erp/ranking/RankingTecnicosPage.tsx`

**Interfaces:**
- Consumes: `PageHeader` de `../../../components/ui/PageHeader` (produzido na Task 1, com `icon?`).

- [ ] **Step 1: Adicionar o import do `PageHeader`**

Adicionar, junto aos outros imports de `components/ui/*` (após `import { Badge } from '../../../components/ui/Badge'`):

```tsx
import { PageHeader } from '../../../components/ui/PageHeader'
```

- [ ] **Step 2: Substituir o bloco de cabeçalho**

Substituir:

```tsx
      <div>
        <h1 className="text-[20px] font-bold text-text flex items-center gap-2">
          <Award size={18} className="text-primary" /> Ranking de Técnicos
        </h1>
        <p className="text-label text-muted mt-0.5">
          Volume, SLA e taxa de retrabalho por técnico, lado a lado — sem score composto, sem peso inventado
        </p>
      </div>
```

por:

```tsx
      <PageHeader
        title="Ranking de Técnicos"
        description="Volume, SLA e taxa de retrabalho por técnico, lado a lado — sem score composto, sem peso inventado"
        icon={Award}
      />
```

(`Award` já está importado no topo do arquivo, de `lucide-react` — não precisa de novo import.)

- [ ] **Step 3: Grid de KPIs responsivo**

Substituir:
```tsx
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
```
por:
```tsx
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
```

(os 4 `StatCard` dentro dessa `div` não mudam.)

- [ ] **Step 4: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão (`RankingTecnicosPage.tsx` não tem testes de componente próprios hoje; `buildRankingTecnicos` já é testada separadamente e não muda).

- [ ] **Step 5: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros.

- [ ] **Step 6: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true`).

No navegador, autenticado:
1. `/erp/ranking` — `PageHeader` mostra o ícone `Award` antes do título "Ranking de Técnicos" + descrição, no mesmo estilo visual de antes.
2. `/erp/ranking` — grid de KPIs (4 cards) degrada corretamente em ~375px (2 colunas) e ~640px+ (4 colunas).
3. `/ordens`, `/erp/fila`, `/erp/qualidade` — cabeçalhos continuam idênticos a antes (sem ícone, sem regressão visual da mudança de API do `PageHeader`).
4. `/erp/ranking` — ordenação por coluna (clicar nos headers Volume/SLA/Críticas/Retrabalho) e edição de nome de técnico continuam funcionando normalmente.

Reportar o resultado de cada item antes de prosseguir. Se algo divergir do esperado, corrigir antes do commit.

- [ ] **Step 7: Commit**

```bash
git add src/features/erp/ranking/RankingTecnicosPage.tsx
git commit -m "refactor(ranking): adota PageHeader com icon, grid de KPIs responsivo"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (`PageHeader` ganha `icon?`) → Task 1. §3.2 (cabeçalho + grid de Ranking) → Task 2. §5 (testes) → `PageHeader.test.tsx` estendido com TDD na Task 1; regressão da suíte completa + verificação manual (cobrindo explicitamente os 3 consumidores existentes, não só Ranking) na Task 2.

**Placeholders:** nenhum "TBD" — todo código é completo e literal; o bloco "antes" da Task 2 é cópia exata do arquivo lido durante o brainstorming.

**Consistência de tipos:** `PageHeaderProps.icon` definido na Task 1 é consumido com o mesmo tipo (`ComponentType<{ size?: number; className?: string }>`, compatível com `Award` de `lucide-react`) na Task 2. Grid de 4 itens (`sm:grid-cols-4`) não é confundido com o grid de 5 itens (`md:grid-cols-3 lg:grid-cols-5`) usado nas ondas anteriores — são padrões diferentes para contagens diferentes, documentado explicitamente nas Global Constraints.
