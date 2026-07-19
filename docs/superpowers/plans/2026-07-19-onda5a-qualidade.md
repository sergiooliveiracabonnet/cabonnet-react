# Onda 5a — Qualidade (PageHeader + SectionLabel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `QualidadePage.tsx` adota o `PageHeader` (já usado em Ordens/Fila, Onda 4) e um novo `SectionLabel` canônico (extraído das 3 cópias já existentes no repo, nunca usado em Qualidade) nas suas 6 seções.

**Architecture:** Cria `src/components/ui/SectionLabel.tsx`, um componente puro `{ icon, color, children }` idêntico em forma às 3 cópias já espalhadas pelo repo (`DashboardKpiPrimitives.tsx`, `AlertasComponents.tsx`, `PlannerExecutadoView.tsx` — nenhuma delas é tocada nesta onda). `QualidadePage.tsx` reorganiza o cabeçalho pra usar `PageHeader` (título+descrição, controles de período viram linha própria) e substitui os 6 blocos de "barra colorida + ícone + texto" hand-rolled por `<SectionLabel>`.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library (já usados em `PageHeader.test.tsx`, mesmo padrão RTL puro aplicável aqui pois `SectionLabel` não depende de contexto/router/query).

## Global Constraints

- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status/taxonomia já estabelecida — `TIPO_COLOR` não muda.
- Sem novas dependências de stack.
- Antes de cada commit: `npx tsc --noEmit`, `npm run lint`, `npm run audit:ds`, `npm test`, `npm run build` devem passar limpos.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — só reorganização de UI + extração de componente compartilhado.
- `SectionLabel` canônico **não substitui** as cópias existentes em `DashboardKpiPrimitives.tsx`/`AlertasComponents.tsx`/`PlannerExecutadoView.tsx` — esses três arquivos não são tocados nesta onda.
- Cores exatas por seção, copiadas literalmente da tabela da spec (`docs/superpowers/specs/2026-07-19-onda5a-qualidade-design.md` §3.3) — não recalcular ou "arredondar" hex.
- Mudanças de UI exigem verificação manual no navegador — o controller faz essa verificação depois que as tasks e review terminam (mesmo padrão das Ondas 3c/4).

---

### Task 1: Criar `SectionLabel` canônico

**Files:**
- Create: `src/components/ui/SectionLabel.tsx`
- Create: `src/components/ui/SectionLabel.test.tsx`

**Interfaces:**
- Produces: `export interface SectionLabelProps { icon: ComponentType<{ size?: number; className?: string }>; color: string; children: ReactNode }`, `export function SectionLabel({ icon, color, children }: SectionLabelProps)` — usado pela Task 3.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/components/ui/SectionLabel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Activity } from 'lucide-react'
import { SectionLabel } from './SectionLabel'

describe('SectionLabel', () => {
  it('renderiza o texto como heading', () => {
    render(<SectionLabel icon={Activity} color="#a78bfa">Acompanhamento Diário</SectionLabel>)
    expect(screen.getByRole('heading', { name: 'Acompanhamento Diário' })).toBeInTheDocument()
  })

  it('não aplica cor no texto do heading — só na barra/ícone', () => {
    render(<SectionLabel icon={Activity} color="#a78bfa">Teste</SectionLabel>)
    const heading = screen.getByRole('heading', { name: 'Teste' })
    expect(heading.style.color).toBe('')
  })

  it('renderiza a barra lateral com a cor recebida', () => {
    const { container } = render(<SectionLabel icon={Activity} color="#a78bfa">Teste</SectionLabel>)
    const bar = container.querySelector('div[style]') as HTMLElement
    expect(bar).not.toBeNull()
    expect(bar.style.background).not.toBe('')
  })

  it('renderiza o ícone fornecido', () => {
    const { container } = render(<SectionLabel icon={Activity} color="#a78bfa">Teste</SectionLabel>)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/components/ui/SectionLabel.test.tsx`
Expected: FAIL — `Cannot find module './SectionLabel'` (o arquivo ainda não existe).

- [ ] **Step 3: Criar `src/components/ui/SectionLabel.tsx`**

```tsx
import type { ComponentType, ReactNode } from 'react'

export interface SectionLabelProps {
  icon:  ComponentType<{ size?: number; className?: string }>
  color: string
  children: ReactNode
}

export function SectionLabel({ icon: Icon, color, children }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-3.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} className="flex-shrink-0 text-muted" />
      <h2 className="text-caption font-semibold uppercase tracking-[0.09em] text-secondary m-0">
        {children}
      </h2>
    </div>
  )
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/components/ui/SectionLabel.test.tsx`
Expected: PASS — 4 testes.

- [ ] **Step 5: Type-check e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/SectionLabel.tsx src/components/ui/SectionLabel.test.tsx
git commit -m "feat(ui): cria SectionLabel canonico (extraido das copias existentes)"
```

---

### Task 2: `QualidadePage.tsx` — adotar `PageHeader`, grid de KPIs responsivo

**Files:**
- Modify: `src/features/erp/qualidade/QualidadePage.tsx` (só cabeçalho + grid de KPIs)

**Interfaces:**
- Consumes: `PageHeader` de `../../../components/ui/PageHeader` (já existe, `{ title, description }`, sem mudanças).

- [ ] **Step 1: Adicionar o import do `PageHeader`**

Adicionar, após `import { StatCard, type StatTone } from '../../../components/ui/StatCard'`:

```tsx
import { PageHeader } from '../../../components/ui/PageHeader'
```

- [ ] **Step 2: Substituir o bloco de cabeçalho**

Substituir:

```tsx
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-headline font-bold text-text mb-0.5">Qualidade — Revisitas</h1>
          <p className="text-label text-muted">
            Clientes que abriram nova OS após atendimento recente · instalação · manutenção · serviço
          </p>
        </div>

        {/* Controles de período */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-white/[0.08] bg-surface/40 overflow-hidden text-label">
            {(['atual','anterior','custom'] as Preset[]).map((v, i) => (
              <button key={v} onClick={() => setPreset(v)}
                      className={`px-3 py-1.5 transition-colors ${
                        preset === v ? 'bg-primary/20 text-primary font-semibold' : 'text-muted hover:text-text'
                      }`}>
                {['Mês Atual','Mês Anterior','Personalizado'][i]}
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
      </div>
```

por:

```tsx
      {/* Header */}
      <PageHeader
        title="Qualidade — Revisitas"
        description="Clientes que abriram nova OS após atendimento recente · instalação · manutenção · serviço"
      />

      {/* Controles de período */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-white/[0.08] bg-surface/40 overflow-hidden text-label">
          {(['atual','anterior','custom'] as Preset[]).map((v, i) => (
            <button key={v} onClick={() => setPreset(v)}
                    className={`px-3 py-1.5 transition-colors ${
                      preset === v ? 'bg-primary/20 text-primary font-semibold' : 'text-muted hover:text-text'
                    }`}>
              {['Mês Atual','Mês Anterior','Personalizado'][i]}
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
```

O `<h1>+<p>` vira `title`/`description` do `PageHeader` (mesmo texto). Os controles de período (preset/datas/Atualizar) saem de dentro da `div` de cabeçalho e viram uma segunda seção irmã logo abaixo — mesmo JSX interno, só desaninhado um nível.

- [ ] **Step 3: Grid de KPIs responsivo**

Substituir:
```tsx
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
```
por:
```tsx
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
```

(os 5 `StatCard` dentro dessa `div` não mudam.)

- [ ] **Step 4: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão (`QualidadePage.tsx` não tem testes próprios hoje).

- [ ] **Step 5: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/features/erp/qualidade/QualidadePage.tsx
git commit -m "refactor(qualidade): adota PageHeader, grid de KPIs responsivo"
```

---

### Task 3: `QualidadePage.tsx` — adotar `SectionLabel` nas 6 seções

**Files:**
- Modify: `src/features/erp/qualidade/QualidadePage.tsx` (só as 6 seções + imports)

**Interfaces:**
- Consumes: `SectionLabel` de `../../../components/ui/SectionLabel` (produzido na Task 1).

- [ ] **Step 1: Atualizar imports**

Substituir a linha:
```tsx
import { AlertTriangle, MapPin, RefreshCw, Wrench, Home, Star, Search, Sparkles, ClipboardCheck } from 'lucide-react'
```
por:
```tsx
import { AlertTriangle, MapPin, RefreshCw, Wrench, Home, Star, Search, Sparkles, ClipboardCheck, Activity, BarChart3 } from 'lucide-react'
```

Adicionar, logo após `import { PageHeader } from '../../../components/ui/PageHeader'` (adicionado na Task 2):
```tsx
import { SectionLabel } from '../../../components/ui/SectionLabel'
```

- [ ] **Step 2: Seção "Acompanhamento Diário"**

Substituir:
```tsx
              <div className="flex items-center gap-2.5">
                <div className="w-[3px] h-4 rounded-full bg-violet-400 flex-shrink-0" />
                <span className="text-caption font-bold uppercase tracking-[0.07em] text-violet-400">
                  Acompanhamento Diário — Instalação vs Manutenção
                </span>
              </div>
```
por:
```tsx
              <SectionLabel icon={Activity} color="#a78bfa">
                Acompanhamento Diário — Instalação vs Manutenção
              </SectionLabel>
```

- [ ] **Step 3: Seção "Principais Ocorrências"**

Substituir:
```tsx
              <div className="flex items-center gap-2.5">
                <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: cor }} />
                <span className="text-caption font-bold uppercase tracking-[0.07em]" style={{ color: cor }}>
                  Principais Ocorrências — clique para ver as OS
                </span>
              </div>
```
por:
```tsx
              <SectionLabel icon={BarChart3} color={cor}>
                Principais Ocorrências — clique para ver as OS
              </SectionLabel>
```

Nota: `cor` continua sendo a variável dinâmica já existente (`const cor = TIPO_COLOR[tipoAtivo]`, linha ~186) — não virar hex fixo.

- [ ] **Step 4: Seção "Por Cidade"**

Substituir:
```tsx
                <div className="flex items-center gap-2.5">
                  <div className="w-[3px] h-4 rounded-full bg-cyan-400 flex-shrink-0" />
                  <MapPin size={12} className="text-cyan-400 flex-shrink-0" />
                  <span className="text-caption font-bold uppercase tracking-[0.07em] text-cyan-400">
                    Por Cidade
                  </span>
                </div>
```
por:
```tsx
                <SectionLabel icon={MapPin} color="#22d3ee">
                  Por Cidade
                </SectionLabel>
```

- [ ] **Step 5: Seção "Crônicos"**

Substituir:
```tsx
                <div className="flex items-center gap-2.5">
                  <div className="w-[3px] h-4 rounded-full bg-red-400 flex-shrink-0" />
                  <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
                  <span className="text-caption font-bold uppercase tracking-[0.07em] text-red-400">
                    Crônicos — 2+ revisitas
                  </span>
                </div>
```
por:
```tsx
                <SectionLabel icon={AlertTriangle} color="#f87171">
                  Crônicos — 2+ revisitas
                </SectionLabel>
```

- [ ] **Step 6: Seção "Causa Raiz Registrada pelo Time"**

Substituir:
```tsx
            <div className="flex items-center gap-2.5">
              <div className="w-[3px] h-4 rounded-full bg-teal-400 flex-shrink-0" />
              <ClipboardCheck size={12} className="text-teal-400 flex-shrink-0" />
              <span className="text-caption font-bold uppercase tracking-[0.07em] text-teal-400">
                Causa Raiz Registrada pelo Time
              </span>
            </div>
```
por:
```tsx
            <SectionLabel icon={ClipboardCheck} color="#2dd4bf">
              Causa Raiz Registrada pelo Time
            </SectionLabel>
```

- [ ] **Step 7: Seção "Causa Raiz de Revisitas (IA)"**

Substituir:
```tsx
            <div className="flex items-center gap-2.5">
              <div className="w-[3px] h-4 rounded-full bg-violet-500 flex-shrink-0" />
              <Sparkles size={12} className="text-violet-400 flex-shrink-0" />
              <span className="text-caption font-bold uppercase tracking-[0.07em] text-violet-400">
                Causa Raiz de Revisitas (IA, inferida das observações)
              </span>
            </div>
```
por:
```tsx
            <SectionLabel icon={Sparkles} color="#8b5cf6">
              Causa Raiz de Revisitas (IA, inferida das observações)
            </SectionLabel>
```

(Nota: a cor usada é `#8b5cf6`, a mesma da barra original — `bg-violet-500` — e não `#a78bfa`/`text-violet-400`, que era a cor do ícone/texto original; as duas já divergiam no código-fonte antes desta task, resolvido a favor da cor da barra por ser o elemento visual primário.)

- [ ] **Step 8: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão.

- [ ] **Step 9: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros — confirma que `Wrench`/`Home`/`Star`/`Search` (usados em `TIPO_ICON` e no estado vazio do painel de ocorrências) continuam usados e nenhum import lucide ficou órfão.

- [ ] **Step 10: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true`).

No navegador, autenticado, em `/erp/qualidade`:
1. `PageHeader` mostra título "Qualidade — Revisitas" + descrição; controles de período (Mês Atual/Anterior/Personalizado + Atualizar) numa linha própria logo abaixo, funcionando como antes.
2. Grid de KPIs (5 cards) degrada corretamente em ~375px (2 colunas), ~768px (3 colunas) e desktop (5 colunas).
3. As 6 seções mostram barra colorida + ícone (cores conforme a tabela da spec) + texto em cor neutra (não mais colorido).
4. Nenhuma funcionalidade quebrou: troca de período, tabs por tipo, gráfico diário, clique numa ocorrência abre o painel de OS, drill-down, causa raiz (manual e IA).

Reportar o resultado de cada item antes de prosseguir. Se algo divergir do esperado, corrigir antes do commit.

- [ ] **Step 11: Commit**

```bash
git add src/features/erp/qualidade/QualidadePage.tsx
git commit -m "refactor(qualidade): adota SectionLabel canonico nas 6 secoes"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (`SectionLabel` canônico) → Task 1. §3.2 (cabeçalho + grid de KPIs) → Task 2. §3.3 (6 seções, tabela de ícones/cores) → Task 3, cada linha da tabela mapeada 1:1 num Step. §5 (testes) → `SectionLabel.test.tsx` na Task 1 (RTL puro, mesmo padrão de `PageHeader.test.tsx`); regressão da suíte completa + verificação manual nas Tasks 2/3.

**Placeholders:** nenhum "TBD" — todo código é completo e literal; os blocos "antes" das Tasks 2/3 são cópia exata do arquivo lido durante o brainstorming, conferidos linha a linha contra o código-fonte.

**Consistência de tipos:** `SectionLabelProps`/`SectionLabel` definidos na Task 1 são consumidos com a mesma assinatura exata (`icon`, `color`, `children`) em todas as 6 chamadas da Task 3. A cor da "Causa Raiz de Revisitas (IA)" (`#8b5cf6`) é intencionalmente diferente da "Acompanhamento Diário" (`#a78bfa`) apesar de ambas serem "violeta" — documentado explicitamente no Step 7 pra não ser confundido com erro de transcrição.
