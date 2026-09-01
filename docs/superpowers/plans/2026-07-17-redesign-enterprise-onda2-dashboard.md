# Redesign Enterprise — Onda 2: Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar o Dashboard (`/`, `DashboardPage.tsx`) em 5 níveis de leitura e simplificar o `PulsoHero` para o padrão do mockup aprovado (`dashboard-proposta-sobria.html`), sem remover nenhum painel existente e sem introduzir dependências novas.

**Architecture:** Nenhum painel analítico muda de lógica — só de posição. O `PulsoHero` perde dois blocos sempre-visíveis (breakdown de peso do score, 6 mini-stats) e ganha um terceiro (tiles de fluxo do dia com sparkline); o conteúdo removido migra para um novo painel `QualidadePeriodoCard` (Nível 5) e para um popover no anel de score. O `StatCard` ganha uma prop opcional `sparkline?: number[]`, consumida só pelos 4 tiles do Hero nesta onda.

**Tech Stack:** React + TypeScript, Tailwind CSS, Vitest + @testing-library/react. Sparkline implementada como SVG inline (mesmo padrão já usado em `FluxoOSPanel`/`GaugeChart`) — sem dependência nova.

## Global Constraints

- Design sóbrio: tokens reais do `index.css`, Inter, cor apenas para status. Nada de tema conceitual, fonte de destaque, atmosfera/textura.
- Sem novas dependências de stack — sem Next.js, sem shadcn/ui, sem biblioteca de sparkline externa.
- `npm run build`, `npm run lint` e `npx tsc --noEmit` devem ficar limpos antes de qualquer commit tocando `.tsx`/`.ts`.
- Nenhum painel analítico é removido ou tem lógica de dado alterada — só reposicionamento e, no Hero, redistribuição de onde a informação já existente é exibida.
- Os 10 `StatCard` de risco/performance (grades "Alertas & Risco" e "Fila Ativa & Performance") **não** ganham `sparkline` nesta onda — só os 4 tiles de fluxo do Hero, que já têm série de 14 dias via `graficos.evolucao`.
- `npm test` (suíte completa) deve continuar 100% verde após cada task.

---

### Task 1: `SectionLabel` — heading semântico acessível

**Files:**
- Modify: `src/features/dashboard/DashboardKpiPrimitives.tsx`
- Test: `src/features/dashboard/DashboardKpiPrimitives.test.tsx` (novo arquivo)

**Interfaces:**
- Produces: nenhuma mudança de assinatura — `SectionLabel({ icon, color, children })` continua igual, só o elemento HTML interno muda de `<span>` para `<h2>`.

**Contexto:** `SectionLabel` é usado em 7 arquivos além do Dashboard (`ProdutividadePage`, `PlannerPage`, `PlannerComponents`, `AlertasComponents`, `GerencialPage`, `GerencialComponents`, `DashboardHeroBlock`) — é o rótulo de seção compartilhado do app inteiro. Hoje ele renderiza um `<span>` estilizado; leitores de tela não conseguem navegar por essas seções via headings. A correção é puramente semântica — zero mudança visual.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/features/dashboard/DashboardKpiPrimitives.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionLabel } from './DashboardKpiPrimitives'
import { AlertCircle } from 'lucide-react'

describe('SectionLabel', () => {
  it('renderiza um heading h2 com o texto da seção', () => {
    render(<SectionLabel icon={AlertCircle} color="#f87171">Alertas &amp; Risco</SectionLabel>)
    expect(screen.getByRole('heading', { level: 2, name: 'Alertas & Risco' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/features/dashboard/DashboardKpiPrimitives.test.tsx`
Expected: FAIL — nenhum heading `h2` encontrado (o texto está num `<span>`).

- [ ] **Step 3: Trocar `<span>` por `<h2>`**

Em `src/features/dashboard/DashboardKpiPrimitives.tsx`, o bloco atual:

```tsx
      <span className="text-caption font-semibold uppercase tracking-[0.09em] text-secondary">
        {children}
      </span>
```

Trocar por:

```tsx
      <h2 className="text-caption font-semibold uppercase tracking-[0.09em] text-secondary m-0">
        {children}
      </h2>
```

(`m-0` neutraliza qualquer margin padrão de navegador em `<h2>` — mantém o layout idêntico ao `<span>` anterior.)

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/features/dashboard/DashboardKpiPrimitives.test.tsx`
Expected: PASS.

Run: `npm test` (suíte completa)
Expected: PASS — nenhuma regressão nas 7 outras telas que usam `SectionLabel`.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/DashboardKpiPrimitives.tsx src/features/dashboard/DashboardKpiPrimitives.test.tsx
git commit -m "fix(a11y): SectionLabel renderiza heading h2 semantico em vez de span"
```

---

### Task 2: `FluxoOSPanel` — diferenciar as linhas por traço, não só por cor

**Files:**
- Modify: `src/features/dashboard/FluxoOSPanel.tsx`
- Test: `src/features/dashboard/FluxoOSPanel.test.tsx` (arquivo já existe — adicionar um novo `it`, não remover os existentes)

**Interfaces:** nenhuma mudança de props (`FluxoOSPanel({ evolucao })` continua igual).

**Contexto:** achado de acessibilidade da revisão via `ui-ux-pro-max` (domínio `chart`): "Differentiate series by line style (solid/dashed/dotted) not color alone." Hoje as linhas Entradas (azul) e Concluídas (roxo) só se diferenciam por cor.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final do `describe('FluxoOSPanel', ...)` em `src/features/dashboard/FluxoOSPanel.test.tsx`:

```tsx
  it('diferencia as linhas por traço, não só por cor', () => {
    const { container } = render(<FluxoOSPanel evolucao={makeEvolucao(14)} />)
    const svg = screen.getByRole('img', { name: /entradas e conclusões diárias/i })
    const paths = svg.querySelectorAll('path')
    expect(paths).toHaveLength(2)
    expect(paths[0]).not.toHaveAttribute('stroke-dasharray')  // Entradas — linha sólida
    expect(paths[1]).toHaveAttribute('stroke-dasharray')      // Concluídas — linha tracejada
  })
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/features/dashboard/FluxoOSPanel.test.tsx`
Expected: FAIL — `paths[1]` não tem `stroke-dasharray`.

- [ ] **Step 3: Adicionar `strokeDasharray` na linha de Concluídas e no swatch da legenda**

Em `src/features/dashboard/FluxoOSPanel.tsx`, o bloco da legenda (linhas 89-96 do arquivo atual):

```tsx
        <div className="flex gap-4 text-caption text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[3px] rounded-full" style={{ background: BLUE }} /> Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[3px] rounded-full" style={{ background: PURPLE }} /> Concluídas
          </span>
        </div>
```

Trocar por:

```tsx
        <div className="flex gap-4 text-caption text-secondary">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="14" y2="3" stroke={BLUE} strokeWidth={2} />
            </svg>
            Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="14" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="14" y2="3" stroke={PURPLE} strokeWidth={2} strokeDasharray="3.5 2.5" />
            </svg>
            Concluídas
          </span>
        </div>
```

E o bloco das séries (linhas 137-139 do arquivo atual):

```tsx
          {/* séries */}
          <path d={path(serie.abertas)} fill="none" stroke={BLUE} strokeWidth={2} strokeLinecap="round" />
          <path d={path(serie.concl)}   fill="none" stroke={PURPLE} strokeWidth={2} strokeLinecap="round" />
```

Trocar por:

```tsx
          {/* séries — Concluídas tracejada para diferenciar sem depender só de cor */}
          <path d={path(serie.abertas)} fill="none" stroke={BLUE} strokeWidth={2} strokeLinecap="round" />
          <path d={path(serie.concl)}   fill="none" stroke={PURPLE} strokeWidth={2} strokeLinecap="round" strokeDasharray="6 4" />
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/features/dashboard/FluxoOSPanel.test.tsx`
Expected: PASS — todos os testes do arquivo (os já existentes + o novo).

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/FluxoOSPanel.tsx src/features/dashboard/FluxoOSPanel.test.tsx
git commit -m "fix(a11y): FluxoOSPanel diferencia Entradas/Concluidas por tracado, nao so cor"
```

---

### Task 3: `StatCard` — prop `sparkline`

**Files:**
- Modify: `src/components/ui/StatCard.tsx`
- Test: `src/components/ui/StatCard.test.tsx` (arquivo já existe — adicionar novos `it`, não remover os existentes)

**Interfaces:**
- Produces: `StatCardProps.sparkline?: number[]` — quando presente e com 2+ pontos, renderiza um mini gráfico de linha (SVG, sem eixos) abaixo do `sub`, nos tamanhos `md` e `sm`. Consumida pela Task 5 (`PulsoHero`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do `describe('StatCard', ...)` em `src/components/ui/StatCard.test.tsx`:

```tsx
  it('renderiza sparkline quando fornecida (size md)', () => {
    const { container } = render(<StatCard title="Entradas" value={46} sparkline={[10, 20, 15, 30, 25]} />)
    expect(container.querySelector('svg[aria-hidden="true"] path')).toBeInTheDocument()
  })

  it('renderiza sparkline quando fornecida (size sm)', () => {
    const { container } = render(<StatCard title="Entradas" value={46} size="sm" sparkline={[10, 20, 15, 30, 25]} />)
    expect(container.querySelector('svg[aria-hidden="true"] path')).toBeInTheDocument()
  })

  it('não renderiza sparkline com menos de 2 pontos', () => {
    const { container } = render(<StatCard title="Entradas" value={46} sparkline={[10]} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeInTheDocument()
  })

  it('sem prop sparkline não renderiza nenhum svg de série', () => {
    const { container } = render(<StatCard title="Entradas" value={46} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/components/ui/StatCard.test.tsx`
Expected: FAIL — `sparkline` não existe em `StatCardProps`, nenhum `svg[aria-hidden="true"]` é renderizado.

- [ ] **Step 3: Implementar o helper `Sparkline` e a prop**

Em `src/components/ui/StatCard.tsx`, adicionar logo após os imports (linha 2, após `import { Minus, TrendingUp, TrendingDown, Calendar } from 'lucide-react'`):

```tsx

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const w = 64, h = 20, pad = 2
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const x = (i: number) => pad + (i * (w - pad * 2)) / (data.length - 1)
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2)
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mt-2" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
```

Na interface `StatCardProps` (linhas 46-58), adicionar o campo:

```tsx
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
  sparkline?: number[]
}
```

Na assinatura de `StatCard` (linhas 62-65), adicionar `sparkline` à desestruturação:

```tsx
export function StatCard({
  title, value, sub, icon: Icon, tone = 'neutral', trend, scope,
  size = 'md', onClick, delay = 0, className = '', sparkline,
}: StatCardProps) {
```

No branch `size === 'sm'` (linhas 91-104 do arquivo atual):

```tsx
  if (size === 'sm') {
    return (
      <div
        {...interactive}
        style={{ animationDelay: `${delay}ms` }}
        className={`bg-bg rounded-lg p-3 text-center animate-card-enter
                    ${onClick ? `cursor-pointer ${FOCUS_RING}` : ''} ${className}`}
      >
        <p className="text-[22px] font-bold tabular-nums leading-none" style={{ color: valColor }}>{value ?? '—'}</p>
        <p className="text-caption text-muted mt-1 uppercase tracking-wide">{title}</p>
        {sub && <p className="text-caption text-muted mt-0.5">{sub}</p>}
        {sparkline && sparkline.length > 1 && (
          <div className="flex justify-center">
            <Sparkline data={sparkline} color={valColor} />
          </div>
        )}
      </div>
    )
  }
```

No branch `size === 'md'` (final da função, linhas 106-139 do arquivo atual), logo após o parágrafo de `sub`:

```tsx
      {sub && <p className="text-caption text-muted leading-snug mt-2">{sub}</p>}

      {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} color={valColor} />}
    </div>
  )
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/components/ui/StatCard.test.tsx`
Expected: PASS — todos os testes do arquivo.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/StatCard.tsx src/components/ui/StatCard.test.tsx
git commit -m "feat(ds): StatCard ganha prop sparkline opcional (sizes md e sm)"
```

---

### Task 4: `QualidadePeriodoCard` — novo painel (Nível 5)

**Files:**
- Modify: `src/features/dashboard/DashboardPaineis.tsx`
- Test: `src/features/dashboard/DashboardPaineis.test.tsx` (novo arquivo — cobre só o novo export, não retroage sobre os painéis já existentes no mesmo arquivo)

**Interfaces:**
- Consumes: `Pulso` (de `../../lib/types`, já importado no arquivo).
- Produces: `QualidadePeriodoCard({ pulso: Pulso; taxaRevisitas?: number | null })` — exportado de `DashboardPaineis.tsx`. Consumida pela Task 6 (`DashboardPage.tsx`).

**Contexto:** este painel recebe os 6 indicadores que hoje vivem sempre-visíveis dentro do `PulsoHero` (SLA da Fila, SLA Atendido, MTTR, Aging Médio, Sem Agendamento, Revisitas) — mesmo cálculo, mesma marcação visual, só em um card de Nível 5 em vez de competir por espaço no Nível 1.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/features/dashboard/DashboardPaineis.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QualidadePeriodoCard } from './DashboardPaineis'
import type { Pulso } from '../../lib/types'

afterEach(cleanup)

function makePulso(overrides: Partial<Pulso> = {}): Pulso {
  return {
    score: 0, scoreLabel: '', scoreBreakdown: [], narrativa: '', quickInsights: [],
    agingMed: 3.4, agingDist: {} as never, slaFila: 87, slaAtingimento: 91,
    semAgendamento: 4, mttr: 2.1, mttrP90: 4.5, backlogDias: null,
    topCidadesCriticas: [], clustersAtivos: [], criticasTotal: 0,
    entradasHoje: 0, saidasHoje: 0, fluxoHoje: 0, entradaMediaDia: 0,
    metaMes: { concluidas: 0, meta: 0, pct: null, diasUteisRestantes: 0, diasUteisTotal: 0, projecaoFinal: null, status: 'neutro' },
    ritmoIntradiario: {} as never,
    ...overrides,
  }
}

describe('QualidadePeriodoCard', () => {
  it('renderiza os 6 indicadores de qualidade do período', () => {
    render(<QualidadePeriodoCard pulso={makePulso()} taxaRevisitas={5.2} />)
    expect(screen.getByText('Qualidade do Período')).toBeInTheDocument()
    expect(screen.getByText('87%')).toBeInTheDocument()
    expect(screen.getByText('91%')).toBeInTheDocument()
    expect(screen.getByText('2,1d')).toBeInTheDocument()
    expect(screen.getByText('3,4d')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('5,2%')).toBeInTheDocument()
  })

  it('mostra travessão quando taxaRevisitas não está disponível', () => {
    render(<QualidadePeriodoCard pulso={makePulso()} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/features/dashboard/DashboardPaineis.test.tsx`
Expected: FAIL — `QualidadePeriodoCard` não existe em `./DashboardPaineis`.

- [ ] **Step 3: Implementar `QualidadePeriodoCard`**

Em `src/features/dashboard/DashboardPaineis.tsx`, trocar a linha de import dos ícones (linha 2-4 do arquivo atual):

```tsx
import {
  TrendingUp, ArrowUpRight, Zap, CheckCircle2, MapPin, Clock, Gauge, Target, AlertCircle, Layers, Package,
} from 'lucide-react'
```

por (adiciona `Activity`):

```tsx
import {
  TrendingUp, ArrowUpRight, Zap, CheckCircle2, MapPin, Clock, Gauge, Target, AlertCircle, Layers, Package, Activity,
} from 'lucide-react'
```

Adicionar ao final do arquivo (após a função `MetaMesCard`, que termina na linha 514):

```tsx

// Qualidade do período — indicadores que antes viviam sempre-visíveis no Hero
// (SLA/MTTR/Aging/Revisitas). Mesmo cálculo, agora como painel de Nível 5.
export function QualidadePeriodoCard({ pulso, taxaRevisitas }: { pulso: Pulso; taxaRevisitas?: number | null }) {
  const { slaFila, slaAtingimento, mttr, mttrP90, agingMed, semAgendamento } = pulso

  type MiniStat = { label: string; value: string; sub?: string; hint?: string; warn: boolean; danger: boolean }
  const stats: MiniStat[] = [
    { label: 'SLA da Fila',  value: `${slaFila}%`, hint: 'Estoque: % da fila atual ainda dentro do prazo',
      warn: slaFila < 90, danger: slaFila < 75 },
    { label: 'SLA Atendido', value: slaAtingimento != null ? `${slaAtingimento}%` : '—',
      sub: 'das concluídas', hint: 'Fluxo: % das OS concluídas no período entregues dentro do SLA',
      warn: slaAtingimento != null && slaAtingimento < 90, danger: slaAtingimento != null && slaAtingimento < 75 },
    { label: 'MTTR',         value: mttr > 0 ? `${mttr.toLocaleString('pt-BR')}d` : '—',
      sub: mttrP90 > 0 ? `P90 ${mttrP90.toLocaleString('pt-BR')}d` : undefined,
      hint: 'Mediana do tempo abertura → baixa das concluídas · P90 = cauda',
      warn: mttr > 2, danger: mttr > 5 },
    { label: 'Aging Médio',  value: agingMed > 0 ? `${agingMed}d` : '—',
      warn: agingMed > 3, danger: agingMed > 7 },
    { label: 'Sem Agend.',   value: String(semAgendamento),
      warn: semAgendamento > 5, danger: semAgendamento > 20 },
    { label: 'Revisitas',    value: taxaRevisitas != null ? `${taxaRevisitas}%` : '—',
      sub: 'reincidência', hint: 'Clientes com nova manutenção no mesmo mês — retrabalho',
      warn: taxaRevisitas != null && taxaRevisitas > 8, danger: taxaRevisitas != null && taxaRevisitas > 15 },
  ]

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5">
      <SectionLabel icon={Activity} color="#818cf8">Qualidade do Período</SectionLabel>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
        {stats.map(s => (
          <div key={s.label} title={s.hint}
               className="flex flex-col border border-border rounded-md bg-bg/40 px-3 py-2">
            <p className="text-caption font-semibold uppercase tracking-[0.04em] text-muted">{s.label}</p>
            <p className={`font-bold text-[18px] leading-none tabular-nums tracking-tight mt-1
                           ${s.danger ? 'text-red' : s.warn ? 'text-yellow' : 'text-text'}`}>
              {s.value}
            </p>
            {s.sub && <p className="text-caption text-muted/70 mt-0.5 leading-none">{s.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/features/dashboard/DashboardPaineis.test.tsx`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/DashboardPaineis.tsx src/features/dashboard/DashboardPaineis.test.tsx
git commit -m "feat(dashboard): adiciona QualidadePeriodoCard (Nivel 5)"
```

---

### Task 5: `PulsoHero` simplificado — Hero no padrão do mockup

**Files:**
- Modify: `src/features/dashboard/PulsoHero.tsx`
- Modify: `src/features/dashboard/DashboardPage.tsx` (só o call site de `<PulsoHero>` e a variável `taxaRevisitas` — a reorganização completa da página é a Task 6)
- Test: `src/features/dashboard/PulsoHero.test.tsx` (novo arquivo)

**Interfaces:**
- Consumes: `StatCard` com prop `sparkline` (Task 3, `../../components/ui/StatCard`); `FluxoEvolucao` (já exportado de `./FluxoOSPanel`, `{ labels: string[]; abertas: number[]; concluidas: number[] }`).
- Produces: `PulsoHero({ pulso, aiData, isLoadingAI, onRequestAI, target, tendencia, evolucao })` — a prop `taxaRevisitas` é **removida** (o conteúdo que a usava migrou para `QualidadePeriodoCard`, Task 4); a prop `evolucao: FluxoEvolucao` é **nova e obrigatória**.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/dashboard/PulsoHero.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PulsoHero } from './PulsoHero'
import type { Pulso } from '../../lib/types'

afterEach(cleanup)

function makePulso(overrides: Partial<Pulso> = {}): Pulso {
  return {
    score: 82, scoreLabel: 'saudável',
    scoreBreakdown: [
      { id: 'sla', label: 'SLA', value: 88, weight: 45 },
      { id: 'taxa', label: 'Taxa', value: 76, weight: 35 },
      { id: 'mttr', label: 'MTTR', value: 90, weight: 20 },
    ],
    narrativa: 'A fila recua pelo terceiro dia seguido.',
    quickInsights: [],
    agingMed: 3.4, agingDist: {} as never, slaFila: 87, slaAtingimento: 91,
    semAgendamento: 4, mttr: 2.1, mttrP90: 4.5, backlogDias: null,
    topCidadesCriticas: [], clustersAtivos: [], criticasTotal: 7,
    entradasHoje: 46, saidasHoje: 51, fluxoHoje: -5, entradaMediaDia: 44,
    metaMes: { concluidas: 900, meta: 1240, pct: 72, diasUteisRestantes: 5, diasUteisTotal: 22, projecaoFinal: 1310, status: 'acima' },
    ritmoIntradiario: {} as never,
    ...overrides,
  }
}

const evolucao = {
  labels: Array.from({ length: 14 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`),
  abertas: Array.from({ length: 14 }, (_, i) => 40 + i),
  concluidas: Array.from({ length: 14 }, (_, i) => 38 + i),
}

describe('PulsoHero', () => {
  it('renderiza score, tendência e narrativa', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false}
                       tendencia={{ atual: 82, anterior: 78, delta: 4 }} evolucao={evolucao} />)
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText(/vs anterior/)).toBeInTheDocument()
    expect(screen.getByText('A fila recua pelo terceiro dia seguido.')).toBeInTheDocument()
  })

  it('renderiza os 4 tiles de fluxo do dia, com sparkline em 3 deles', () => {
    const { container } = render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} evolucao={evolucao} />)
    expect(screen.getByText('Entradas hoje')).toBeInTheDocument()
    expect(screen.getByText('46')).toBeInTheDocument()
    expect(screen.getByText('Concluídas hoje')).toBeInTheDocument()
    expect(screen.getByText('51')).toBeInTheDocument()
    expect(screen.getByText('Saldo do dia')).toBeInTheDocument()
    expect(screen.getByText('fila encolhendo')).toBeInTheDocument()
    expect(screen.getByText('Projeção do mês')).toBeInTheDocument()
    expect(screen.getByText('1.310')).toBeInTheDocument()
    // Entradas, Concluídas e Saldo têm sparkline — Projeção do mês não tem série diária
    expect(container.querySelectorAll('svg[aria-hidden="true"] path')).toHaveLength(3)
  })

  it('breakdown do score fica em popover, mini-stats antigos não vivem mais aqui', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} evolucao={evolucao} />)
    expect(screen.getByText('Peso: SLA 45% · Taxa 35% · MTTR 20%')).toBeInTheDocument()
    expect(screen.queryByText('Sem Agend.')).not.toBeInTheDocument()
    expect(screen.queryByText('Revisitas')).not.toBeInTheDocument()
  })

  it('mostra CTA para analisar com IA quando não há aiData', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} onRequestAI={() => {}} evolucao={evolucao} />)
    expect(screen.getByRole('button', { name: /Analisar com IA/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/features/dashboard/PulsoHero.test.tsx`
Expected: FAIL — `evolucao` não é aceita pela prop atual (TS) e os tiles de fluxo/sparkline ainda não existem.

- [ ] **Step 3: Reescrever `PulsoHero.tsx`**

Substituir o conteúdo completo de `src/features/dashboard/PulsoHero.tsx` por:

```tsx
import { useState } from 'react'
import { Sparkles, Zap, Activity } from 'lucide-react'
import { GaugeChart } from '../../components/ui/GaugeChart'
import { StatCard } from '../../components/ui/StatCard'
import type { Pulso } from '../../lib/types'
import type { AINarrativeResult } from '../../hooks/useAINarrative'
import type { ScoreTendencia } from './DashboardTypes'
import type { FluxoEvolucao } from './FluxoOSPanel'

export interface AnomaliaContextType {
  total:     number
  sla_pct:   number
  criticas:  number
  aging_med: number
}

export function PulsoHero({ pulso, aiData, isLoadingAI, onRequestAI, target, tendencia, evolucao }: {
  pulso: Pulso; aiData: AINarrativeResult | null | undefined; isLoadingAI: boolean; onRequestAI?: (obs: string) => void; target?: number
  tendencia?: ScoreTendencia
  evolucao: FluxoEvolucao
}) {
  const [draftObs, setDraftObs] = useState('')
  const [showReanalysis, setShowReanalysis] = useState(false)

  const {
    score = 0, scoreLabel = '—', scoreBreakdown = [], narrativa = '', quickInsights = [],
    entradasHoje = 0, saidasHoje = 0, fluxoHoje = 0, entradaMediaDia = 0,
    metaMes = { concluidas: 0, meta: 0, pct: null, diasUteisRestantes: 0, diasUteisTotal: 0, projecaoFinal: null, status: 'neutro' as const },
  } = pulso

  const scoreColor =
    score >= 85 ? '#4ade80' :
    score >= 65 ? '#facc15' : '#f87171'

  const weakestId = scoreBreakdown.length > 0
    ? [...scoreBreakdown].sort((a, b) => a.value - b.value)[0].id
    : null

  type DisplayInsight = { level: string; text: string; ai?: boolean }
  const displayNarrative = narrativa
  const displayInsights: DisplayInsight[] = aiData?.insights?.length
    ? aiData.insights.map(text => ({ level: 'cyan', text, ai: true }))
    : quickInsights

  const INSIGHT_CLS = {
    red:    'bg-red/10 text-red border-red/25',
    orange: 'bg-orange/10 text-orange border-orange/25',
    yellow: 'bg-yellow/10 text-yellow border-yellow/25',
    green:  'bg-green/10 text-green border-green/25',
    cyan:   'bg-cyan/10 text-cyan border-cyan/25',
  } as Record<string, string>

  // Fluxo do dia — 4 tiles compactos; sparkline dos últimos 14 dias onde a série existe
  const saldoSparkline = evolucao.abertas.map((v, i) => v - evolucao.concluidas[i])
  const projecaoOk = metaMes.projecaoFinal != null && metaMes.meta > 0 && metaMes.projecaoFinal >= metaMes.meta

  return (
    <div
      className="rounded-lg border border-border bg-card"
      style={{ borderLeft: `2px solid ${scoreColor}` }}
    >
      <div className="p-5 space-y-4">
        {/* Main row */}
        <div className="flex items-start gap-6 flex-wrap">

          {/* Gauge + breakdown em popover (hover/foco) */}
          <div className="group relative flex flex-col items-center gap-1.5 flex-shrink-0">
            <div
              tabIndex={scoreBreakdown.length > 0 ? 0 : undefined}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <GaugeChart value={score} target={target} color={scoreColor} label={scoreLabel} size={100} />
            </div>
            <span className="text-caption font-bold uppercase tracking-[0.06em]"
                  style={{ color: `${scoreColor}99` }}>
              Score
            </span>
            {tendencia?.delta != null && tendencia.delta !== 0 && (
              <span className={`inline-flex items-center gap-1 text-caption font-bold tabular-nums
                                px-2 py-0.5 rounded-full border
                                ${tendencia.delta > 0
                                  ? 'text-green bg-green/[0.07] border-green/20'
                                  : 'text-red bg-red/[0.07] border-red/20'}`}
                    title={`Score do período anterior: ${tendencia.anterior}`}>
                {tendencia.delta > 0 ? '▲' : '▼'} {tendencia.delta > 0 ? '+' : ''}{tendencia.delta} vs anterior
              </span>
            )}

            {scoreBreakdown.length > 0 && (
              <div
                role="tooltip"
                className="hidden group-hover:flex group-focus-within:flex flex-col gap-2
                           absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[150px] z-20
                           rounded-lg border border-border bg-elevated p-3 shadow-xl"
              >
                {scoreBreakdown.map(item => {
                  const isWeakest = item.id === weakestId
                  const cor = item.value >= 85 ? '#4ade80' : item.value >= 65 ? '#facc15' : '#f87171'
                  return (
                    <div key={item.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-caption ${isWeakest ? 'font-bold text-text' : 'text-muted'}`}>
                          {item.label}{isWeakest ? ' ⚠' : ''}
                        </span>
                        <span className="text-caption font-mono font-semibold" style={{ color: cor }}>
                          {item.value}
                        </span>
                      </div>
                      <div className="h-1 bg-surface/40 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                             style={{ width: `${Math.min(100, Math.max(0, item.value))}%`, background: cor }} />
                      </div>
                    </div>
                  )
                })}
                <span className="text-caption text-muted/70 leading-tight">
                  Peso: SLA 45% · Taxa 35% · MTTR 20%
                </span>
              </div>
            )}
          </div>

          {/* Narrativa + fluxo do dia */}
          <div className="flex-1 min-w-[240px] flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Activity size={10} className="text-muted" />
                <span className="text-caption font-bold uppercase tracking-[0.07em] text-muted">
                  Análise Operacional
                </span>
                {aiData && (
                  <span className="inline-flex items-center gap-1 text-caption font-bold text-primary/80
                                   bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">
                    <Sparkles size={7} /> IA
                  </span>
                )}
              </div>

              {!isLoadingAI && !aiData && onRequestAI ? (
                <div className="space-y-2">
                  <textarea
                    value={draftObs}
                    onChange={e => setDraftObs(e.target.value)}
                    placeholder="Contexto opcional para a IA: ex. tivemos queda de energia hoje, o que pode justificar menor fluxo de atendimentos."
                    rows={2}
                    className="w-full text-caption text-secondary placeholder:text-muted/50
                               bg-surface/60 border border-white/[0.08] rounded-lg px-3 py-2
                               resize-none focus:outline-none focus:border-primary/30
                               leading-relaxed"
                  />
                  <button
                    onClick={() => onRequestAI(draftObs)}
                    className="flex items-center gap-1.5 text-caption font-semibold text-primary/70 hover:text-primary
                               px-3 py-1.5 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/[0.08]
                               transition-all duration-fast"
                  >
                    <Sparkles size={11} /> Analisar com IA
                  </button>
                </div>
              ) : isLoadingAI && !aiData ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="h-2 bg-surface rounded animate-pulse w-16" />
                    <div className="h-3 bg-surface rounded animate-pulse w-full" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 bg-surface rounded animate-pulse w-16" />
                    <div className="h-3 bg-surface rounded animate-pulse w-5/6" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 bg-surface rounded animate-pulse w-16" />
                    <div className="h-3 bg-surface rounded animate-pulse w-4/5" />
                  </div>
                </div>
              ) : aiData?.problema ? (
                <div className="space-y-2.5">
                  {/* Problema */}
                  <div className="flex gap-2.5 items-start">
                    <span className="mt-[3px] flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red" />
                    <div>
                      <p className="text-caption font-bold uppercase tracking-[0.08em] text-red/70 mb-0.5">Problema</p>
                      <p className="text-label text-secondary leading-snug">{aiData.problema}</p>
                    </div>
                  </div>
                  {/* Sugestão */}
                  <div className="flex gap-2.5 items-start">
                    <span className="mt-[3px] flex-shrink-0 w-1.5 h-1.5 rounded-full bg-yellow" />
                    <div>
                      <p className="text-caption font-bold uppercase tracking-[0.08em] text-yellow/70 mb-0.5">Sugestão</p>
                      <p className="text-label text-secondary leading-snug">{aiData.sugestao}</p>
                    </div>
                  </div>
                  {/* Ação */}
                  <div className="flex gap-2.5 items-start">
                    <Zap size={10} className="mt-[2px] flex-shrink-0 text-green" />
                    <div>
                      <p className="text-caption font-bold uppercase tracking-[0.08em] text-green/70 mb-0.5">Ação Imediata</p>
                      <p className="text-label font-semibold text-text leading-snug">{aiData.acao}</p>
                    </div>
                  </div>

                  {/* Reanalisar */}
                  {onRequestAI && !showReanalysis && (
                    <button
                      onClick={() => setShowReanalysis(true)}
                      className="mt-1 flex items-center gap-1 text-caption text-muted/60 hover:text-primary
                                 transition-colors duration-fast"
                    >
                      <Sparkles size={9} /> Reanalisar com novo contexto
                    </button>
                  )}
                  {showReanalysis && onRequestAI && (
                    <div className="pt-1 space-y-1.5 border-t border-white/[0.05]">
                      <textarea
                        value={draftObs}
                        onChange={e => setDraftObs(e.target.value)}
                        placeholder="Novo contexto para a IA..."
                        rows={2}
                        className="w-full text-caption text-secondary placeholder:text-muted/50
                                   bg-surface/60 border border-white/[0.08] rounded-lg px-3 py-2
                                   resize-none focus:outline-none focus:border-primary/30
                                   leading-relaxed"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { onRequestAI(draftObs); setShowReanalysis(false) }}
                          className="flex items-center gap-1 text-caption font-semibold text-primary/70 hover:text-primary
                                     px-2.5 py-1 rounded-md border border-primary/20 hover:border-primary/40
                                     hover:bg-primary/[0.08] transition-all duration-fast"
                        >
                          <Sparkles size={9} /> Analisar
                        </button>
                        <button
                          onClick={() => setShowReanalysis(false)}
                          className="text-caption text-muted/60 hover:text-muted px-2 py-1 transition-colors duration-fast"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-label text-secondary leading-[1.7]">
                  {displayNarrative || 'Carregando análise operacional…'}
                </p>
              )}
            </div>

            {/* Fluxo do dia — 4 tiles compactos */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-auto">
              <StatCard
                size="sm" title="Entradas hoje" value={entradasHoje}
                sub={`média ${entradaMediaDia.toLocaleString('pt-BR')}/dia`}
                sparkline={evolucao.abertas}
              />
              <StatCard
                size="sm" title="Concluídas hoje" value={saidasHoje}
                sub="hoje"
                sparkline={evolucao.concluidas}
              />
              <StatCard
                size="sm" title="Saldo do dia" value={fluxoHoje}
                tone={fluxoHoje < 0 ? 'ok' : fluxoHoje > 0 ? 'warning' : 'neutral'}
                sub={fluxoHoje < 0 ? 'fila encolhendo' : fluxoHoje > 0 ? 'fila crescendo' : 'estável'}
                sparkline={saldoSparkline}
              />
              <StatCard
                size="sm" title="Projeção do mês"
                value={metaMes.projecaoFinal != null ? metaMes.projecaoFinal.toLocaleString('pt-BR') : '—'}
                tone={metaMes.projecaoFinal != null && metaMes.meta > 0 ? (projecaoOk ? 'ok' : 'warning') : 'neutral'}
                sub={metaMes.meta > 0 ? `meta ${metaMes.meta}${projecaoOk ? ' ✓' : ''}` : undefined}
              />
            </div>
          </div>
        </div>

        {/* Insight pills */}
        {displayInsights.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-white/[0.05]">
            {displayInsights.map((ins, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1.5 text-caption font-semibold
                            px-2.5 py-[5px] rounded-full border ${INSIGHT_CLS[ins.level] ?? INSIGHT_CLS.cyan}`}
              >
                {ins.ai
                  ? <Sparkles size={8} className="flex-shrink-0 opacity-70" />
                  : <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                }
                {ins.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Atualizar o call site em `DashboardPage.tsx`**

Em `src/features/dashboard/DashboardPage.tsx`, logo após a linha `const fluxoHoje = { entradas: pulso.entradasHoje, saidas: pulso.saidasHoje, saldo: pulso.fluxoHoje, mediaEntrada: pulso.entradaMediaDia }` (linha 33 do arquivo atual), adicionar:

```tsx
  const taxaRevisitas = (revisitas as { taxa?: { geral?: number } } | null)?.taxa?.geral ?? null
```

O bloco `<PulsoHero .../>` atual (linhas 171-179):

```tsx
        <PulsoHero
          pulso={pulso}
          target={metaScore}
          tendencia={scoreTendencia}
          taxaRevisitas={(revisitas as { taxa?: { geral?: number } } | null)?.taxa?.geral ?? null}
          aiData={aiData}
          isLoadingAI={isLoadingAI}
          onRequestAI={(obs: string) => { setObservacao(obs); setAiEnabled(true) }}
        />
```

Trocar por:

```tsx
        <PulsoHero
          pulso={pulso}
          target={metaScore}
          tendencia={scoreTendencia}
          evolucao={graficos.evolucao}
          aiData={aiData}
          isLoadingAI={isLoadingAI}
          onRequestAI={(obs: string) => { setObservacao(obs); setAiEnabled(true) }}
        />
```

(A variável `taxaRevisitas` recém-criada fica sem uso nesta task — é consumida pela Task 6, ao lado de `QualidadePeriodoCard`. Isso é esperado; `npx tsc --noEmit` não falha por variável local não usada quando ela É usada em outro ponto do mesmo arquivo — o que acontecerá após a Task 6. Se rodar `npm run lint` isoladamente após esta task e ele acusar `no-unused-vars` em `taxaRevisitas`, é aceitável: a Task 6, que roda em seguida, consome a variável. Não pule a Task 6.)

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/features/dashboard/PulsoHero.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: limpo (o call site já foi atualizado no Step 4).

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/dashboard/PulsoHero.tsx src/features/dashboard/PulsoHero.test.tsx src/features/dashboard/DashboardPage.tsx
git commit -m "refactor(dashboard): simplifica PulsoHero para o padrao do mockup (breakdown em popover, mini-stats saem, tiles de fluxo com sparkline)"
```

---

### Task 6: `DashboardPage.tsx` — reorganização em 5 níveis de leitura

**Files:**
- Modify: `src/features/dashboard/DashboardPage.tsx`

**Interfaces:**
- Consumes: `QualidadePeriodoCard({ pulso, taxaRevisitas })` (Task 4, `./DashboardPaineis`); `PulsoHero` já atualizado (Task 5).
- Produces: nenhuma interface pública nova — só reordenação de JSX dentro do componente de página.

**Contexto:** esta task não muda nenhuma lógica de dado — só a ordem em que os blocos já existentes aparecem na página, agrupando-os nos 5 níveis definidos na spec (`docs/superpowers/specs/2026-07-17-redesign-enterprise-onda2-dashboard-design.md`, §3-4.4). Não há comportamento novo para testar via unidade — a verificação é build/lint/tsc limpos + suíte completa verde + QA manual no navegador (Step 3).

- [ ] **Step 1: Importar `QualidadePeriodoCard` e substituir o corpo do `return`**

Em `src/features/dashboard/DashboardPage.tsx`, o bloco de import dos painéis (linhas 18-22 do arquivo atual):

```tsx
import {
  MetaMesCard, AlertaTopoBanner, ClustersBairroPanel, AgingPanel,
  RitmoEquipesPanel, MudancasStrip, ProjecaoRiscoPanel,
  ParetoServicoPanel, CidadesValePanel, FornecedoresPanel,
} from './DashboardPaineis'
```

Trocar por (adiciona `QualidadePeriodoCard`):

```tsx
import {
  MetaMesCard, AlertaTopoBanner, ClustersBairroPanel, AgingPanel,
  RitmoEquipesPanel, MudancasStrip, ProjecaoRiscoPanel,
  ParetoServicoPanel, CidadesValePanel, FornecedoresPanel, QualidadePeriodoCard,
} from './DashboardPaineis'
```

O corpo do `return` final do componente (do `return (` com `<>` na linha 150 até o fechamento `</>` + `)` na linha 324, ou seja, todo o conteúdo entre a checagem de `isLoading`/`error` e o final da função) — a região que vai desde:

```tsx
  return (
    <>
      <div className="space-y-4 max-w-[1600px]">

        {/* ── Aviso de falha interna de builder (visível só em erro real) ── */}
```

até:

```tsx
      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
    </>
  )
}
```

Trocar por:

```tsx
  return (
    <>
      <div className="space-y-4 max-w-[1600px]">

        {/* ── Aviso de falha interna de builder (visível só em erro real) ── */}
        {builderErrors.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow/10 border border-yellow/20 text-caption text-yellow">
            <AlertCircle size={13} />
            <span>Erro interno em: <strong>{builderErrors.join(', ')}</strong> — dados parciais. Verifique o console.</span>
          </div>
        )}

        {/* ═══ NÍVEL 1 — Estado geral (<2s) ═══ */}
        <AlertaTopoBanner
          clustersCount={clustersAtivos.length}
          anomaliasCount={anomalias?.total ?? 0}
          onScrollClusters={() => clustersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          onScrollAnomalias={() => anomaliasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />

        <PulsoHero
          pulso={pulso}
          target={metaScore}
          tendencia={scoreTendencia}
          evolucao={graficos.evolucao}
          aiData={aiData}
          isLoadingAI={isLoadingAI}
          onRequestAI={(obs: string) => { setObservacao(obs); setAiEnabled(true) }}
        />

        <MudancasStrip tendencia={scoreTendencia} mudancas={mudancas} />

        {/* ═══ NÍVEL 2 — KPIs principais ═══ */}
        <section>
          <SectionLabel icon={AlertCircle} color="#f87171">Alertas &amp; Risco</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-2">
            {riskKpis.map((k, i) => (
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
            ))}
          </div>
        </section>

        <section>
          <SectionLabel icon={BarChart3} color="#3b82f6">Fila Ativa &amp; Performance</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-2">
            {perfKpis.map((k, i) => (
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
            ))}
          </div>
        </section>

        {/* ═══ NÍVEL 3 — Alertas críticos ═══ */}
        <ProjecaoRiscoPanel
          proj={projecaoRisco}
          criticasAgora={pulso.criticasTotal ?? 0}
          onOpen={(rows) => setModal({ title: 'Risco de violação · próximas 48h', rows })}
        />

        <div ref={clustersRef}>
          <ClustersBairroPanel clusters={clustersAtivos} />
        </div>

        {anomalias?.total > 0 && (
          <div ref={anomaliasRef}>
            <AnomaliaSection
              anomalias={anomalias}
              contexto={{
                total:     (kpis.find(k => k.id === 'total')?.value    as number) ?? 0,
                sla_pct:   pulso.slaFila    ?? 0,
                criticas:  pulso.criticasTotal ?? 0,
                aging_med: pulso.agingMed   ?? 0,
              }}
            />
          </div>
        )}

        {/* ═══ NÍVEL 4 — Detalhamento operacional ═══ */}
        <ExecutadasHeroBlock
          rows={allRows}
          projecao={projecaoHoje}
          fluxo={fluxoHoje}
          ritmoIntradiario={pulso.ritmoIntradiario}
          onOpenModal={(title, filtered) => setModal({ title, rows: filtered })}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">
          <div className="lg:col-span-2">
            <FluxoOSPanel evolucao={graficos.evolucao} />
          </div>
          <AgingPanel pulso={pulso} filaAtiva={filaAtiva}
                      onOpen={(title, rows) => setModal({ title, rows })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
          <RitmoEquipesPanel semaforo={campo.semaforo} />
          <CidadesValePanel filaAtiva={filaAtiva}
                            onOpen={(title, rows) => setModal({ title, rows })} />
          <ParetoServicoPanel filaAtiva={filaAtiva}
                              onOpen={(title, rows) => setModal({ title, rows })} />
        </div>

        {/* ═══ NÍVEL 5 — Análises secundárias ═══ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
          <MetaMesCard meta={pulso.metaMes} />
          <FornecedoresPanel fornecedores={fornecedores} />
          <QualidadePeriodoCard pulso={pulso} taxaRevisitas={taxaRevisitas} />
        </div>

      </div>

      {/* Modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.title ?? ''}
        subtitle={`${modal?.rows?.length ?? 0} ordens de serviço`}
        maxWidth="1120px"
        headerAction={
          (modal?.rows?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2">
              {modal?.foco && FOCO_NAVEGAVEL.has(modal.foco) && (
                <button
                  onClick={() => { const foco = modal!.foco; setModal(null); navigate('/ordens', { state: { foco } }) }}
                  className="flex items-center gap-1.5 text-caption font-semibold text-primary
                             border border-primary/30 hover:bg-primary/10 rounded-md px-2.5 py-1
                             transition-all duration-fast"
                >
                  Abrir na fila <ArrowRight size={11} />
                </button>
              )}
              <button
                onClick={() => {
                  const date = new Date().toISOString().slice(0, 10)
                  exportCSV(modal!.rows, `os_${modal!.title.toLowerCase().replace(/\s+/g, '_')}_${date}.csv`)
                }}
                className="flex items-center gap-1.5 text-caption text-muted hover:text-primary
                           border border-white/[0.08] hover:border-primary/30 rounded-md px-2.5 py-1
                           transition-all duration-fast"
              >
                <Download size={11} /> CSV
              </button>
            </div>
          )
        }
      >
        <KpiModalTable key={modal?.title} rows={modal?.rows ?? []} onOS={os => { setModal(null); setDrawerOS(os) }} />
      </Modal>

      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />
    </>
  )
}
```

**O que mudou de posição, exatamente:**
- `ClustersBairroPanel` saiu do 3º grid de 3 colunas (Nível 4/5 misturado) e agora é standalone, logo após `ProjecaoRiscoPanel`, no Nível 3.
- `AnomaliaSection` subiu do final da página para o Nível 3, junto de `ProjecaoRiscoPanel`/`ClustersBairroPanel`.
- As duas grades de KPI (`StatCard`) ficam adjacentes (Nível 2), sem `ExecutadasHeroBlock`/`ProjecaoRiscoPanel` entre elas.
- `RitmoEquipesPanel`, `CidadesValePanel` e `ParetoServicoPanel` formam um novo grid de 3 colunas juntos no Nível 4 (antes estavam espalhados em 2 grids diferentes, cada um ao lado de `MetaMesCard`/`ClustersBairroPanel`/`FornecedoresPanel`).
- `MetaMesCard`, `FornecedoresPanel` e o novo `QualidadePeriodoCard` formam o grid de 3 colunas do Nível 5.
- `FluxoOSPanel`+`AgingPanel` e `ExecutadasHeroBlock` continuam no mesmo formato, só reposicionados para o Nível 4.

- [ ] **Step 2: Checagem de tipos, lint, build e suíte completa**

Run: `npx tsc --noEmit`
Expected: limpo — `taxaRevisitas` (criada na Task 5) agora está em uso em `QualidadePeriodoCard`.

Run: `npm run lint`
Expected: 0 erros.

Run: `npm run build`
Expected: build sem erros.

Run: `npm test`
Expected: todos os testes passando, incluindo os das Tasks 1-5.

- [ ] **Step 3: Verificação manual no navegador**

Run: `npm run dev`

No navegador (`http://localhost:3000/`):
1. Confirmar a ordem de leitura de cima para baixo: aviso de erro de builder (se houver) → banner de alerta → Hero (anel + narrativa + 4 tiles de fluxo com sparkline) → tendência → KPIs de Alertas & Risco → KPIs de Fila & Performance → Projeção de risco → Clusters de Falha → Anomalias (se houver) → Executadas Hoje → Fluxo de OS + Aging → Ritmo/Cidades/Pareto → Meta do Mês/Fornecedores/Qualidade do Período.
2. Passar o mouse (e focar via Tab) no anel de score — confirmar que o popover com o breakdown SLA/Taxa/MTTR aparece e some corretamente.
3. Conferir que os 4 tiles de fluxo do Hero mostram sparkline nos 3 primeiros (Entradas/Concluídas/Saldo) e não no 4º (Projeção do mês).
4. Confirmar que nenhum painel sumiu — os 6 que estavam fora do mockup original (Meta do Mês, Pareto, Clusters, Fornecedores, Projeção de Risco, Executadas Hoje) continuam visíveis, só em posição diferente.
5. Clicar em "Ver detalhes ↓" no banner de alerta (quando houver clusters/anomalias ativos) — confirmar que o scroll ainda funciona para os novos locais de `ClustersBairroPanel`/`AnomaliaSection`.
6. Testar em 1440px, 1024px e 768px de largura — confirmar que os grids colapsam sem quebrar (`sm:`/`lg:`/`xl:` já cobrem esses breakpoints nos grids existentes).

- [ ] **Step 4: Commit**

```bash
git add src/features/dashboard/DashboardPage.tsx
git commit -m "refactor(dashboard): reorganiza pagina em 5 niveis de leitura (estado geral -> kpis -> alertas -> detalhamento -> secundario)"
```

---

## Self-Review Notes

- **Cobertura da spec:** §4.1 (5 níveis) → Task 6. §4.2 (Hero simplificado, breakdown em popover, mini-stats saem, IA já era colapsada) → Task 5. §4.3 (sparkline nos tiles de fluxo) → Tasks 3+5. §4.4 (reordenação de painéis) → Task 6. §4.5 (a11y: heading semântico + diferenciação por traço) → Tasks 1+2. §4.6 (sem mudança de stack/paleta/tipografia) → nenhuma task introduz dependência nova ou token novo.
- **Sem placeholders:** todos os steps têm código completo; nenhum "TODO"/"implementar depois". A nota no Step 4 da Task 5 sobre `taxaRevisitas` "sem uso" é uma explicação do porquê, não um placeholder — a Task 6 imediatamente seguinte consome a variável.
- **Consistência de tipos:** `PulsoHero` perde `taxaRevisitas` e ganha `evolucao: FluxoEvolucao` (Task 5) — o call site em `DashboardPage.tsx` é atualizado na mesma task, nunca fica com um mismatch entre tasks. `QualidadePeriodoCard({ pulso, taxaRevisitas })` (Task 4) é consumida com os mesmos nomes de prop na Task 6. `StatCard`'s `sparkline?: number[]` (Task 3) é consumida com o mesmo nome em `PulsoHero` (Task 5).
- **Ordem de dependência:** Task 1 e 2 são independentes entre si e do resto. Task 3 (StatCard) não depende de nada novo. Task 4 (QualidadePeriodoCard) não depende de nada novo. Task 5 depende da Task 3 (`sparkline`). Task 6 depende das Tasks 4 e 5. Nenhuma task depende de uma posterior.
