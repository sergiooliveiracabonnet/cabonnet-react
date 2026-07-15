# Redesign Enterprise — Onda 1: Fundação (Design)

**Data:** 2026-07-15
**Status:** Aprovado pelo usuário (mapa de ondas + design da Onda 1)
**Escopo deste documento:** decomposição do redesign completo em ondas + design detalhado da Onda 1 (Fundação). Cada onda seguinte terá spec própria.

---

## 1. Contexto

O Cabonnet React é um dashboard operacional de ISP (Vale do Paraíba) com 18 rotas ativas, público de diretores a analistas. O objetivo do redesign é elevar o produto ao padrão de SaaS enterprise (Linear, Stripe, Datadog) — clareza, escaneabilidade e decisão em menos de 30 segundos.

**Decisões de escopo tomadas com o usuário:**

1. `dashboard-proposta-sobria.html` (7/jul) é a **direção visual aprovada** — referência para o Dashboard e para a linguagem das demais telas.
2. Sequência: **Fundação → Dashboard → resto**, por ondas.
3. Arquitetura de informação pode ser **reorganizada livremente** (fusões, remoções, reagrupamento do menu), desde que cada mudança de rota/módulo venha com plano de migração de permissões e redirects.
4. Validação: **direto no código**, revisão do usuário rodando o app (sem mockups intermediários).

**Restrições permanentes (feedback histórico do usuário):**

- Design sóbrio obrigatório: tokens reais do `index.css`, Inter, **cor apenas para status**. Temas conceituais foram rejeitados.
- JetBrains Mono proibida; números usam Inter + `tabular-nums`.
- Porta 3000 exclusiva; `npm run lint` obrigatório antes de commit (CI quebra sem ele).

---

## 2. Diagnóstico (auditoria de 2026-07-15)

Quantificado no código atual:

| # | Problema | Evidência |
|---|---|---|
| 1 | **Sem escala tipográfica** | 20 tamanhos ad-hoc: 427× `text-[11px]`, 317× `text-[10px]`, 63× `text-[9px]`, 7× `text-[8px]`. Texto de 8–9px é ilegível para o público-alvo. |
| 2 | **5 implementações de cartão de KPI** | `KPICard` (ui), `BentoKPICard` (dashboard), `KpiCard` (qualidade), `KPIHeader` (fechamento), `KpiBadge` (mapa). Densidades e comportamentos divergem por tela. |
| 3 | **Arco-íris semântico** | Só no Dashboard, KPIs usam 7 accents distintos. Quando tudo tem cor, cor deixa de sinalizar problema — viola o princípio aprovado "cor só para status". |
| 4 | **A11y quebrada nos primitivos** | `Card`/`KPICard` clicáveis são `<div onClick>` sem `role`, `tabIndex` ou foco visível; headers ordenáveis do `DataTable` idem. |
| 5 | **Sem virtualização** | `DataTable` renderiza todas as linhas. |
| 6 | **Sem EmptyState/PageHeader** | Estados vazios são strings cruas; cada página monta o próprio cabeçalho. |

**Pontos fortes preservados:** tokens zinc/Inter do `index.css` (sólidos, alinhados a Stripe/Clerk), dark/light funcional, `prefers-reduced-motion` respeitado, Dashboard com drill-down e seções já na direção aprovada.

**Conclusão:** o problema não é falta de design system — é falta de *enforcement*. A fundação existe; as telas desobedecem.

---

## 3. Mapa de ondas (aprovado)

| Onda | Escopo | Racional |
|---|---|---|
| **1. Fundação** | Este documento | Tudo que vem depois consome isso |
| **2. Dashboard** | Deltas da proposta sóbria aprovada sobre o Dashboard atual | Tela principal, direção já validada |
| **3. IA & Navegação** | Sidebar por fluxo de trabalho, fusões/remoções de telas, redirects + migração de permissões, upgrade do command palette | Decidir *o que existe* antes de redesenhar tela a tela |
| **4. Ordens & Fila** | Telas de uso diário intensivo | Maior tempo de exposição |
| **5. ERP analíticos** | Produtividade, Qualidade, Ranking, Relatórios, Planner, Central de Ação, Alertas | Compartilham padrões de página analítica |
| **6. Periféricas** | Fornecedor, Juniper, Fechamento, Mapa, NOC, Usuários, Login | Menor frequência |

Cada onda: spec → plano → implementação → revisão do usuário no app.

---

## 4. Design da Onda 1 (Fundação)

### 4.1 Escala tipográfica semantizada

Cinco tamanhos nomeados em `tailwind.config.js` (`theme.extend.fontSize`), cada um com papel único:

| Token | Tamanho/peso | Papel |
|---|---|---|
| `text-display` | 28px / 700 | Valores de KPI (com `tabular-nums`, tracking -0.025em) |
| `text-title` | 15px / 600 | Títulos de card, seção e página |
| `text-body` | 13px / 400 | Conteúdo corrente, células de tabela |
| `text-label` | 12px / 500 | Rótulos, subtítulos, headers de tabela |
| `text-caption` | 11px / 500 | Metadados — **mínimo absoluto do sistema** |

Migração mecânica em todo o `src/`:

- `text-[8px]`, `text-[9px]`, `text-[10px]` → `text-caption` (11px). Inclui a densidade `mini` do DataTable.
- `text-[11px]` → `text-caption`; `text-[12px]` → `text-label`; `text-[13px]` → `text-body`; `text-[14px]`/`text-[15px]` → `text-title` ou `text-body` conforme papel; `text-[28px]` → `text-display`.
- Tamanhos maiores pontuais (hero do NOC, 40–64px) permanecem como exceções documentadas com comentário.

A migração NÃO altera layout intencionalmente além do ganho de 1–3px nos textos micro; quebras visuais pontuais (truncamento, overflow) são corrigidas no local.

### 4.2 StatCard único

O `BentoKPICard` (padrão visual da proposta aprovada) é promovido a `src/components/ui/StatCard.tsx` — componente canônico de estatística. API:

```tsx
interface StatCardProps {
  title: string
  value: ReactNode
  sub?: string
  icon?: ComponentType<{ size?: number; className?: string }>
  tone?: 'neutral' | 'critical' | 'warning' | 'ok' | 'info'  // default: 'neutral'
  trend?: { delta: number; pct?: number; higherIsBetter?: boolean }
  scope?: 'aovivo' | 'periodo'   // badge de escopo temporal
  size?: 'sm' | 'md'             // sm cobre casos KpiBadge/KPIHeader
  onClick?: () => void           // acessível (ver 4.4)
  delay?: number                 // stagger de entrada
}
```

Migram para `StatCard` e são **deletados**:

- `src/components/ui/KPICard.tsx` (+ teste migra para `StatCard.test.tsx`)
- `BentoKPICard` em `src/features/dashboard/DashboardKpiPrimitives.tsx`
- `KpiCard` em `src/features/erp/qualidade/QualidadeComponents.tsx`
- `KPIHeader` (parte cartões) em `src/features/fechamento/FechamentoPage.tsx`
- `KpiBadge` em `src/features/mapa/MapaComponents.tsx`

A migração **preserva a aparência atual de cada tela** (mapeando accent atual → tone equivalente). A neutralização de cor acontece na onda de cada tela, para revisão tela a tela.

### 4.3 Disciplina de cor na API

- `tone="neutral"` é o default: valor em `text-text`, sem glow, sem ícone colorido.
- Tons semânticos (`critical`/`warning`/`ok`/`info`) reservados a estado real do negócio.
- Regra documentada no próprio componente (comentário de API) e verificada nas ondas seguintes.

### 4.4 Acessibilidade nos primitivos

- `Card` e `StatCard` clicáveis: `role="button"`, `tabIndex={0}`, ativação por Enter/Espaço, anel `focus-visible` (`ring-2 ring-primary/40`).
- Headers ordenáveis do `DataTable`: `<button>` interno com `aria-sort` no `<th>`.
- Auditoria de `aria-label` em todos os botões só-ícone de `src/components/ui/`.

### 4.5 EmptyState e PageHeader

- `src/components/ui/EmptyState.tsx`: ícone + título + descrição + ação opcional. Integrado ao `DataTable` (substitui a string "Nenhum resultado encontrado") e exportado para uso nas páginas.
- `src/components/ui/PageHeader.tsx`: título (`text-title`), descrição (`text-label text-muted`), slot de ações à direita. Criado agora; adoção pelas telas nas suas ondas.

### 4.6 DataTable v2

- Virtualização condicional quando `rows.length > 100`, via `@tanstack/react-virtual` (única dependência nova).
- Header sticky dentro do container de scroll.
- Convenção: colunas numéricas com `align: 'right'` + `tabular-nums`.
- Densidade `mini` passa a 11px (ver 4.1).

### 4.7 Enforcement — `npm run audit:ds`

Script Node sem dependências (`scripts/audit-ds.mjs`) que falha com exit ≠ 0 se encontrar em `src/**/*.tsx`:

1. `text-[8px]`, `text-[9px]`, `text-[10px]` (regex de tamanhos banidos);
2. imports dos componentes deletados (`KPICard`, `BentoKPICard`, `KpiCard` de qualidade, `KpiBadge`);
3. cores hex inline novas em `className`/props de estilo fora dos tokens (lista de exceções para SVG/canvas documentada no script).

Plugado ao `package.json` e ao passo de lint do CI.

---

## 5. Verificação da onda

1. `npx tsc --noEmit` limpo
2. `npm run lint` limpo
3. `npm test` — suite existente + testes atualizados (`StatCard.test.tsx`)
4. `npm run audit:ds` limpo
5. `npm run build` limpo
6. Revisão visual do usuário no app (todas as rotas navegadas — a migração não deve degradar nenhuma tela)

## 6. Fora do escopo da Onda 1

- Nenhum redesign de tela (ondas 2+)
- Nenhuma mudança de rota, sidebar ou permissão (onda 3)
- Nenhuma feature nova
- Neutralização visual de cor nas telas (ondas 2+; onda 1 só define a API)
