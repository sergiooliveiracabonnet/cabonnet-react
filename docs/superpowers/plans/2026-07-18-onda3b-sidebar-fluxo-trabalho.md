# Redesign Enterprise — Onda 3b: Sidebar por Fluxo de Trabalho Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar os 4 grupos de navegação da sidebar (`src/components/layout/Sidebar.tsx`) trocando o critério de agrupamento de categoria técnica (ERP/Operacional/Análise/Campo & Infra) para frequência/urgência de uso (Agora/Operar/Analisar/Infra & Campo).

**Architecture:** Mudança de dados, não de lógica — só o array literal `baseGroups` (linhas 45-81) muda `key`/`label`/`color` e a distribuição de `links` entre grupos. `NavItem`, `NavGroup`, `NavLinkDef`, a lógica de filtragem por papel (`podeVer`) e o `useMemo` que monta `groups` continuam idênticos.

**Tech Stack:** React + TypeScript, Tailwind CSS.

## Global Constraints

- `npm run build`, `npm run lint`, `npx tsc --noEmit` e `npm run audit:ds` devem ficar limpos antes do commit.
- Nenhuma rota, módulo de permissão ou tela muda — só o array `baseGroups`.
- Nenhum hex novo — as 4 cores já existem na baseline do `audit:ds` (`#c4b5fd`, `#22d3ee`, `#4ade80`, `#fb923c`), só são reatribuídas a outros grupos.
- Ícone de cada link individual não muda — representa a tela, não o grupo.
- Ver spec completa: `docs/superpowers/specs/2026-07-18-onda3b-sidebar-fluxo-trabalho-design.md`.

---

### Task 1: Reorganizar `baseGroups` por fluxo de trabalho

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:45-81`

**Interfaces:** nenhuma mudança de assinatura — `NavGroup`/`NavLinkDef` (interfaces, linhas 32-43) continuam iguais; só o valor literal de `baseGroups` muda.

**Contexto:** Ver spec §3 para o mapeamento completo grupo→telas→cor e o racional de cada tela. O grupo `infra` (Fornecedor/Juniper/NOC) mapeia 1:1 com o atual `Campo & Infra` — só ganha `Usuários` a mais (já era acrescentado em runtime só pro papel `gestor`, linha 173-179, isso não muda). Os outros 3 grupos trocam de `key`, `label`, `color` e ganham uma composição de `links` diferente.

- [ ] **Step 1: Substituir o array `baseGroups`**

Em `src/components/layout/Sidebar.tsx`, trocar o bloco atual (linhas 45-81):

```tsx
const baseGroups: NavGroup[] = [
  {
    key: 'erp', label: 'ERP', color: '#c4b5fd',
    links: [
      { to: '/erp/relatorios',    label: 'Relatórios',     icon: BarChart2   },
      { to: '/erp/alertas',       label: 'Alertas',        icon: Bell        },
      { to: '/erp/ranking',       label: 'Ranking Técnicos', icon: Medal     },
      { to: '/erp/qualidade',      label: 'Qualidade',      icon: Award       },
      { to: '/erp/planner',        label: 'Planner',        icon: CalendarDays},
      { to: '/erp/fila',           label: 'Fila de Prioridade', icon: Siren  },
    ],
  },
  {
    key: 'ops', label: 'Operacional', color: '#22d3ee',
    links: [
      { to: '/',             label: 'Dashboard',  icon: LayoutDashboard },
      { to: '/cidades',      label: 'Cidades',    icon: MapPin          },
      { to: '/mapa',         label: 'Mapa',       icon: Map             },
      { to: '/ordens',       label: 'Ordens',     icon: ClipboardList   },
    ],
  },
  {
    key: 'anal', label: 'Análise', color: '#4ade80',
    links: [
      { to: '/graficos',   label: 'Gráficos',   icon: PieChart  },
      { to: '/fechamento', label: 'Fechamento', icon: FileText  },
    ],
  },
  {
    key: 'infra', label: 'Campo & Infra', color: '#fb923c',
    links: [
      { to: '/fornecedor', label: 'Fornecedor', icon: Shield  },
      { to: '/juniper',    label: 'Juniper',    icon: Zap     },
      { to: '/noc',        label: 'NOC',        icon: Monitor },
    ],
  },
]
```

por:

```tsx
const baseGroups: NavGroup[] = [
  {
    key: 'agora', label: 'Agora', color: '#c4b5fd',
    links: [
      { to: '/',             label: 'Dashboard',        icon: LayoutDashboard },
      { to: '/erp/fila',     label: 'Fila de Prioridade', icon: Siren         },
      { to: '/erp/alertas',  label: 'Alertas',          icon: Bell            },
    ],
  },
  {
    key: 'operar', label: 'Operar', color: '#22d3ee',
    links: [
      { to: '/ordens',      label: 'Ordens',  icon: ClipboardList },
      { to: '/erp/planner', label: 'Planner', icon: CalendarDays  },
      { to: '/mapa',        label: 'Mapa',    icon: Map            },
    ],
  },
  {
    key: 'analisar', label: 'Analisar', color: '#4ade80',
    links: [
      { to: '/cidades',       label: 'Cidades',        icon: MapPin    },
      { to: '/erp/ranking',   label: 'Ranking Técnicos', icon: Medal   },
      { to: '/erp/qualidade', label: 'Qualidade',      icon: Award     },
      { to: '/erp/relatorios',label: 'Relatórios',     icon: BarChart2 },
      { to: '/graficos',      label: 'Gráficos',       icon: PieChart  },
      { to: '/fechamento',    label: 'Fechamento',     icon: FileText  },
    ],
  },
  {
    key: 'infra', label: 'Infra & Campo', color: '#fb923c',
    links: [
      { to: '/fornecedor', label: 'Fornecedor', icon: Shield  },
      { to: '/juniper',    label: 'Juniper',    icon: Zap     },
      { to: '/noc',        label: 'NOC',        icon: Monitor },
    ],
  },
]
```

Nenhum import de ícone muda — `LayoutDashboard`, `Siren`, `Bell`, `ClipboardList`, `CalendarDays`, `Map`, `MapPin`, `Medal`, `Award`, `BarChart2`, `PieChart`, `FileText`, `Shield`, `Zap`, `Monitor` já estavam todos importados (linhas 3-9) — só são redistribuídos entre grupos diferentes.

**Nota:** a lógica que acrescenta "Usuários" ao grupo `erp` para o papel `gestor` (linhas 173-179) referencia `g.key === 'erp'` — como o `key` desse grupo passa a ser `infra` (não existe mais `key: 'erp'`), essa condição precisa ser atualizada no mesmo commit (Step 2), senão "Usuários" para de aparecer para o gestor.

- [ ] **Step 2: Atualizar a referência de `key` que acrescenta "Usuários"**

No mesmo arquivo, dentro do `useMemo` de `groups` (por volta da linha 173-179), trocar:

```tsx
    if (role === 'gestor') {
      return filtrados.map(g =>
        g.key === 'erp'
          ? { ...g, links: [...g.links, { to: '/erp/usuarios', label: 'Usuários', icon: Users }] }
          : g
      )
    }
```

por:

```tsx
    if (role === 'gestor') {
      return filtrados.map(g =>
        g.key === 'infra'
          ? { ...g, links: [...g.links, { to: '/erp/usuarios', label: 'Usuários', icon: Users }] }
          : g
      )
    }
```

- [ ] **Step 3: Rodar build, lint, typecheck e auditoria de design system**

Run: `npm run build`
Expected: PASS.

Run: `npm run lint`
Expected: PASS — sem import não usado (nenhum ícone foi removido, só redistribuído, então nenhum import deveria ficar órfão).

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run audit:ds`
Expected: PASS — as 4 cores (`#c4b5fd`, `#22d3ee`, `#4ade80`, `#fb923c`) já são globais/reaproveitadas, nenhuma entrada nova na baseline é necessária.

- [ ] **Step 4: Rodar a suíte de testes completa**

Run: `npm test`
Expected: PASS — nenhum teste depende da estrutura de `baseGroups` (não há `Sidebar.test.tsx` no projeto), então nenhuma regressão esperada.

- [ ] **Step 5: Confirmar visualmente no app rodando**

Run: `npm run dev`

No navegador, logado como gestor:
1. Sidebar mostra 4 grupos, nesta ordem: **Agora** (Dashboard, Fila de Prioridade, Alertas), **Operar** (Ordens, Planner, Mapa), **Analisar** (Cidades, Ranking Técnicos, Qualidade, Relatórios, Gráficos, Fechamento), **Infra & Campo** (Fornecedor, Juniper, NOC, Usuários).
2. Cada grupo com sua cor: Agora=violeta, Operar=ciano, Analisar=verde, Infra & Campo=laranja (barra de 3px + label uppercase).
3. Clicar em cada link navega pra rota correta (nenhuma rota mudou, só a posição do link na sidebar).
4. "Usuários" aparece ao final de "Infra & Campo", só para o papel gestor.
5. Modo colapsado (sidebar fechada): tooltip ao passar o mouse continua mostrando o label correto de cada ícone.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(sidebar): reorganiza grupos por fluxo de trabalho (Agora/Operar/Analisar/Infra & Campo)"
```
