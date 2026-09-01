# Onda 1 — Fundação do Redesign Enterprise: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar a fundação do design system — escala tipográfica de 5 tokens, StatCard único substituindo 5 variantes, a11y nos primitivos, EmptyState/PageHeader, DataTable virtualizado e script de enforcement no CI.

**Architecture:** Nenhuma tela é redesenhada nesta onda. Criamos/endurecemos primitivos em `src/components/ui/`, migramos mecanicamente os consumidores preservando a aparência (exceto onde a spec manda neutralizar accents decorativos), e plugamos um script de auditoria que impede regressão.

**Tech Stack:** React 19 + TypeScript, Tailwind 3.4, Vitest + Testing Library, `@tanstack/react-virtual` (única dependência nova).

**Spec:** `docs/superpowers/specs/2026-07-15-redesign-enterprise-onda1-fundacao-design.md`

## Global Constraints

- Idioma de UI e comentários: **pt-BR**.
- Fonte única **Inter** (JetBrains Mono proibida); números com `tabular-nums`.
- **Cor só para status** — accents decorativos viram `neutral` na migração.
- Tamanho mínimo de texto do sistema: **11px** (`text-caption`).
- Antes de cada commit: `npx tsc --noEmit` + `npm run lint` limpos (CI quebra sem lint).
- Testes: `npm test` (vitest run). Dev server é porta 3000 — não subir servidor neste plano.
- Commits frequentes, um por task, mensagem em pt-BR no padrão convencional do repo.
- Trailer em todo commit: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Tokens tipográficos no Tailwind

**Files:**
- Modify: `tailwind.config.js` (bloco `theme.extend`, após `fontFamily`)

**Interfaces:**
- Produces: classes `text-caption` (11px/500), `text-label` (12px/500), `text-body` (13px/400), `text-title` (15px/600), `text-display` (28px/700, tracking -0.025em). Todas as tasks seguintes usam esses nomes.

- [ ] **Step 1: Adicionar `fontSize` nomeados ao config**

Em `tailwind.config.js`, dentro de `theme.extend`, logo após o bloco `fontFamily`, adicionar:

```js
      // Escala tipográfica semantizada — 5 papéis, mínimo 11px (spec Onda 1)
      fontSize: {
        caption: ['11px', { lineHeight: '1.35', fontWeight: '500' }],
        label:   ['12px', { lineHeight: '1.4',  fontWeight: '500' }],
        body:    ['13px', { lineHeight: '1.45', fontWeight: '400' }],
        title:   ['15px', { lineHeight: '1.35', fontWeight: '600' }],
        display: ['28px', { lineHeight: '1', letterSpacing: '-0.025em', fontWeight: '700' }],
      },
```

Nota: utilities `font-*` explícitas nos call sites continuam vencendo o `fontWeight` do token (ordem dos core plugins do Tailwind), então isso não quebra pesos já declarados.

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: build limpo, sem warnings de config.

- [ ] **Step 3: Smoke de geração de classe**

Run (bash): `grep -o "text-caption" dist/assets/*.css | head -1 || echo "classe ainda não usada — ok"`
Expected: como nenhum arquivo usa ainda, a classe não é gerada (JIT). Isso é esperado; a Task 2 passa a usá-las.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js
git commit -m "feat(ds): escala tipografica semantizada (caption/label/body/title/display)"
```

---

### Task 2: Migração tipográfica mecânica

**Files:**
- Modify: todos os `src/**/*.tsx` e `src/**/*.ts` com `text-[8..15px]` e `text-[28px]` (~1100 ocorrências)

**Interfaces:**
- Consumes: tokens da Task 1.
- Produces: zero ocorrências de `text-[8px]`, `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[12px]`, `text-[13px]`, `text-[15px]`, `text-[28px]` em `src/`. `text-[14px]` resolvido manualmente. Tamanhos ≥16px permanecem (exceções documentadas de heros/NOC).

- [ ] **Step 1: Substituição mecânica (bash)**

```bash
cd "C:/Cabonnet React/src"
grep -rl --include=*.tsx --include=*.ts 'text-\[\(8\|9\|10\|11\|12\|13\|15\|28\)px\]' . | while read f; do
  sed -i \
    -e 's/text-\[8px\]/text-caption/g' \
    -e 's/text-\[9px\]/text-caption/g' \
    -e 's/text-\[10px\]/text-caption/g' \
    -e 's/text-\[11px\]/text-caption/g' \
    -e 's/text-\[12px\]/text-label/g' \
    -e 's/text-\[13px\]/text-body/g' \
    -e 's/text-\[15px\]/text-title/g' \
    -e 's/text-\[28px\]/text-display/g' \
    "$f"
done
```

- [ ] **Step 2: Conferir que os banidos zeraram**

Run: `grep -rn 'text-\[\(8\|9\|10\|11\|12\|13\|15\|28\)px\]' src --include=*.tsx --include=*.ts | wc -l`
Expected: `0`

- [ ] **Step 3: Resolver `text-[14px]` manualmente (~22 ocorrências)**

Run: `grep -rn 'text-\[14px\]' src --include=*.tsx --include=*.ts`

Regra de decisão, aplicada ocorrência a ocorrência:
- É título de card/painel/página, ou texto com `font-semibold`/`font-bold` funcionando como heading → `text-title`.
- É conteúdo corrente, mensagem, parágrafo → `text-body`.

Exemplo já conhecido: `DashboardPage.tsx:62` (`Servidor indisponível`, heading de estado de erro) → `text-title`.

- [ ] **Step 4: Verificação estática**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tudo limpo. Se algum teste assertar classe antiga (ex.: `text-[11px]`), atualizar o teste para o token novo.

- [ ] **Step 5: Build + inspeção visual dirigida**

Run: `npm run build`
Expected: limpo.

Checagem visual (usuário fará a revisão completa depois; aqui só sanity): abrir 3 arquivos com maior densidade de mudanças e conferir que nenhum truncamento óbvio surgiu por texto 1–3px maior — candidatos: `src/components/ui/GlobalSearch.tsx` (chips `<kbd>` eram 9px), `src/components/ui/DataTable.tsx` (mapa `textSize` agora `normal: text-label, compact: text-caption, mini: text-caption`), `src/features/dashboard/DashboardKpiPrimitives.tsx`. Ajustar padding/truncate pontualmente se algo estourar.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "refactor(ds): migra 20 tamanhos ad-hoc para a escala tipografica (min 11px)"
```

---

### Task 3: StatCard — componente canônico (TDD)

**Files:**
- Create: `src/components/ui/StatCard.tsx`
- Create: `src/components/ui/StatCard.test.tsx`

**Interfaces:**
- Produces (usado pelas Tasks 4–6):

```tsx
export type StatTone  = 'neutral' | 'critical' | 'warning' | 'ok' | 'info'
export type StatScope = 'aovivo' | 'periodo'
export type StatSize  = 'md' | 'sm' | 'inline'
export interface StatTrend { delta: number; pct?: number; higherIsBetter?: boolean }
export interface StatCardProps {
  title: string
  value: ReactNode
  sub?: string
  icon?: ComponentType<{ size?: number; className?: string }>
  tone?: StatTone            // default 'neutral'
  trend?: StatTrend | null
  scope?: StatScope
  size?: StatSize            // default 'md'
  onClick?: () => void
  delay?: number             // ms de atraso da animação de entrada
  className?: string
}
export function StatCard(props: StatCardProps): JSX.Element
export function accentToTone(accent?: string): StatTone
export function TrendPill({ trend }: { trend?: StatTrend | null }): JSX.Element | null
```

Semântica visual (base: `BentoKPICard`, padrão aprovado do dashboard):
- `neutral`: sem cor. `critical`/`warning`: borda esquerda 2px + valor colorido (red/orange). `ok`: borda esquerda verde, valor neutro. `info`: borda esquerda + valor em primary.
- `md`: card `rounded-md border border-border bg-card p-4`, valor adaptativo 34px/28px. `sm`: tile `p-3` centrado, valor 22px (cobre os tiles do Fechamento). `inline`: par label+valor sem chrome de card (cobre o KpiBadge do Mapa).
- `accentToTone`: `red→critical`, `orange|yellow→warning`, `green→ok`, resto→`neutral` (cor só para status).

- [ ] **Step 1: Escrever os testes (falhando)**

`src/components/ui/StatCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatCard, accentToTone } from './StatCard'
import { TrendingUp } from 'lucide-react'

describe('accentToTone', () => {
  it('mapeia accents de status', () => {
    expect(accentToTone('red')).toBe('critical')
    expect(accentToTone('orange')).toBe('warning')
    expect(accentToTone('yellow')).toBe('warning')
    expect(accentToTone('green')).toBe('ok')
  })
  it('neutraliza accents decorativos', () => {
    for (const a of ['primary', 'cyan', 'teal', 'purple', 'secondary', 'muted', undefined])
      expect(accentToTone(a)).toBe('neutral')
  })
})

describe('StatCard', () => {
  it('renderiza título, valor e sub', () => {
    render(<StatCard title="Total OS" value={42} sub="no período" />)
    expect(screen.getByText('Total OS')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('no período')).toBeInTheDocument()
  })

  it('renderiza ícone quando fornecido', () => {
    const { container } = render(<StatCard title="KPI" value={1} icon={TrendingUp} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('sem onClick não tem role de botão', () => {
    render(<StatCard title="KPI" value={1} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('com onClick é um botão acessível por teclado', () => {
    const onClick = vi.fn()
    render(<StatCard title="KPI" value={5} onClick={onClick} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('tabindex', '0')
    fireEvent.click(btn)
    fireEvent.keyDown(btn, { key: 'Enter' })
    fireEvent.keyDown(btn, { key: ' ' })
    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('renderiza badge de escopo', () => {
    render(<StatCard title="KPI" value={1} scope="aovivo" />)
    expect(screen.getByText(/Ao vivo/i)).toBeInTheDocument()
  })

  it('renderiza trend em pct', () => {
    render(<StatCard title="KPI" value={10} trend={{ delta: 3, pct: 30 }} />)
    expect(screen.getByText(/30%/)).toBeInTheDocument()
  })

  it('tone critical coloriza o valor', () => {
    render(<StatCard title="KPI" value={7} tone="critical" />)
    expect(screen.getByText('7')).toHaveStyle({ color: 'rgb(var(--c-red))' })
  })

  it('tone neutral não coloriza o valor', () => {
    render(<StatCard title="KPI" value={7} />)
    expect(screen.getByText('7')).toHaveStyle({ color: 'rgb(var(--c-text))' })
  })

  it('size inline renderiza par label/valor', () => {
    render(<StatCard title="Críticas" value={3} size="inline" />)
    expect(screen.getByText('Críticas')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('size sm renderiza tile compacto', () => {
    render(<StatCard title="Total" value={99} size="sm" />)
    expect(screen.getByText('99')).toBeInTheDocument()
  })

  it('aceita className adicional', () => {
    const { container } = render(<StatCard title="KPI" value={1} className="minha-classe" />)
    expect(container.firstChild).toHaveClass('minha-classe')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/ui/StatCard.test.tsx`
Expected: FAIL — módulo `./StatCard` não existe.

- [ ] **Step 3: Implementar `StatCard.tsx`**

```tsx
import type { ComponentType, KeyboardEvent, ReactNode } from 'react'
import { Minus, TrendingUp, TrendingDown, Calendar } from 'lucide-react'

export type StatTone  = 'neutral' | 'critical' | 'warning' | 'ok' | 'info'
export type StatScope = 'aovivo' | 'periodo'
export type StatSize  = 'md' | 'sm' | 'inline'

export interface StatTrend { delta: number; pct?: number; higherIsBetter?: boolean }

// Cor só para status: tons semânticos apontam para os tokens de index.css.
const TONE_COLOR: Record<Exclude<StatTone, 'neutral'>, string> = {
  critical: 'rgb(var(--c-red))',
  warning:  'rgb(var(--c-orange))',
  ok:       'rgb(var(--c-green))',
  info:     'rgb(var(--c-primary))',
}

/** Converte o AccentColor legado para tone. Accents decorativos viram neutral. */
export function accentToTone(accent?: string): StatTone {
  switch (accent) {
    case 'red':    return 'critical'
    case 'orange':
    case 'yellow': return 'warning'
    case 'green':  return 'ok'
    default:       return 'neutral'
  }
}

export function TrendPill({ trend }: { trend?: StatTrend | null }) {
  const { delta, pct, higherIsBetter } = trend ?? {}
  if (delta == null) return null
  const positive = (delta > 0) === (higherIsBetter !== false)
  const color    = positive ? 'rgb(var(--c-green))' : 'rgb(var(--c-red))'
  const Icon     = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-caption font-bold flex-shrink-0"
         style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`,
                  borderColor: `color-mix(in srgb, ${color} 20%, transparent)`, color }}>
      <Icon size={9} />
      {pct != null ? `${pct}%` : (delta > 0 ? `+${delta}` : delta)}
    </div>
  )
}

export interface StatCardProps {
  title:      string
  value:      ReactNode
  sub?:       string
  icon?:      ComponentType<{ size?: number; className?: string }>
  tone?:      StatTone
  trend?:     StatTrend | null
  scope?:     StatScope
  size?:      StatSize
  onClick?:   () => void
  delay?:     number
  className?: string
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

export function StatCard({
  title, value, sub, icon: Icon, tone = 'neutral', trend, scope,
  size = 'md', onClick, delay = 0, className = '',
}: StatCardProps) {
  const statusColor = tone !== 'neutral' ? TONE_COLOR[tone] : undefined
  // ok mantém o valor neutro (padrão aprovado do dashboard): a borda já sinaliza.
  const valColor = (tone === 'critical' || tone === 'warning' || tone === 'info')
    ? statusColor! : 'rgb(var(--c-text))'

  const interactive = onClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
        },
      }
    : {}

  if (size === 'inline') {
    return (
      <div className={`flex items-center gap-1.5 ${className}`} {...interactive}>
        <span className="text-caption font-bold uppercase tracking-[0.04em] text-muted">{title}:</span>
        <span className="text-body font-semibold tabular-nums" style={{ color: valColor }}>{value}</span>
      </div>
    )
  }

  if (size === 'sm') {
    return (
      <div
        {...interactive}
        style={{ animationDelay: `${delay}ms` }}
        className={`bg-bg rounded-lg p-3 text-center animate-card-enter
                    ${onClick ? `cursor-pointer ${FOCUS_RING}` : ''} ${className}`}
      >
        <p className="text-[22px] font-bold tabular-nums leading-none" style={{ color: valColor }}>{value}</p>
        <p className="text-caption text-muted mt-1 uppercase tracking-wide">{title}</p>
        {sub && <p className="text-caption text-muted mt-0.5">{sub}</p>}
      </div>
    )
  }

  return (
    <div
      {...interactive}
      style={{ animationDelay: `${delay}ms`,
               borderLeft: statusColor ? `2px solid ${statusColor}` : undefined }}
      className={`relative rounded-md border border-border bg-card p-4 animate-card-enter
                  transition-colors duration-150 hover:border-muted/40
                  ${onClick ? `cursor-pointer ${FOCUS_RING}` : ''} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <span className="flex items-center gap-1.5 text-caption font-semibold text-secondary min-w-0">
          {Icon && <Icon size={12} className="text-muted flex-shrink-0" />}
          <span className="truncate">{title}</span>
        </span>
        {trend
          ? <TrendPill trend={trend} />
          : scope && (
            <span className="flex items-center gap-1 text-caption uppercase tracking-wide text-muted flex-shrink-0">
              {scope === 'aovivo'
                ? <><span className="w-1 h-1 rounded-full bg-green flex-shrink-0" /> Ao vivo</>
                : <><Calendar size={8} className="flex-shrink-0" /> Período</>}
            </span>
          )}
      </div>

      <p className="tabular-nums leading-none"
         style={{ fontSize: String(value).length > 4 ? '28px' : '34px',
                  fontWeight: 700, letterSpacing: '-0.03em', color: valColor }}>
        {value ?? '—'}
      </p>

      {sub && <p className="text-caption text-muted leading-snug mt-2">{sub}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Rodar testes**

Run: `npx vitest run src/components/ui/StatCard.test.tsx`
Expected: PASS (todos). Se `toHaveStyle` com `color-mix` reclamar no jsdom, restringir a asserção ao valor (`color`) como está nos testes — os testes acima não assertam background do TrendPill.

- [ ] **Step 5: Verificação estática + commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add src/components/ui/StatCard.tsx src/components/ui/StatCard.test.tsx
git commit -m "feat(ds): StatCard canonico (tones semanticos, 3 tamanhos, a11y por teclado)"
```

---

### Task 4: Migrar consumidores de `KPICard` → `StatCard` e deletar `KPICard`

**Files:**
- Modify: `src/features/erp/acao/CentralAcaoPage.tsx`, `src/features/erp/fila/FilaPage.tsx`, `src/features/erp/ranking/RankingTecnicosPage.tsx`, `src/features/juniper/JuniperPage.tsx`, `src/features/ordens/OrdensPage.tsx`
- Delete: `src/components/ui/KPICard.tsx`, `src/components/ui/KPICard.test.tsx`

**Interfaces:**
- Consumes: `StatCard`, `accentToTone` da Task 3.
- Produces: zero imports de `ui/KPICard` no repositório.

Transformação por call site — regra única: trocar import, `<KPICard` → `<StatCard`, e `accent="X"` → `tone="Y"` conforme a tabela (demais props `title/value/sub/icon/onClick/trend/className` são idênticas e ficam como estão):

| Página | accent → tone |
|---|---|
| CentralAcaoPage (3 cards) | `red→critical`, `yellow→warning`, `primary→` *(omitir — neutral é default)* |
| FilaPage (5 cards) | `red→critical`, `orange→warning`, `yellow→warning`, `green→ok`, `teal→` *(omitir)* |
| RankingTecnicosPage (4 cards) | `primary→` *(omitir)*, `teal→` *(omitir)*, `orange→warning`, `red→critical` |
| JuniperPage (5 cards) | `primary/cyan/teal/secondary/muted →` *(omitir todos — neutros)* |
| OrdensPage (6 cards) | `primary→` *(omitir)*, `red→critical`, `yellow→warning`, `green→ok`, `cyan→` *(omitir)*, `orange→warning` |

- [ ] **Step 1: Migrar os 5 arquivos**

Exemplo completo (OrdensPage, os 6 cards — os outros arquivos seguem exatamente o mesmo padrão):

```tsx
import { StatCard } from '../../components/ui/StatCard'   // substitui o import de KPICard

<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
  <StatCard title="Total OS" value={os.kpis.total} sub="ver todas" delay={0}
            onClick={() => { os.clearFilters(); scrollToTable() }} />
  <StatCard title="Críticas" value={os.kpis.criticas} tone="critical" sub="SLA 2× excedido" delay={40}
            onClick={() => { os.clearFilters(); os.setCritico(true); scrollToTable() }} />
  <StatCard title="Sem equipe" value={os.kpis.semEquipe} tone="warning" icon={AlertTriangle} sub="sem alocação" delay={80}
            onClick={() => { os.clearFilters(); os.setSemEquipe(true); scrollToTable() }} />
  <StatCard title="Agend. hoje" value={os.kpis.agendHoje} tone="ok" sub="para hoje" delay={120}
            onClick={() => { os.clearFilters(); os.setAgendHoje(true); scrollToTable() }} />
  <StatCard title="Amanhã" value={os.kpis.agendAmanha} icon={CalendarClock} sub="ativas p/ amanhã · geral" delay={160}
            onClick={() => { os.clearFilters(); os.setAgendAmanha(true); scrollToTable() }} />
  <StatCard title="Agend. Futuro" value={os.kpis.agendFuturo} tone="warning" icon={CalendarClock} sub="ativas, amanhã em diante · geral" delay={200}
            onClick={() => { os.clearFilters(); os.setAgendFuturo(true); scrollToTable() }} />
</div>
```

Atenção nos detalhes:
- Onde o grid pai tinha a classe `stagger`, removê-la e passar `delay={i*40}` (o StatCard tem animação própria; as duas juntas conflitam).
- FilaPage "Cumprimento SLA" mantém o `trend={...}` como está.
- Grep para não deixar sobras: `grep -rn "KPICard" src --include=*.tsx | grep -v StatCard` deve retornar só o próprio `components/ui/KPICard*`.

- [ ] **Step 2: Deletar KPICard**

```bash
git rm src/components/ui/KPICard.tsx src/components/ui/KPICard.test.tsx
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: tudo limpo (o teste do KPICard saiu junto com o componente; a cobertura equivalente vive em `StatCard.test.tsx`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(ds): migra KPICard para StatCard em ordens/fila/acao/ranking/juniper"
```

---

### Task 5: Migrar Dashboard (`BentoKPICard` → `StatCard`) e deletar duplicata

**Files:**
- Modify: `src/features/dashboard/DashboardPage.tsx`, `src/features/dashboard/DashboardKpiPrimitives.tsx`
- Verify: demais arquivos de `src/features/dashboard/` que importem `TrendPill`/`BentoKPICard`

**Interfaces:**
- Consumes: `StatCard`, `accentToTone`, `TrendPill` da Task 3.
- Produces: `DashboardKpiPrimitives.tsx` contém apenas `SectionLabel` (promover para ui/ fica para a Onda 2).

- [ ] **Step 1: Trocar os dois usos em `DashboardPage.tsx`**

Os dois grids (riskKpis/riskStats e perfKpis/perfStats) trocam:

```tsx
import { StatCard, accentToTone } from '../../components/ui/StatCard'
import { SectionLabel } from './DashboardKpiPrimitives'

// antes: <BentoKPICard kpi={k} icon={KPI_ICONS[k.id]} delay={i*60} onClick={...} scope={...} />
<StatCard
  key={k.id}
  title={k.title}
  value={k.value}
  sub={k.sub}
  tone={accentToTone(k.accent)}
  trend={k.trend ?? undefined}
  icon={KPI_ICONS[k.id]}
  delay={i * 60}
  onClick={KPI_FILTERS[k.id] ? () => openKpi(k) : undefined}
  scope={ALLROWS_KPIS.has(k.id) ? 'aovivo' : 'periodo'}
/>
```

Aplicar nos 4 lugares que renderizam `BentoKPICard` (2 no branch de loading com `stats.fila`, 2 no corpo principal). No branch de loading os cards não têm `onClick` — omitir.

- [ ] **Step 2: Limpar `DashboardKpiPrimitives.tsx`**

Remover `BentoKPICard` e `TrendPill` do arquivo (ficam só `SectionLabel` e os imports que ele usa). Antes, conferir consumidores externos:

Run: `grep -rn "TrendPill\|BentoKPICard" src --include=*.tsx | grep -v StatCard | grep -v DashboardKpiPrimitives`
Para cada uso de `TrendPill` fora do arquivo (ex.: `DashboardPaineis.tsx`), trocar o import para `from '../../components/ui/StatCard'`.

- [ ] **Step 3: Verificar + commit**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`

```bash
git add -A src/features/dashboard
git commit -m "refactor(ds): dashboard usa StatCard; remove BentoKPICard duplicado"
```

---

### Task 6: Migrar `KpiCard` (Qualidade), tiles do `KPIHeader` (Fechamento) e `KpiBadge` (Mapa)

**Files:**
- Modify: `src/features/erp/qualidade/QualidadePage.tsx`, `src/features/erp/qualidade/QualidadeComponents.tsx`
- Modify: `src/features/fechamento/FechamentoPage.tsx`
- Modify: `src/features/mapa/MapaPage.tsx`, `src/features/mapa/MapaComponents.tsx`

**Interfaces:**
- Consumes: `StatCard` (sizes `md`, `sm`, `inline`).
- Produces: `KpiCard`, `KpiBadge` deletados; `KPIHeader` do Fechamento mantém header/botões mas os tiles internos viram `StatCard size="sm"`.

- [ ] **Step 1: Qualidade — 5 call sites**

Em `QualidadePage.tsx`, adicionar helper local (a página decide o tone pelos mesmos thresholds do `taxaColor`):

```tsx
import { StatCard, type StatTone } from '../../../components/ui/StatCard'

function taxaTone(taxa: number): StatTone {
  if (taxa >= 15) return 'critical'
  if (taxa >= 8)  return 'warning'
  return 'ok'
}
```

Substituições (mesmos `label→title`, `sub` igual, `delay` igual):
- "Taxa de Primeira Visita": `tone={taxaTone(taxaGeral)}`
- "Revisitas · …": `tone={taxaTone(taxaGeral)}`
- "Inst → Manut (BI)" (`#3b82f6`): omitir tone (neutral)
- "Manut Repetida (BI)" (`#f97316`): `tone="warning"`
- "Serviço → Manut (BI)" (`#22d3ee`): omitir tone (neutral)

Depois remover `KpiCard` de `QualidadeComponents.tsx` e do import na página. O `fmt(value)` que o KpiCard fazia passa para o call site: `value={fmt(data?.kpis.rev_inst ?? 0)}` etc. (o `fmt` já é importado na página; conferir).

- [ ] **Step 2: Fechamento — tiles do KPIHeader**

Em `FechamentoPage.tsx`, dentro do `KPIHeader`, substituir o `kpis.map` de tiles por:

```tsx
import { StatCard, type StatTone } from '../../components/ui/StatCard'

const kpis: { label: string; value: number; tone?: StatTone }[] = [
  { label: 'Total OS',     value: stats.total },
  { label: 'Concluídas',   value: stats.concluidas, tone: 'ok' },
  { label: 'Sem Execução', value: stats.semExec,    tone: 'warning' },
  { label: 'Pendentes',    value: stats.pendentes,  tone: 'warning' },
  { label: 'SLA Vencidas', value: stats.slaVenc,    tone: stats.slaVenc > 0 ? 'critical' : 'ok' },
]
// ...
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
  {kpis.map(k => <StatCard key={k.label} size="sm" title={k.label} value={k.value} tone={k.tone} />)}
</div>
```

Header (título/período) e botões PDF/CSV/Imprimir ficam como estão.

- [ ] **Step 3: Mapa — 6 call sites de KpiBadge**

Em `MapaPage.tsx`, trocar import e usos:

```tsx
import { StatCard } from '../../components/ui/StatCard'

<StatCard size="inline" title={filterStatus === '' ? 'OS Ativas' : 'OS'} value={rows.length} />
<StatCard size="inline" title="Críticas"  value={totalCriticos}  tone="critical" />
<StatCard size="inline" title="Excedidas" value={totalExcedidos} tone="warning" />
<StatCard size="inline" title="Aging med" value={`${avgAging}d`} />
{/* condicional: */}
<StatCard size="inline" title="Cidades" value={cidades.length} />
<StatCard size="inline" title="Bairros" value={bairros.length} />
```

(`text-cyan`/`text-primary`/`text-purple` eram decorativos → neutros.) Remover `KpiBadge` de `MapaComponents.tsx` e do import agregado em `MapaPage.tsx`.

- [ ] **Step 4: Verificar + commit**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Run: `grep -rn "KpiCard\|KpiBadge\|BentoKPICard\|ui/KPICard" src --include=*.tsx` → Expected: nenhuma ocorrência.

```bash
git add -A
git commit -m "refactor(ds): qualidade/fechamento/mapa migram para StatCard; remove 3 duplicatas"
```

---

### Task 7: A11y nos primitivos — Card interativo, sort do DataTable, aria-labels

**Files:**
- Modify: `src/components/ui/Card.tsx`
- Create: `src/components/ui/Card.test.tsx`
- Modify: `src/components/ui/DataTable.tsx` (header ordenável)
- Create: `src/components/ui/DataTable.test.tsx`
- Modify: botões só-ícone em `src/components/ui/*.tsx` sem `aria-label`

**Interfaces:**
- Produces: `Card` com `onClick` expõe `role="button"`, `tabIndex=0`, Enter/Espaço e anel focus-visible. `<th>` ordenável expõe `aria-sort` e um `<button>` interno focável. Assinaturas públicas não mudam.

- [ ] **Step 1: Testes do Card (falhando)**

`src/components/ui/Card.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { Card } from './Card'

describe('Card interativo', () => {
  it('sem onClick não é botão', () => {
    render(<Card>conteúdo</Card>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('com onClick é botão acessível', () => {
    const onClick = vi.fn()
    render(<Card onClick={onClick}>conteúdo</Card>)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(btn, { key: 'Enter' })
    fireEvent.keyDown(btn, { key: ' ' })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(3)
  })
})
```

Run: `npx vitest run src/components/ui/Card.test.tsx` → Expected: FAIL (sem role/keydown).

- [ ] **Step 2: Implementar no Card**

```tsx
import type { ReactNode, MouseEventHandler, KeyboardEvent } from 'react'

interface CardProps {
  children:   ReactNode
  className?: string
  onClick?:   MouseEventHandler<HTMLDivElement>
}

export function Card({ children, className = '', onClick }: CardProps) {
  const interactive = !!onClick
  const a11y = interactive
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            ;(e.currentTarget as HTMLDivElement).click()
          }
        },
      }
    : {}
  return (
    <div
      onClick={onClick}
      {...a11y}
      className={`rounded-xl bg-card border border-white/[0.08] card-premium
                  ${interactive
                    ? `cursor-pointer hover:bg-card-high hover:border-muted/30 hover:shadow-md active:scale-[.995]
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`
                    : ''}
                  ${className}`}
    >
      {children}
    </div>
  )
}
```

(Remover a prop deprecated `tilt` — grep antes: `grep -rn "tilt" src --include=*.tsx | grep -v Card.tsx`; se houver uso, apenas apagar a prop no call site.)

Run: `npx vitest run src/components/ui/Card.test.tsx` → Expected: PASS.

- [ ] **Step 3: Testes do DataTable (falhando)**

`src/components/ui/DataTable.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DataTable } from './DataTable'

const columns = [
  { key: 'nome', label: 'Nome' },
  { key: 'qtd',  label: 'Qtd', align: 'right' as const },
]
const rows = [
  { _id: 1, nome: 'Bravo', qtd: 2 },
  { _id: 2, nome: 'Alfa',  qtd: 9 },
]

describe('DataTable — sort acessível', () => {
  it('header ordenável é um botão', () => {
    render(<DataTable columns={columns} rows={rows} />)
    expect(screen.getByRole('button', { name: 'Nome' })).toBeInTheDocument()
  })
  it('clicar ordena e expõe aria-sort', () => {
    render(<DataTable columns={columns} rows={rows} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nome' }))
    const th = screen.getByRole('button', { name: 'Nome' }).closest('th')!
    expect(th).toHaveAttribute('aria-sort', 'ascending')
    const primeiraLinha = screen.getAllByRole('row')[1]
    expect(within(primeiraLinha).getByText('Alfa')).toBeInTheDocument()
  })
})
```

Run: `npx vitest run src/components/ui/DataTable.test.tsx` → Expected: FAIL.

- [ ] **Step 4: Implementar header acessível**

No `DataTable.tsx`, substituir o conteúdo do `<th>`:

```tsx
<th
  key={col.key ?? col.label}
  scope="col"
  aria-sort={col.key && sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
  className={`px-3 py-2 text-left text-caption font-bold uppercase tracking-[0.6px] text-muted
              whitespace-nowrap select-none
              ${col.align === 'right' ? 'text-right' : ''}
              ${col.className ?? ''}`}
>
  {col.key ? (
    <button
      type="button"
      onClick={() => handleSort(col.key)}
      className="inline-flex items-center gap-1 uppercase tracking-[0.6px] font-bold
                 hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
    >
      {col.label}
      {sortKey === col.key && (sortDir === 'asc' ? <ChevronUp size={9} /> : <ChevronDown size={9} />)}
    </button>
  ) : (
    <span className="inline-flex items-center gap-1">{col.label}</span>
  )}
</th>
```

E remover `onClick`/`cursor-pointer` do próprio `<th>`.

Run: `npx vitest run src/components/ui/DataTable.test.tsx` → Expected: PASS.

- [ ] **Step 5: Auditoria de aria-label em botões só-ícone**

Run: `grep -rn -B1 -A3 "<button" src/components/ui --include=*.tsx | grep -B2 -A2 "size={1[0-9]}" | grep -L aria` (orientativo). Revisar manualmente cada `<button>` de `src/components/ui/*.tsx` cujo conteúdo é apenas um ícone e adicionar `aria-label` descritivo em pt-BR. Padrão:

```tsx
<button aria-label="Fechar" onClick={onClose} ...>
  <X size={14} />
</button>
```

Candidatos conhecidos: fechar de `Modal.tsx`/`Drawer.tsx`, limpar de `SearchBox.tsx`, toggle de `AnimatedThemeToggler.tsx`.

- [ ] **Step 6: Verificar + commit**

Run: `npx tsc --noEmit && npm run lint && npm test`

```bash
git add -A src/components/ui
git commit -m "feat(a11y): Card e DataTable navegaveis por teclado; aria-label em botoes de icone"
```

---

### Task 8: EmptyState + PageHeader (TDD) e integração no DataTable

**Files:**
- Create: `src/components/ui/EmptyState.tsx`, `src/components/ui/EmptyState.test.tsx`
- Create: `src/components/ui/PageHeader.tsx`, `src/components/ui/PageHeader.test.tsx`
- Modify: `src/components/ui/DataTable.tsx` (linha vazia usa EmptyState)

**Interfaces:**
- Produces:

```tsx
export interface EmptyStateProps {
  icon?:        ComponentType<{ size?: number; className?: string }>
  title:        string
  description?: string
  action?:      { label: string; onClick: () => void }
  className?:   string
}
export function EmptyState(props: EmptyStateProps): JSX.Element

export interface PageHeaderProps {
  title:        string
  description?: string
  actions?:     ReactNode
  className?:   string
}
export function PageHeader(props: PageHeaderProps): JSX.Element
```
- DataTable ganha props opcionais `emptyTitle?: string` (default `'Nenhum resultado encontrado'`) e `emptyDescription?: string`.

- [ ] **Step 1: Testes (falhando)**

`src/components/ui/EmptyState.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from './EmptyState'
import { Inbox } from 'lucide-react'

describe('EmptyState', () => {
  it('renderiza título e descrição', () => {
    render(<EmptyState icon={Inbox} title="Sem ordens" description="Ajuste os filtros." />)
    expect(screen.getByText('Sem ordens')).toBeInTheDocument()
    expect(screen.getByText('Ajuste os filtros.')).toBeInTheDocument()
  })
  it('renderiza ação e dispara onClick', () => {
    const onClick = vi.fn()
    render(<EmptyState title="Vazio" action={{ label: 'Limpar filtros', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(onClick).toHaveBeenCalled()
  })
})
```

`src/components/ui/PageHeader.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
```

Run: `npx vitest run src/components/ui/EmptyState.test.tsx src/components/ui/PageHeader.test.tsx` → FAIL.

- [ ] **Step 2: Implementar**

`src/components/ui/EmptyState.tsx`:

```tsx
import type { ComponentType } from 'react'

export interface EmptyStateProps {
  icon?:        ComponentType<{ size?: number; className?: string }>
  title:        string
  description?: string
  action?:      { label: string; onClick: () => void }
  className?:   string
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center mb-3">
          <Icon size={18} className="text-muted" />
        </div>
      )}
      <p className="text-body font-semibold text-text">{title}</p>
      {description && <p className="text-caption text-muted mt-1 max-w-xs leading-relaxed">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 text-caption font-semibold text-primary border border-primary/30 rounded-md px-3 py-1.5
                     hover:bg-primary/10 transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
```

`src/components/ui/PageHeader.tsx`:

```tsx
import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title:        string
  description?: string
  actions?:     ReactNode
  className?:   string
}

export function PageHeader({ title, description, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 flex-wrap ${className}`}>
      <div className="min-w-0">
        <h1 className="text-title text-text">{title}</h1>
        {description && <p className="text-label text-muted mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
```

Run: os dois testes → PASS.

- [ ] **Step 3: Integrar no DataTable**

Em `DataTable.tsx`: adicionar `emptyTitle?: string` e `emptyDescription?: string` às props e trocar a linha vazia por:

```tsx
import { Inbox } from 'lucide-react'
import { EmptyState } from './EmptyState'

{sorted.length === 0 && (
  <tr>
    <td colSpan={columns.length}>
      <EmptyState icon={Inbox}
                  title={emptyTitle ?? 'Nenhum resultado encontrado'}
                  description={emptyDescription} />
    </td>
  </tr>
)}
```

- [ ] **Step 4: Verificar + commit**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`

```bash
git add src/components/ui
git commit -m "feat(ds): EmptyState e PageHeader; DataTable com estado vazio padrao"
```

---

### Task 9: DataTable v2 — virtualização condicional + header sticky opcional

**Files:**
- Modify: `package.json` (dep nova), `src/components/ui/DataTable.tsx`, `src/components/ui/DataTable.test.tsx`

**Interfaces:**
- Produces: DataTable com props novas `stickyHeader?: boolean` (default `false`) e virtualização automática quando `rows.length > 100`. API existente inalterada.

- [ ] **Step 1: Instalar dependência**

Run: `npm install @tanstack/react-virtual`

- [ ] **Step 2: Teste de virtualização (falhando)**

Adicionar em `DataTable.test.tsx`:

```tsx
it('virtualiza listas grandes (renderiza menos linhas que o total)', () => {
  const muitas = Array.from({ length: 500 }, (_, i) => ({ _id: i, nome: `Item ${i}`, qtd: i }))
  render(<DataTable columns={columns} rows={muitas} />)
  const bodyRows = screen.getAllByRole('row').length - 1 // menos o header
  expect(bodyRows).toBeLessThan(200)
})

it('não virtualiza listas pequenas', () => {
  render(<DataTable columns={columns} rows={rows} />)
  expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1)
})
```

Run: `npx vitest run src/components/ui/DataTable.test.tsx` → Expected: primeiro teste FAIL (500 linhas renderizadas).

- [ ] **Step 3: Implementar virtualização por janela**

Em `DataTable.tsx`, usando `useWindowVirtualizer` (scroll da própria página, sem container interno — preserva a UX atual):

```tsx
import { useRef, useState, type ReactNode } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

const VIRTUALIZE_MIN = 100
const ROW_PX: Record<Density, number> = { normal: 36, compact: 28, mini: 20 }
```

Dentro do componente, após calcular `sorted`:

```tsx
const wrapRef = useRef<HTMLDivElement>(null)
const virtual = sorted.length > VIRTUALIZE_MIN
const virtualizer = useWindowVirtualizer({
  count: virtual ? sorted.length : 0,
  estimateSize: () => ROW_PX[density],
  overscan: 15,
  scrollMargin: wrapRef.current?.offsetTop ?? 0,
})
const items = virtual ? virtualizer.getVirtualItems() : null
const padTop = items?.length ? items[0].start - virtualizer.options.scrollMargin : 0
const padBottom = items?.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0
const visible = items ? items.map(v => sorted[v.index]) : sorted
```

No JSX: raiz vira `<div ref={wrapRef} className={...}>`; o `<tbody>` mapeia `visible` em vez de `sorted`, com espaçadores:

```tsx
<tbody>
  {padTop > 0 && <tr aria-hidden="true" style={{ height: padTop }} />}
  {visible.map((row, i) => (
    /* mesmo <tr> de hoje, key = row._id ?? (items ? items[i].index : i) */
  ))}
  {padBottom > 0 && <tr aria-hidden="true" style={{ height: padBottom }} />}
  {/* linha vazia com EmptyState permanece */}
</tbody>
```

Prop `stickyHeader?: boolean`: quando true, `<thead className="... sticky top-24 z-base bg-card">` (offset 96px = navbar + barra de filtro). Default false — as páginas ativam nas suas ondas.

- [ ] **Step 4: Rodar testes**

Run: `npx vitest run src/components/ui/DataTable.test.tsx`
Expected: PASS. Se o jsdom render 0 linhas virtuais (altura de viewport indefinida), definir no teste `Object.defineProperty(window, 'innerHeight', { value: 800 })` antes do render.

- [ ] **Step 5: Verificação completa + commit**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`

```bash
git add package.json package-lock.json src/components/ui/DataTable.tsx src/components/ui/DataTable.test.tsx
git commit -m "feat(ds): DataTable virtualizado acima de 100 linhas; header sticky opcional"
```

---

### Task 10: Enforcement — `npm run audit:ds` + CI

**Files:**
- Create: `scripts/audit-ds.mjs`, `scripts/audit-ds-baseline.json`
- Modify: `package.json` (script), `.github/workflows/CI.yml` (step após lint)

**Interfaces:**
- Produces: `npm run audit:ds` com exit ≠ 0 em violação. Regras: (1) `text-[8px|9px|10px]` banidos; (2) imports de componentes deletados; (3) hex novos em `.tsx` fora da baseline.

- [ ] **Step 1: Escrever o script**

`scripts/audit-ds.mjs`:

```js
#!/usr/bin/env node
// Auditoria do design system — impede regressão da Onda 1.
// Uso: node scripts/audit-ds.mjs [dir]   (default: src)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.argv[2] ?? 'src'
const BASELINE = JSON.parse(readFileSync(new URL('./audit-ds-baseline.json', import.meta.url), 'utf8'))

const RULES = [
  {
    name: 'Tamanho de fonte banido (mínimo do sistema é 11px / text-caption)',
    test: (src) => [...src.matchAll(/text-\[(?:8|9|10)px\]/g)].map(m => m[0]),
  },
  {
    name: 'Import de componente removido do design system',
    test: (src) => [...src.matchAll(/from\s+['"][^'"]*ui\/KPICard['"]|(?:\bBentoKPICard\b|\bKpiBadge\b)/g)].map(m => m[0]),
  },
]

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith('.test.tsx') && !name.endsWith('.test.ts')) yield p
  }
}

let violations = 0
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8')
  const rel = relative('.', file).replace(/\\/g, '/')

  for (const rule of RULES) {
    for (const hit of rule.test(src)) {
      console.error(`✗ ${rel}: ${rule.name} → "${hit}"`)
      violations++
    }
  }

  // Regra 3: hex fora da baseline (tokens do index.css são globais; o resto é por arquivo)
  if (file.endsWith('.tsx')) {
    const allowed = new Set([...BASELINE.globalHex, ...(BASELINE.files[rel] ?? [])])
    for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const hex = m[0].toLowerCase()
      if (!allowed.has(hex)) {
        console.error(`✗ ${rel}: hex fora dos tokens → "${hex}" (adicione um token ou justifique na baseline)`)
        violations++
      }
    }
  }
}

if (violations) {
  console.error(`\naudit:ds FALHOU — ${violations} violação(ões).`)
  process.exit(1)
}
console.log('audit:ds OK')
```

- [ ] **Step 2: Gerar a baseline**

`scripts/audit-ds-baseline.json` começa com os hex dos tokens (`globalHex`) e a fotografia dos hex legados por arquivo (`files`) — assim só **novos** hex falham:

```bash
cd "C:/Cabonnet React"
node -e "
const { execSync } = require('child_process')
const out = execSync('grep -rno \"#[0-9a-fA-F]\\\\{6\\\\}\" src --include=*.tsx', {encoding:'utf8'})
const files = {}
for (const line of out.trim().split('\n')) {
  const m = line.match(/^(.*?):\d+:(#[0-9a-fA-F]{6})$/)
  if (!m) continue
  const f = m[1].replace(/\\\\/g,'/')
  ;(files[f] ??= new Set()).add(m[2].toLowerCase())
}
const globalHex = ['#3b82f6','#60a5fa','#2563eb','#22d3ee','#4ade80','#facc15','#f87171','#fb923c','#a78bfa','#c4b5fd','#f472b6','#2dd4bf','#71717a','#09090b','#fafafa']
const json = { globalHex, files: Object.fromEntries(Object.entries(files).map(([k,v]) => [k,[...v].filter(h=>!globalHex.includes(h))]).filter(([,v])=>v.length)) }
require('fs').writeFileSync('scripts/audit-ds-baseline.json', JSON.stringify(json, null, 2))
console.log('baseline gerada:', Object.keys(json.files).length, 'arquivos com hex legado')
"
```

- [ ] **Step 3: Plugar no package.json e CI**

`package.json` → scripts: `"audit:ds": "node scripts/audit-ds.mjs"`.

`.github/workflows/CI.yml` → logo após o step de lint:

```yaml
      - name: Design system audit
        run: npm run audit:ds
```

- [ ] **Step 4: Rodar e provar as duas direções**

Run: `npm run audit:ds` → Expected: `audit:ds OK` (as Tasks 2/4/5/6 já limparam tudo).
Prova negativa: adicionar temporariamente `text-[9px]` em qualquer tsx, rodar de novo → Expected: exit 1 com a violação apontada; reverter.

- [ ] **Step 5: Verificação final da onda**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run audit:ds && npm run build`
Expected: tudo limpo.

- [ ] **Step 6: Commit**

```bash
git add scripts/audit-ds.mjs scripts/audit-ds-baseline.json package.json .github/workflows/CI.yml
git commit -m "ci(ds): audit:ds impede regressao de tipografia, duplicatas e hex fora dos tokens"
```

---

## Verificação final da Onda 1 (checklist do revisor humano)

1. `npx tsc --noEmit && npm run lint && npm test && npm run audit:ds && npm run build` — tudo limpo.
2. `npm run dev` (porta 3000) e navegar todas as rotas: `/`, `/ordens`, `/graficos`, `/cidades`, `/fornecedor`, `/juniper`, `/fechamento`, `/mapa`, `/noc`, `/erp/{relatorios,alertas,produtividade,qualidade,planner,fila,ranking,acao,usuarios}`.
3. Conferir: nenhum texto ilegível/estourado; KPIs consistentes entre páginas; Tab percorre cards clicáveis e headers de tabela com anel de foco; tabela de Ordens fluida com fila grande.
