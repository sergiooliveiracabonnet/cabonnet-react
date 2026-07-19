# Onda 5e — Alertas (PageHeader + titleExtra/descriptionExtra) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `AlertasPage.tsx` adota o `PageHeader` (já usado em Ordens/Fila/Qualidade/Ranking/Relatórios/Planner) — que precisa ganhar dois slots novos, `titleExtra?`/`descriptionExtra?`, pra suportar o badge de contagem colado no título e o indicador "Ao vivo" colado na descrição que esta tela tem e nenhuma anterior precisou. Última sub-onda de "Onda 5: ERP analíticos".

**Architecture:** `PageHeader.tsx` ganha `titleExtra?: ReactNode` (renderizado depois do texto do título, dispara o mesmo layout flex já usado por `icon`) e `descriptionExtra?: ReactNode` (renderizado ao lado da descrição, só quando `description` também está presente — mudança aditiva, retrocompatível). `AlertasPage.tsx` substitui seu cabeçalho artesanal por `<PageHeader title titleExtra description descriptionExtra actions />`, com o mesmo JSX interno de hoje (badge, indicador, botão) só realocado como props. Os 2 grids de KPI (`grid-cols-3` fixo) ganham breakpoints responsivos.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library (mesmo padrão RTL de `PageHeader.test.tsx`).

## Global Constraints

- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- Antes de cada commit: `npx tsc --noEmit`, `npm run lint`, `npm run audit:ds`, `npm test`, `npm run build` devem passar limpos.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — `buildAlerts`, `useAlerts`, `useGrafanaOS`, `useAIAlertas`, `AlertCard`/`RuleCard`/`GrafanaCityStrip`/`SettingsPanel` não mudam.
- A mudança em `PageHeader.tsx` deve ser retrocompatível: `OrdensPage.tsx`, `FilaPage.tsx`, `QualidadePage.tsx`, `RankingTecnicosPage.tsx`, `RelatoriosPage.tsx`, `PlannerPage.tsx` (já usam `PageHeader` sem `titleExtra`/`descriptionExtra`) não podem ter seu cabeçalho alterado. Nenhum desses 6 arquivos deve ser tocado por este plano.
- `descriptionExtra` só renderiza quando `description` também está presente (guard explícito) — não é um slot independente.
- `SectionLabel` de Alertas **não muda** nesta onda (decisão explícita, ver spec §2.3) — não migra pro canônico neutro.
- Grids de Alertas usam `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (padrão de 3 itens já usado no Dashboard), **não** os padrões de 4 ou 5 itens usados nas sub-ondas anteriores — são grids de tamanhos diferentes, não confundir.
- Mudanças de UI exigem verificação manual no navegador — o controller faz essa verificação depois que as tasks e reviews terminam (mesmo padrão das ondas anteriores).

---

### Task 1: `PageHeader` ganha `titleExtra?`/`descriptionExtra?`

**Files:**
- Modify: `src/components/ui/PageHeader.tsx`
- Modify: `src/components/ui/PageHeader.test.tsx`

**Interfaces:**
- Produces: `export interface PageHeaderProps { title: string; titleExtra?: ReactNode; description?: string; descriptionExtra?: ReactNode; icon?: ComponentType<{ size?: number; className?: string }>; actions?: ReactNode; className?: string }` — usado pela Task 2.

- [ ] **Step 1: Escrever os testes que falham**

Substituir `src/components/ui/PageHeader.test.tsx` inteiro por:

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
  it('h1 sem ícone não tem classes flex', () => {
    const { container } = render(<PageHeader title="Ordens de Serviço" />)
    const h1 = container.querySelector('h1')
    expect(h1).toHaveClass('text-title', 'font-semibold', 'text-text')
    expect(h1).not.toHaveClass('flex', 'items-center', 'gap-2')
  })
  it('renderiza titleExtra ao lado do título e aplica flex no h1', () => {
    const { container } = render(
      <PageHeader title="Notificações & Alertas" titleExtra={<span data-testid="badge">3 ativos</span>} />
    )
    expect(screen.getByTestId('badge')).toBeInTheDocument()
    const h1 = container.querySelector('h1')
    expect(h1).toHaveClass('flex', 'items-center', 'gap-2')
  })
  it('renderiza descriptionExtra ao lado da descrição quando description está presente', () => {
    render(
      <PageHeader
        title="Alertas"
        description="Motor de regras em tempo real"
        descriptionExtra={<span data-testid="live">Ao vivo</span>}
      />
    )
    expect(screen.getByTestId('live')).toBeInTheDocument()
    expect(screen.getByText('Motor de regras em tempo real')).toBeInTheDocument()
  })
  it('não renderiza descriptionExtra se description não for fornecida', () => {
    render(<PageHeader title="X" descriptionExtra={<span data-testid="live">Ao vivo</span>} />)
    expect(screen.queryByTestId('live')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/components/ui/PageHeader.test.tsx`
Expected: FAIL nos 3 novos testes — `titleExtra`/`descriptionExtra` são props desconhecidas, ignoradas silenciosamente pelo componente atual (sem erro de TypeScript em tempo de execução do Vitest), então os `getByTestId`/`toHaveClass('flex', ...)` não encontram nada.

- [ ] **Step 3: Atualizar `src/components/ui/PageHeader.tsx`**

Substituir o arquivo inteiro por:

```tsx
import type { ComponentType, ReactNode } from 'react'

export interface PageHeaderProps {
  title:             string
  titleExtra?:       ReactNode
  description?:      string
  descriptionExtra?: ReactNode
  icon?:             ComponentType<{ size?: number; className?: string }>
  actions?:          ReactNode
  className?:        string
}

export function PageHeader({ title, titleExtra, description, descriptionExtra, icon: Icon, actions, className = '' }: PageHeaderProps) {
  const hasTitleRow = !!Icon || !!titleExtra
  const hasDescRow  = !!description && !!descriptionExtra

  return (
    <div className={`flex items-start justify-between gap-4 flex-wrap ${className}`}>
      <div className="min-w-0">
        <h1 className={`text-title font-semibold text-text ${hasTitleRow ? 'flex items-center gap-2' : ''}`}>
          {Icon && <Icon size={18} className="text-primary" />}
          {title}
          {titleExtra}
        </h1>
        {description && (
          hasDescRow ? (
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-label text-muted">{description}</p>
              {descriptionExtra}
            </div>
          ) : (
            <p className="text-label text-muted mt-0.5">{description}</p>
          )
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/components/ui/PageHeader.test.tsx`
Expected: PASS — 8 testes.

- [ ] **Step 5: Rodar a suíte completa (regressão nos 6 consumidores existentes)**

Run: `npm test`
Expected: PASS — confirma que `OrdensPage.tsx`/`FilaPage.tsx`/`QualidadePage.tsx`/`RankingTecnicosPage.tsx`/`RelatoriosPage.tsx`/`PlannerPage.tsx` (que usam `PageHeader` sem `titleExtra`/`descriptionExtra`) não quebraram com a mudança de assinatura.

- [ ] **Step 6: Type-check, lint e audit de design system**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/PageHeader.tsx src/components/ui/PageHeader.test.tsx
git commit -m "feat(ui): PageHeader ganha titleExtra e descriptionExtra opcionais"
```

---

### Task 2: `AlertasPage.tsx` — adotar `PageHeader`, grids responsivos

**Files:**
- Modify: `src/features/erp/alertas/AlertasPage.tsx`

**Interfaces:**
- Consumes: `PageHeader` de `../../../components/ui/PageHeader` (produzido na Task 1, com `titleExtra`/`descriptionExtra`).

- [ ] **Step 1: Adicionar o import do `PageHeader`**

Adicionar, após o bloco de import de `lucide-react` (antes de `import { useERPRows } from '../useERPRows'`):

```tsx
import { PageHeader } from '../../../components/ui/PageHeader'
```

- [ ] **Step 2: Substituir o bloco de cabeçalho**

Substituir:

```tsx
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[20px] font-headline font-bold text-text">
              Notificações &amp; Alertas
            </h1>
            {hasAny ? (
              <span className="inline-flex items-center gap-1.5 text-caption font-bold px-2 py-0.5 rounded-full border"
                    style={{ background: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.35)', color: '#f87171' }}>
                {totalAlerts} ativo{totalAlerts > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-caption font-bold px-2 py-0.5 rounded-full border"
                    style={{ background: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.30)', color: '#4ade80' }}>
                OK
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-label text-secondary">Motor de regras em tempo real · ERP</p>
            {!isLoading && (
              <span className="flex items-center gap-1.5 text-caption text-muted">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green" />
                </span>
                Ao vivo
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 text-caption text-secondary hover:text-text
                     px-3 py-1.5 rounded-xl border border-white/[0.08] hover:border-muted/40
                     hover:bg-surface/30 transition-all duration-150 flex-shrink-0"
        >
          <Settings size={13} /> Configurar
        </button>
      </div>
```

por:

```tsx
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Notificações & Alertas"
        titleExtra={
          hasAny ? (
            <span className="inline-flex items-center gap-1.5 text-caption font-bold px-2 py-0.5 rounded-full border"
                  style={{ background: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.35)', color: '#f87171' }}>
              {totalAlerts} ativo{totalAlerts > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-caption font-bold px-2 py-0.5 rounded-full border"
                  style={{ background: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.30)', color: '#4ade80' }}>
              OK
            </span>
          )
        }
        description="Motor de regras em tempo real · ERP"
        descriptionExtra={
          !isLoading && (
            <span className="flex items-center gap-1.5 text-caption text-muted">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green" />
              </span>
              Ao vivo
            </span>
          )
        }
        actions={
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 text-caption text-secondary hover:text-text
                       px-3 py-1.5 rounded-xl border border-white/[0.08] hover:border-muted/40
                       hover:bg-surface/30 transition-all duration-150 flex-shrink-0"
          >
            <Settings size={13} /> Configurar
          </button>
        }
      />
```

O `<h1>+badge` viram `title`+`titleExtra`, a `<p>+indicador` viram `description`+`descriptionExtra`, o botão "Configurar" vira `actions` — todo o JSX interno de cada peça é idêntico ao original, só realocado como props do `PageHeader`.

- [ ] **Step 3: Grids responsivos**

Substituir (duas ocorrências, uma no bento de severidade e outra nos KPIs de contexto):

```tsx
      <div className="grid grid-cols-3 gap-3">
```

por (nas duas ocorrências):

```tsx
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
```

(os cards dentro de cada `div` não mudam.)

- [ ] **Step 4: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão (`AlertasPage.tsx` não tem testes próprios hoje).

- [ ] **Step 5: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros.

- [ ] **Step 6: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true`).

No navegador, autenticado, em `/erp/alertas`:
1. `PageHeader` mostra título "Notificações & Alertas" + badge de contagem (vermelho "N ativos" ou verde "OK") ao lado; descrição "Motor de regras em tempo real · ERP" + indicador "Ao vivo" pulsante ao lado (indicador some brevemente durante o carregamento inicial).
2. Botão "Configurar" (canto direito do cabeçalho) continua abrindo o painel de settings (`SettingsPanel`).
3. Bento de severidade (Crítico/Alto/Médio) e KPIs de contexto (OS na Fila/Score Saúde/Aging Médio) degradam corretamente em ~375px (1 coluna), ~640px (2 colunas) e ~1024px+ (3 colunas).
4. Lista de alertas por severidade, regras de negócio, faixa Grafana por cidade e "Analisar com IA" continuam funcionando normalmente.
5. `/ordens`, `/erp/fila`, `/erp/qualidade`, `/erp/ranking`, `/erp/relatorios`, `/erp/planner` — cabeçalhos continuam idênticos a antes (sem regressão visual da mudança de API do `PageHeader`).

Reportar o resultado de cada item antes de prosseguir. Se algo divergir do esperado, corrigir antes do commit.

- [ ] **Step 7: Commit**

```bash
git add src/features/erp/alertas/AlertasPage.tsx
git commit -m "refactor(alertas): adota PageHeader com titleExtra/descriptionExtra, grids responsivos"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (`PageHeader` ganha `titleExtra`/`descriptionExtra`) → Task 1. §3.2 (cabeçalho + grids de Alertas) → Task 2. §5 (testes) → `PageHeader.test.tsx` estendido com TDD na Task 1 (8 testes, cobrindo os 6 consumidores existentes indiretamente via regressão da suíte completa); verificação manual cobrindo explicitamente as 6 telas anteriores + Alertas na Task 2.

**Placeholders:** nenhum "TBD" — código completo e literal; os blocos "antes" são cópia exata do arquivo lido durante o brainstorming.

**Consistência de tipos:** `PageHeaderProps.titleExtra`/`descriptionExtra` (`ReactNode`, opcionais) definidos na Task 1 são consumidos com o mesmo tipo na Task 2 (JSX condicional `hasAny ? (...) : (...)` pro badge, `!isLoading && (...)` pro indicador — ambos avaliam pra `ReactNode | false`, compatível com `ReactNode | undefined` do tipo declarado, já que `false` é um valor `ReactNode` válido em React). Grid de 3 itens (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) não é confundido com os padrões de 4 (`sm:grid-cols-4`) ou 5 itens (`md:grid-cols-3 lg:grid-cols-5`) usados nas sub-ondas anteriores.
