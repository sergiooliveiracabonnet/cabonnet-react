# Onda 6c — Fechamento (PageHeader) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `FechamentoPage.tsx` adota o `PageHeader` (já usado em Ordens/Fila/Qualidade/Ranking/Relatórios/Planner/Alertas/Fornecedor/Juniper) usando `icon`+`description` (combinação já usada por `RankingTecnicosPage.tsx`, Onda 5b) — terceira sub-onda de "Onda 6: Periféricas". Nenhum grid muda (já responsivos).

**Architecture:** Substituição de JSX num único arquivo — o bloco `<div><FileText/><h2>Relatório de Fechamento</h2><span>— legenda</span></div>` vira `<PageHeader title description icon={FileText} />`, usando props já existentes. Nenhuma lógica (`filterRows`, `calcStats`, exportação PDF/CSV, automação) muda.

**Tech Stack:** React 18 + TypeScript.

## Global Constraints

- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- Antes de commitar: `npx tsc --noEmit`, `npm run lint`, `npm run audit:ds`, `npm test`, `npm run build` devem passar limpos.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — `filterRows`, `calcStats`, `getPeriodDates`, `getPeriodoNome`, `exportRelatorioCSV`, `generateFechamentoPDF`, `useFechamentoAutomation`, `EquipesTable`/`CidadesChart`/`TiposCards`/`RedeBlock`/`ClientesRedeList`/`KPIHeader`/`Section` não mudam.
- `PageHeader` já suporta `icon?`/`description?` (usados juntos desde a Onda 5b) — nenhuma mudança de API necessária nesta sub-onda.
- Nenhum grid muda — os 2 grids de 5 itens (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`, linhas 248/440) já têm breakpoint intermediário; os 2 grids de 2 itens (`grid-cols-1 lg:grid-cols-2`, linhas 173/455) já são o padrão mínimo aceitável. Não tocar em nenhum dos 4.
- Mudanças de UI exigem verificação manual no navegador — o controller faz essa verificação depois que a task e a review terminam (mesmo padrão das ondas anteriores).
- Não repetir a alegação incorreta de "exatamente um `<h1>` por página" (corrigida na Onda 6a) — adotar `PageHeader` padroniza Fechamento com as 9 telas já migradas, mas o `Navbar.tsx` já renderiza seu próprio `<h1>` por rota, então a página passa a ter dois `<h1>`, igual às demais.

---

### Task 1: Adotar `PageHeader` em `FechamentoPage.tsx`

**Files:**
- Modify: `src/features/fechamento/FechamentoPage.tsx` (só o bloco de cabeçalho + 1 import)

**Interfaces:**
- Consumes: `PageHeader` de `../../components/ui/PageHeader` (`{ title, description, icon }`, todas já existentes, sem mudanças de API necessárias aqui).

- [ ] **Step 1: Adicionar o import do `PageHeader`**

Adicionar, após `import { useOSDerived } from '../../contexts/OSDataContext'`:

```tsx
import { PageHeader } from '../../components/ui/PageHeader'
```

- [ ] **Step 2: Substituir o bloco de cabeçalho**

Substituir:

```tsx
      <div className="flex items-center gap-2 flex-wrap">
        <FileText size={16} className="text-primary flex-shrink-0" />
        <h2 className="font-headline text-xl font-semibold text-text">Relatório de Fechamento</h2>
        <span className="text-caption text-muted">— fechamento operacional por período e escopo</span>
      </div>
```

por:

```tsx
      <PageHeader
        title="Relatório de Fechamento"
        description="Fechamento operacional por período e escopo"
        icon={FileText}
      />
```

(`FileText` já está importado no topo do arquivo, de `lucide-react` — não precisa de novo import.)

- [ ] **Step 3: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão (`FechamentoPage.tsx` não tem testes próprios hoje).

- [ ] **Step 4: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros.

- [ ] **Step 5: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true`).

No navegador, autenticado, em `/fechamento`:
1. `PageHeader` mostra o ícone `FileText`, título "Relatório de Fechamento" e a descrição "Fechamento operacional por período e escopo" abaixo do título — mesmo estilo visual das telas com icon+description (ex. Ranking), agora via `<h1>` semântico em vez de `<h2>`.
2. Toolbar de período (Hoje/Ontem/7 dias/.../Personalizado) e de escopo (Global/Instacable/Wes/THM/Rede) continuam funcionando.
3. `KPIHeader` (com botões PDF/CSV/Imprimir), ranking de equipes, produtividade por cidade/tipo e bloco Rede (quando aba "Rede" ou dados de rede presentes) continuam funcionando normalmente.
4. Botões flutuantes de exportação no rodapé continuam funcionando.

Reportar o resultado de cada item antes de prosseguir. Se algo divergir do esperado, corrigir antes do commit.

- [ ] **Step 6: Commit**

```bash
git add src/features/fechamento/FechamentoPage.tsx
git commit -m "refactor(fechamento): adota PageHeader com icon/description"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (cabeçalho de Fechamento) → Task 1, único bloco de mudança. §5 (testes) → regressão da suíte completa + verificação manual cobrindo toolbar/KPIHeader/ranking/produtividade/Rede/exportação.

**Placeholders:** nenhum "TBD" — código completo e literal; o bloco "antes" é cópia exata do arquivo lido durante o brainstorming.

**Consistência de tipos:** `PageHeader` consumido com `title`+`description`+`icon`, mesma assinatura já estabelecida na Onda 5b (`icon?: ComponentType<{ size?: number; className?: string }>`, `description?: string`) — nenhuma mudança de API necessária nesta sub-onda.
