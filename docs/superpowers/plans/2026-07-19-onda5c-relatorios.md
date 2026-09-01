# Onda 5c — Relatórios Operacionais (PageHeader) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `RelatoriosPage.tsx` adota o `PageHeader` (já usado em Ordens/Fila/Qualidade/Ranking) para título+descrição, e os dois grupos de filtro (Período, Tipo) saem do cabeçalho e viram uma linha própria horizontal abaixo.

**Architecture:** Substituição pura de JSX num único arquivo — o `<h1>+<p>` vira `<PageHeader title="..." description="..." />` (sem `actions`, sem `icon` — nenhum dos dois é necessário aqui), e os dois grupos de filtro saem do wrapper vertical `flex flex-col items-end gap-2` (que existia só por disputarem espaço com o título) e viram uma linha própria `flex items-center gap-3 flex-wrap`, lado a lado. Nenhuma lógica de cálculo (`useMemo`s) ou componente local (`Section`/`Empty`/`OSListModal`) muda.

**Tech Stack:** React 18 + TypeScript.

## Global Constraints

- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- Antes de commitar: `npx tsc --noEmit`, `npm run lint`, `npm run audit:ds`, `npm test`, `npm run build` devem passar limpos.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — `kpis`, `byTeam`, `slaData`, `tipoData`, `agingData`, `ranking`, `totals`, `drill*` e os componentes de `RelatoriosComponents.tsx` não mudam.
- Grid de KPIs (`grid-cols-2 sm:grid-cols-4`, linha 257) **já está correto** — não precisa de fix nesta onda (diferente de Fila/Qualidade/Ranking).
- Mudanças de UI exigem verificação manual no navegador — o controller faz essa verificação depois que a task e a review terminam (mesmo padrão das ondas anteriores).

---

### Task 1: Adotar `PageHeader`, filtros em linha horizontal própria

**Files:**
- Modify: `src/features/erp/relatorios/RelatoriosPage.tsx` (só o bloco de cabeçalho)

**Interfaces:**
- Consumes: `PageHeader` de `../../../components/ui/PageHeader` (`{ title, description }`, já existe, sem mudanças de API necessárias aqui).

- [ ] **Step 1: Adicionar o import do `PageHeader`**

Adicionar, após `import { DonutChart } from '../../../components/ui/DonutChart'`:

```tsx
import { PageHeader } from '../../../components/ui/PageHeader'
```

- [ ] **Step 2: Substituir o bloco de cabeçalho**

Substituir (o bloco começa em `{/* ── Header ── */}` e vai até o `</div>` que fecha a `div` externa `flex items-start justify-between gap-4`, logo antes de `{/* Modal drill-down */}`):

```tsx
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-headline font-bold text-text">Relatórios Operacionais</h1>
          <p className="text-label text-secondary mt-0.5">Análise de desempenho · ERP</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Filtro de período */}
          <div className="flex gap-1 bg-elevated border border-white/[0.08] rounded-lg p-0.5">
            {[
              { value: 'all',   label: 'Tudo'          },
              { value: 'month', label: 'Últimos 30 dias' },
              { value: 'week',  label: 'Últimos 7 dias'  },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriodoFilter(opt.value)}
                className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all duration-150
                  ${periodoFilter === opt.value
                    ? 'bg-primary/20 text-primary'
                    : 'text-secondary hover:text-text hover:bg-surface/40'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Filtro de tipo */}
          <div className="flex gap-1 bg-elevated border border-white/[0.08] rounded-lg p-0.5">
            {[
              { value: '',           label: 'Todos'      },
              { value: 'INSTALACAO', label: 'Instalação' },
              { value: 'MANUTENCAO', label: 'Manutenção' },
              { value: 'REDE',       label: 'Rede'       },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setTipoFilter(opt.value)}
                className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all duration-150
                  ${tipoFilter === opt.value
                    ? 'bg-primary/20 text-primary'
                    : 'text-secondary hover:text-text hover:bg-surface/40'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
```

por:

```tsx
      {/* ── Header ── */}
      <PageHeader
        title="Relatórios Operacionais"
        description="Análise de desempenho · ERP"
      />

      {/* ── Filtros ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filtro de período */}
        <div className="flex gap-1 bg-elevated border border-white/[0.08] rounded-lg p-0.5">
          {[
            { value: 'all',   label: 'Tudo'          },
            { value: 'month', label: 'Últimos 30 dias' },
            { value: 'week',  label: 'Últimos 7 dias'  },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriodoFilter(opt.value)}
              className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all duration-150
                ${periodoFilter === opt.value
                  ? 'bg-primary/20 text-primary'
                  : 'text-secondary hover:text-text hover:bg-surface/40'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Filtro de tipo */}
        <div className="flex gap-1 bg-elevated border border-white/[0.08] rounded-lg p-0.5">
          {[
            { value: '',           label: 'Todos'      },
            { value: 'INSTALACAO', label: 'Instalação' },
            { value: 'MANUTENCAO', label: 'Manutenção' },
            { value: 'REDE',       label: 'Rede'       },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setTipoFilter(opt.value)}
              className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all duration-150
                ${tipoFilter === opt.value
                  ? 'bg-primary/20 text-primary'
                  : 'text-secondary hover:text-text hover:bg-surface/40'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
```

O `<h1>+<p>` vira `title`/`description` do `PageHeader` (mesmo texto). Os dois grupos de filtro saem da `div` vertical `flex flex-col items-end gap-2` e viram irmãos numa `div` horizontal `flex items-center gap-3 flex-wrap` — mesmo JSX interno de cada grupo (botões, `onClick`, classes condicionais), só desaninhados e lado a lado em vez de empilhados.

- [ ] **Step 3: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão (`RelatoriosPage.tsx` não tem testes próprios hoje).

- [ ] **Step 4: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros.

- [ ] **Step 5: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true`).

No navegador, autenticado, em `/erp/relatorios`:
1. `PageHeader` mostra título "Relatórios Operacionais" + descrição "Análise de desempenho · ERP".
2. Logo abaixo, os dois grupos de filtro (Período: Tudo/30 dias/7 dias; Tipo: Todos/Instalação/Manutenção/Rede) aparecem lado a lado, na mesma linha.
3. Trocar o período e o tipo continua filtrando KPIs, gráficos ("OS por Equipe", "Distribuição por Tipo", "SLA por Equipe", "Distribuição de Aging") e o ranking de produtividade normalmente.
4. Clicar num KPI (Total de OS, SLA Vencido, Sem Equipe, Aging Médio) ainda abre o modal de drill-down com a lista de OS.

Reportar o resultado de cada item antes de prosseguir. Se algo divergir do esperado, corrigir antes do commit.

- [ ] **Step 6: Commit**

```bash
git add src/features/erp/relatorios/RelatoriosPage.tsx
git commit -m "refactor(relatorios): adota PageHeader, filtros em linha horizontal propria"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (cabeçalho + filtros) → Task 1, único bloco de mudança. §5 (testes) → regressão da suíte completa + verificação manual cobrindo explicitamente filtros e drill-down (as duas interações que dependem do estado movido).

**Placeholders:** nenhum "TBD" — código completo e literal; o bloco "antes" é cópia exata do arquivo lido durante o brainstorming.

**Consistência de tipos:** `PageHeader` consumido com a mesma assinatura (`title`, `description`) já estabelecida nas 4 telas anteriores — nenhuma mudança de API necessária nesta onda (diferente da Onda 5b, que precisou adicionar `icon`).
