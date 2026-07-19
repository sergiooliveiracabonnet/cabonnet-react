# Onda 6a — Fornecedor (PageHeader) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `FornecedorPage.tsx` adota o `PageHeader` (já usado em Ordens/Fila/Qualidade/Ranking/Relatórios/Planner/Alertas) — primeira sub-onda de "Onda 6: Periféricas" (decomposta em Fornecedor/Juniper/Fechamento/Usuários).

**Architecture:** Substituição pura de JSX num único arquivo — o bloco `<div><Home/><h2>Análise por Fornecedor</h2></div>` vira `<PageHeader title="Análise por Fornecedor" icon={Home} />`, usando a prop `icon?` já existente desde a Onda 5b. Nenhuma lógica (`buildFornecedor`, `useAIFornecedor`, `FornecedorPanel`) muda.

**Tech Stack:** React 18 + TypeScript.

## Global Constraints

- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- Antes de commitar: `npx tsc --noEmit`, `npm run lint`, `npm run audit:ds`, `npm test`, `npm run build` devem passar limpos.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — `buildFornecedor`, `useAIFornecedor`, `FornecedorPanel`, `scoreColor`, `fmtCusto`, `SectionTitle` não mudam.
- Grid de KPIs dentro de `FornecedorPanel` (`grid-cols-2 sm:grid-cols-4 lg:grid-cols-7`) já está correto — não tocar.
- Mudanças de UI exigem verificação manual no navegador — o controller faz essa verificação depois que a task e a review terminam (mesmo padrão das ondas anteriores).

---

### Task 1: Adotar `PageHeader` em `FornecedorPage.tsx`

**Files:**
- Modify: `src/features/fornecedor/FornecedorPage.tsx` (só o bloco de cabeçalho + 1 import)

**Interfaces:**
- Consumes: `PageHeader` de `../../components/ui/PageHeader` (`{ title, icon }`, já existe desde a Onda 5b, sem mudanças de API necessárias aqui).

- [ ] **Step 1: Adicionar o import do `PageHeader`**

Adicionar, após `import { SectionTitle } from '../../components/ui/SectionTitle'`:

```tsx
import { PageHeader } from '../../components/ui/PageHeader'
```

- [ ] **Step 2: Substituir o bloco de cabeçalho**

Substituir:

```tsx
      <div className="flex items-center gap-2">
        <Home size={16} className="text-primary" />
        <h2 className="font-headline text-xl font-semibold text-text">Análise por Fornecedor</h2>
      </div>
```

por:

```tsx
      <PageHeader title="Análise por Fornecedor" icon={Home} />
```

(`Home` já está importado no topo do arquivo, de `lucide-react` — não precisa de novo import.)

- [ ] **Step 3: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão (`FornecedorPage.tsx` não tem testes próprios hoje).

- [ ] **Step 4: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros.

- [ ] **Step 5: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true`).

No navegador, autenticado, em `/fornecedor`:
1. `PageHeader` mostra o ícone `Home` antes do título "Análise por Fornecedor", no mesmo estilo visual de antes (só agora via `<h1>` semântico em vez de `<h2>`).
2. Filtro por operadora (pills coloridos) continua funcionando abaixo do cabeçalho.
3. Ranking por Score Composto, edição de meta (se gestor), análise de IA e os painéis por fornecedor (KPIs, tabela de equipes, gráfico, custo mensal editável) continuam funcionando normalmente.

Reportar o resultado de cada item antes de prosseguir. Se algo divergir do esperado, corrigir antes do commit.

- [ ] **Step 6: Commit**

```bash
git add src/features/fornecedor/FornecedorPage.tsx
git commit -m "refactor(fornecedor): adota PageHeader com icon"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (cabeçalho de Fornecedor) → Task 1, único bloco de mudança. §5 (testes) → regressão da suíte completa + verificação manual cobrindo filtro/ranking/IA/painéis.

**Placeholders:** nenhum "TBD" — código completo e literal; o bloco "antes" é cópia exata do arquivo lido durante o brainstorming.

**Consistência de tipos:** `PageHeader` consumido com `title`+`icon`, mesma assinatura já estabelecida na Onda 5b (`icon?: ComponentType<{ size?: number; className?: string }>`, compatível com `Home` de `lucide-react`) — nenhuma mudança de API necessária nesta sub-onda.
