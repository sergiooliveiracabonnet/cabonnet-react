# Onda 3c — Command Palette (Navegação de Páginas no Ctrl+K) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O `Ctrl+K`/`⌘K` (hoje só busca OS) passa a também navegar direto para qualquer página do app (Dashboard, Ordens, Juniper etc.), respeitando as permissões do usuário, num único modal com resultados mistos e seções com rótulo.

**Architecture:** A lista de páginas + a lógica de filtro por permissão (hoje só dentro de `Sidebar.tsx`) é extraída para `src/lib/navigation.ts` como funções puras (`visibleNavGroups`) e um hook fino (`useVisibleNavGroups`), consumidos tanto pelo `Sidebar` quanto pelo `GlobalSearch` — elimina a duplicação que surgiria de manter a lista de páginas em dois lugares. `GlobalSearch.tsx` ganha uma função pura `matchPages` (mesmo padrão de `matchOS`/`searchRows` já existentes no arquivo) e passa a computar `{ pages, os }` a partir da query, unificando os dois tipos numa única lista navegável por teclado.

**Tech Stack:** React 18 + TypeScript, Zustand (`useAuthStore`), React Router (`useNavigate`), Vitest (testes unitários das funções puras).

## Global Constraints

- Todo texto de interface em pt-br (idioma do projeto — ver placeholder/hints existentes em `GlobalSearch.tsx`/`Navbar.tsx`).
- Antes de commitar qualquer `.tsx`/`.ts`: rodar `npx tsc --noEmit`, `npm run lint`, `npm test` e `npm run build` — replica exatamente o pipeline do CI (`.github/workflows/*.yml`, job "Type-check · Lint · Test · Build").
- Não introduzir hex novo de cor — as 4 cores de grupo (`#c4b5fd`, `#22d3ee`, `#4ade80`, `#fb923c`) já existem na baseline do `audit:ds` e só são reaproveitadas; rodar `npm run audit:ds` antes de commitar mudanças que tocam `Sidebar.tsx`/`navigation.ts`.
- Mudanças de UI exigem verificação manual no navegador antes de reportar como concluído (não basta type-check/lint/test passarem).
- Nenhuma rota, permissão ou tela nova nesta onda — só navegação dentro do palette existente.

---

### Task 1: Extrair lista de páginas + permissões para `src/lib/navigation.ts`

**Files:**
- Create: `src/lib/navigation.ts`
- Create: `src/lib/navigation.test.ts`

**Interfaces:**
- Produces: `interface NavLinkDef { to: string; label: string; icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }> }`, `interface NavGroup { key: string; label: string; color: string; links: NavLinkDef[] }`, `export const NAV_GROUPS: NavGroup[]`, `export function visibleNavGroups(role: UserRole, modulos: string[]): NavGroup[]`, `export function useVisibleNavGroups(): NavGroup[]` — usados por Task 2 (`Sidebar.tsx`) e Task 3/4 (`GlobalSearch.tsx`).
- Consumes: `useAuthStore` de `../store/authStore` (tipo `UserRole`), `rotaParaModulo` de `./modulos`.

- [ ] **Step 1: Escrever o teste que falha para `visibleNavGroups`**

Criar `src/lib/navigation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { visibleNavGroups, NAV_GROUPS } from './navigation'

describe('visibleNavGroups', () => {
  it('gestor ve todos os grupos e ganha Usuarios no grupo infra', () => {
    const groups = visibleNavGroups('gestor', [])
    expect(groups.length).toBe(NAV_GROUPS.length)
    const infra = groups.find(g => g.key === 'infra')
    expect(infra?.links.map(l => l.to)).toContain('/erp/usuarios')
  })

  it('operador ve somente links dos modulos liberados', () => {
    const groups = visibleNavGroups('operador', ['dashboard', 'ordens'])
    const allLinks = groups.flatMap(g => g.links.map(l => l.to))
    expect(allLinks).toEqual(expect.arrayContaining(['/', '/ordens']))
    expect(allLinks).not.toContain('/juniper')
    expect(allLinks).not.toContain('/erp/usuarios')
  })

  it('remove grupos sem nenhum link visivel', () => {
    const groups = visibleNavGroups('viewer', ['dashboard'])
    expect(groups.every(g => g.links.length > 0)).toBe(true)
    expect(groups.find(g => g.key === 'operar')).toBeUndefined()
  })

  it('viewer sem modulos liberados nao ve nenhum grupo', () => {
    const groups = visibleNavGroups('viewer', [])
    expect(groups).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/navigation.test.ts`
Expected: FAIL — `Cannot find module './navigation'` (o arquivo ainda não existe).

- [ ] **Step 3: Criar `src/lib/navigation.ts`**

```ts
import { useMemo, type ComponentType, type CSSProperties } from 'react'
import {
  LayoutDashboard, ClipboardList,
  BarChart2, PieChart, MapPin,
  Zap, Monitor, FileText, Map,
  Bell, Award, CalendarDays, Shield, Siren, Medal, Users,
} from 'lucide-react'
import { useAuthStore, type UserRole } from '../store/authStore'
import { rotaParaModulo } from './modulos'

export interface NavLinkDef {
  to:    string
  label: string
  icon:  ComponentType<{ size?: number; className?: string; style?: CSSProperties }>
}

export interface NavGroup {
  key:   string
  label: string
  color: string
  links: NavLinkDef[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'agora', label: 'Agora', color: '#c4b5fd',
    links: [
      { to: '/',             label: 'Dashboard',          icon: LayoutDashboard },
      { to: '/erp/fila',     label: 'Fila de Prioridade', icon: Siren           },
      { to: '/erp/alertas',  label: 'Alertas',            icon: Bell            },
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
      { to: '/cidades',        label: 'Cidades',          icon: MapPin    },
      { to: '/erp/ranking',    label: 'Ranking Técnicos', icon: Medal     },
      { to: '/erp/qualidade',  label: 'Qualidade',        icon: Award     },
      { to: '/erp/relatorios', label: 'Relatórios',       icon: BarChart2 },
      { to: '/graficos',       label: 'Gráficos',         icon: PieChart  },
      { to: '/fechamento',     label: 'Fechamento',       icon: FileText  },
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

// Gestor vê tudo. Operador/Viewer só os links cujo módulo está liberado
// (ver rotaParaModulo em ./modulos) — grupos que ficam sem nenhum link visível somem.
// "Usuários" é acrescentado só pra gestor: não é um módulo togleável, é a
// própria tela de administração desses módulos.
export function visibleNavGroups(role: UserRole, modulos: string[]): NavGroup[] {
  const podeVer = (to: string) => {
    if (role === 'gestor') return true
    const modulo = rotaParaModulo(to)
    return modulo ? modulos.includes(modulo) : false
  }
  const filtrados = NAV_GROUPS
    .map(g => ({ ...g, links: g.links.filter(l => podeVer(l.to)) }))
    .filter(g => g.links.length > 0)
  if (role === 'gestor') {
    return filtrados.map(g =>
      g.key === 'infra'
        ? { ...g, links: [...g.links, { to: '/erp/usuarios', label: 'Usuários', icon: Users }] }
        : g
    )
  }
  return filtrados
}

export function useVisibleNavGroups(): NavGroup[] {
  const role    = useAuthStore(s => s.role)
  const modulos = useAuthStore(s => s.modulos)
  return useMemo(() => visibleNavGroups(role, modulos), [role, modulos])
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/navigation.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 5: Type-check e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/navigation.ts src/lib/navigation.test.ts
git commit -m "feat(navigation): extrai lista de paginas e permissoes para lib/navigation"
```

---

### Task 2: Refatorar `Sidebar.tsx` para consumir `useVisibleNavGroups()`

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `useVisibleNavGroups` de `../../lib/navigation` (produzido na Task 1).

- [ ] **Step 1: Atualizar o bloco de imports**

Em `src/components/layout/Sidebar.tsx`, substituir (linhas 1-16):

```tsx
import { useRef, useState, useEffect, useMemo, type ComponentType, type CSSProperties } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList,
  BarChart2, PieChart, MapPin,
  Zap, Monitor, LogOut, FileText, Map,
  Bell, ChevronRight,
  Award, CalendarDays, Shield, Siren, Medal, Users,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { useAuditStore } from '../../store/auditStore'
import { useOSDerived } from '../../contexts/OSDataContext'
import { api } from '../../lib/api'
import { LogoIcon } from '../ui/LogoIcon'
import { rotaParaModulo } from '../../lib/modulos'
```

por:

```tsx
import { useRef, useState, useEffect, type ComponentType, type CSSProperties } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronRight, LogOut } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { useAuditStore } from '../../store/auditStore'
import { useOSDerived } from '../../contexts/OSDataContext'
import { api } from '../../lib/api'
import { LogoIcon } from '../ui/LogoIcon'
import { useVisibleNavGroups } from '../../lib/navigation'
```

- [ ] **Step 2: Remover os tipos e a constante `baseGroups` locais**

Remover completamente (eram as linhas 32-81 do arquivo original):

```tsx
interface NavLinkDef {
  to:    string
  label: string
  icon:  ComponentType<{ size?: number; className?: string; style?: CSSProperties }>
}

interface NavGroup {
  key:   string
  label: string
  color: string
  links: NavLinkDef[]
}

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

Note: `ComponentType`/`CSSProperties` continuam sendo usados mais abaixo no arquivo (em `NavItemProps`), então continuam importados do `react` no Step 1 — só a definição local de `NavLinkDef`/`NavGroup`/`baseGroups` sai daqui.

- [ ] **Step 3: Trocar o cálculo de `groups` pelo hook**

Substituir (dentro de `export function Sidebar()`):

```tsx
  const setUnauthed = useAuthStore(s => s.setUnauthed)
  const role        = useAuthStore(s => s.role)
  const modulos     = useAuthStore(s => s.modulos)
  const logAudit    = useAuditStore(s => s.log)
  const { isLoading, error, dataUpdatedAt } = useOSDerived()

  // Gestor vê tudo. Operador/Viewer só os links cujo módulo está liberado
  // (ver src/lib/modulos.ts) — grupos que ficam sem nenhum link visível somem.
  // "Usuários" é acrescentado só pra gestor: não é um módulo togleável, é a
  // própria tela de administração desses módulos.
  const groups = useMemo<NavGroup[]>(() => {
    const podeVer = (to: string) => {
      if (role === 'gestor') return true
      const modulo = rotaParaModulo(to)
      return modulo ? modulos.includes(modulo) : false
    }
    const filtrados = baseGroups
      .map(g => ({ ...g, links: g.links.filter(l => podeVer(l.to)) }))
      .filter(g => g.links.length > 0)
    if (role === 'gestor') {
      return filtrados.map(g =>
        g.key === 'infra'
          ? { ...g, links: [...g.links, { to: '/erp/usuarios', label: 'Usuários', icon: Users }] }
          : g
      )
    }
    return filtrados
  }, [role, modulos])
```

por:

```tsx
  const setUnauthed = useAuthStore(s => s.setUnauthed)
  const role        = useAuthStore(s => s.role)
  const logAudit    = useAuditStore(s => s.log)
  const { isLoading, error, dataUpdatedAt } = useOSDerived()

  const groups = useVisibleNavGroups()
```

(`role` continua sendo usado mais abaixo para exibir `ROLE_LABELS[role ?? '']` — não remover.)

- [ ] **Step 4: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — nenhum teste quebrado (Sidebar não tinha testes próprios antes; isso confirma que nada mais no repo dependia da forma antiga de `groups`).

- [ ] **Step 5: Type-check, lint e audit de design system**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds`
Expected: sem erros — `audit:ds` confirma que nenhuma cor nova foi introduzida (as 4 cores de grupo são as mesmas, só vieram de outro arquivo).

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build passa sem warnings de import não usado.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "refactor(sidebar): consome useVisibleNavGroups de lib/navigation"
```

---

### Task 3: Adicionar `matchPages` (função pura) em `GlobalSearch.tsx`

**Files:**
- Modify: `src/components/ui/GlobalSearch.tsx`
- Create: `src/components/ui/GlobalSearch.test.ts`

**Interfaces:**
- Consumes: `NavGroup`, `NavLinkDef` de `../../lib/navigation` (produzidos na Task 1).
- Produces: `export function matchPages(groups: NavGroup[], query: string): NavLinkDef[]` — usado na Task 4 para montar a lista de resultados do palette.

- [ ] **Step 1: Escrever o teste que falha para `matchPages`**

Criar `src/components/ui/GlobalSearch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ClipboardList, Map as MapIcon } from 'lucide-react'
import { matchPages } from './GlobalSearch'
import type { NavGroup } from '../../lib/navigation'

const GROUPS: NavGroup[] = [
  {
    key: 'operar', label: 'Operar', color: '#22d3ee',
    links: [
      { to: '/ordens', label: 'Ordens', icon: ClipboardList },
      { to: '/mapa',   label: 'Mapa',   icon: MapIcon },
    ],
  },
]

describe('matchPages', () => {
  it('retorna vazio para query em branco', () => {
    expect(matchPages(GROUPS, '')).toEqual([])
    expect(matchPages(GROUPS, '   ')).toEqual([])
  })

  it('filtra por substring case-insensitive no label', () => {
    const result = matchPages(GROUPS, 'orde')
    expect(result.map(p => p.to)).toEqual(['/ordens'])
  })

  it('nao retorna nada quando nenhum label bate', () => {
    expect(matchPages(GROUPS, 'zzz')).toEqual([])
  })

  it('prioriza match exato no topo', () => {
    const groups: NavGroup[] = [
      {
        key: 'g', label: 'G', color: '#000',
        links: [
          { to: '/mapa-de-calor', label: 'Mapa de Calor', icon: MapIcon },
          { to: '/mapa',          label: 'Mapa',           icon: MapIcon },
        ],
      },
    ]
    const result = matchPages(groups, 'mapa')
    expect(result[0].to).toBe('/mapa')
  })

  it('funciona com 1 caractere', () => {
    const result = matchPages(GROUPS, 'm')
    expect(result.map(p => p.to)).toEqual(['/mapa'])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/components/ui/GlobalSearch.test.ts`
Expected: FAIL — `matchPages` não é exportado por `./GlobalSearch` ainda.

- [ ] **Step 3: Adicionar `matchPages` e o import de tipos em `GlobalSearch.tsx`**

No topo do arquivo, adicionar (junto aos imports existentes, após `import type { OSRow } from '../../lib/types'`):

```tsx
import type { NavGroup, NavLinkDef } from '../../lib/navigation'
```

Logo depois da função `searchRows` já existente (antes de `const HINT_TAGS = ...`), adicionar:

```tsx
export function matchPages(groups: NavGroup[], query: string): NavLinkDef[] {
  if (!query.trim()) return []
  const q = query.toLowerCase().trim()
  return groups
    .flatMap(g => g.links)
    .filter(l => l.label.toLowerCase().includes(q))
    .sort((a, b) => {
      const aExact = a.label.toLowerCase() === q
      const bExact = b.label.toLowerCase() === q
      if (aExact && !bExact) return -1
      if (bExact && !aExact) return 1
      return 0
    })
}
```

Não alterar mais nada neste arquivo nesta task — o resto do componente continua igual até a Task 4.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/components/ui/GlobalSearch.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Type-check e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros (atenção a import não usado — `NavLinkDef`/`NavGroup` já estão em uso pela assinatura de `matchPages`).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/GlobalSearch.tsx src/components/ui/GlobalSearch.test.ts
git commit -m "feat(global-search): adiciona matchPages para busca de paginas"
```

---

### Task 4: Ligar a navegação de páginas na UI do `GlobalSearch` + hint do `Navbar`

**Files:**
- Modify: `src/components/ui/GlobalSearch.tsx`
- Modify: `src/components/layout/Navbar.tsx`

**Interfaces:**
- Consumes: `matchPages` (Task 3), `useVisibleNavGroups` (Task 1), `useNavigate` de `react-router-dom`.

- [ ] **Step 1: Substituir o conteúdo completo de `src/components/ui/GlobalSearch.tsx`**

```tsx
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useOSDerived } from '../../contexts/OSDataContext'
import OSDrawer from '../../features/ordens/OSDrawer'
import { Badge } from './Badge'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import { useVisibleNavGroups } from '../../lib/navigation'
import type { NavGroup, NavLinkDef } from '../../lib/navigation'
import type { OSRow } from '../../lib/types'

function matchOS(r: OSRow, q: string): boolean {
  return !!(
    (r.numos as string | undefined)?.toLowerCase().startsWith(q)      ||
    (r.nomecliente as string | undefined)?.toLowerCase().includes(q)  ||
    (r.bairro as string | undefined)?.toLowerCase().includes(q)       ||
    (r.nomedacidade as string | undefined)?.toLowerCase().includes(q) ||
    (r.nomedaequipe as string | undefined)?.toLowerCase().includes(q)
  )
}

function searchRows(allRows: OSRow[], query: string): OSRow[] {
  if (!query || query.trim().length < 2) return []
  const q = query.toLowerCase().trim()
  return allRows
    .filter(r => matchOS(r, q))
    .sort((a, b) => {
      if ((a.numos as string | undefined)?.toLowerCase() === q) return -1
      if ((b.numos as string | undefined)?.toLowerCase() === q) return 1
      return ((b._aging as number) ?? (b._agingAbertura as number) ?? -1) -
             ((a._aging as number) ?? (a._agingAbertura as number) ?? -1)
    })
    .slice(0, 20)
}

export function matchPages(groups: NavGroup[], query: string): NavLinkDef[] {
  if (!query.trim()) return []
  const q = query.toLowerCase().trim()
  return groups
    .flatMap(g => g.links)
    .filter(l => l.label.toLowerCase().includes(q))
    .sort((a, b) => {
      const aExact = a.label.toLowerCase() === q
      const bExact = b.label.toLowerCase() === q
      if (aExact && !bExact) return -1
      if (bExact && !aExact) return 1
      return 0
    })
}

type NavigableItem =
  | { type: 'page'; data: NavLinkDef }
  | { type: 'os';   data: OSRow }

interface GlobalSearchProps {
  open:    boolean
  onClose: () => void
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const { allRows } = useOSDerived()
  const groups = useVisibleNavGroups()
  const navigate = useNavigate()
  const [query,      setQuery]      = useState('')
  const [activeIdx,  setActiveIdx]  = useState(-1)
  const [selectedOS, setSelectedOS] = useState<OSRow | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    if (!query.trim()) return { pages: [] as NavLinkDef[], os: [] as OSRow[] }
    return {
      pages: matchPages(groups, query),
      os:    searchRows(allRows as OSRow[], query),
    }
  }, [groups, allRows, query])

  const navigableItems = useMemo<NavigableItem[]>(() => {
    if (!query.trim()) {
      return groups.flatMap(g => g.links.map(l => ({ type: 'page' as const, data: l })))
    }
    return [
      ...results.pages.map(p => ({ type: 'page' as const, data: p })),
      ...results.os.map(o => ({ type: 'os' as const, data: o })),
    ]
  }, [query, groups, results])

  const showSectionHeaders = results.pages.length > 0 && results.os.length > 0

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(-1)
      setSelectedOS(null)
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open])

  function selectItem(item: NavigableItem) {
    if (item.type === 'page') {
      navigate(item.data.to)
      onClose()
    } else {
      setSelectedOS(item.data)
      onClose()
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !selectedOS) { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, navigableItems.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && activeIdx >= 0 && navigableItems[activeIdx]) { selectItem(navigableItems[activeIdx]) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, selectedOS, navigableItems, activeIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open && !selectedOS) return null

  return (
    <>
      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
          className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-[200]
                     flex items-start justify-center pt-[12vh] px-4"
        >
          <div className="w-full max-w-[600px] bg-elevated border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.08]">
              <Search size={16} className="text-muted flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIdx(-1) }}
                placeholder="Buscar OS ou página…"
                className="flex-1 bg-transparent text-body text-text placeholder-muted/60 outline-none"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setActiveIdx(-1) }}
                  aria-label="Limpar busca"
                  className="text-muted hover:text-secondary transition-colors p-0.5"
                >
                  <X size={13} />
                </button>
              )}
              <kbd className="text-caption font-mono bg-surface border border-white/[0.08]
                              rounded px-1.5 py-0.5 text-muted flex-shrink-0 hidden sm:block leading-none">
                ESC
              </kbd>
            </div>

            <div className="max-h-[58vh] overflow-y-auto">
              {!query.trim() && (
                <div className="px-2 py-2">
                  {groups.map(group => (
                    <div key={group.key} className="mb-1">
                      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                        <div className="w-1 h-3 rounded-full flex-shrink-0" style={{ background: group.color }} />
                        <span
                          className="text-caption font-semibold uppercase tracking-[0.06em]"
                          style={{ color: group.color + 'aa' }}
                        >
                          {group.label}
                        </span>
                      </div>
                      <div className="space-y-px">
                        {group.links.map(link => {
                          const globalIdx = navigableItems.findIndex(it => it.type === 'page' && it.data.to === link.to)
                          const isActive = globalIdx === activeIdx
                          const Icon = link.icon
                          return (
                            <button
                              key={link.to}
                              onClick={() => selectItem({ type: 'page', data: link })}
                              onMouseEnter={() => setActiveIdx(globalIdx)}
                              className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors rounded-lg
                                          ${isActive ? 'bg-surface' : 'hover:bg-surface/30'}`}
                            >
                              <Icon size={14} className="text-muted flex-shrink-0" />
                              <span className="text-body text-text font-medium flex-1">{link.label}</span>
                              {isActive && (
                                <kbd className="text-caption font-mono bg-surface border border-white/[0.08] rounded px-1.5 py-0.5 flex-shrink-0 text-muted leading-none">↵</kbd>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-2.5 border-t border-white/[0.08] flex items-center gap-5 text-muted/50 mt-1">
                    {[
                      { keys: ['↑', '↓'], label: 'navegar' },
                      { keys: ['↵'],      label: 'abrir'   },
                      { keys: ['ESC'],    label: 'fechar'  },
                    ].map(({ keys, label }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <div className="flex gap-1">
                          {keys.map(k => (
                            <kbd key={k} className="text-caption font-mono bg-surface border border-white/[0.08] rounded px-1.5 py-0.5 leading-none text-muted/70">
                              {k}
                            </kbd>
                          ))}
                        </div>
                        <span className="text-caption">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {query.trim().length > 0 && results.pages.length === 0 && results.os.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <p className="text-body text-muted">Nenhum resultado para <span className="text-text font-semibold">"{query}"</span></p>
                  <p className="text-caption text-muted/50 mt-1">Tente nº da OS, nome do cliente, cidade ou o nome de uma página</p>
                </div>
              )}

              {results.pages.length > 0 && (
                <div>
                  {showSectionHeaders && (
                    <p className="px-4 pt-3 pb-1 text-caption font-semibold text-muted uppercase tracking-[0.06em]">Páginas</p>
                  )}
                  <div className="divide-y divide-white/[0.04]">
                    {results.pages.map(page => {
                      const globalIdx = navigableItems.findIndex(it => it.type === 'page' && it.data.to === page.to)
                      const isActive = globalIdx === activeIdx
                      const Icon = page.icon
                      return (
                        <button
                          key={page.to}
                          onClick={() => selectItem({ type: 'page', data: page })}
                          onMouseEnter={() => setActiveIdx(globalIdx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                                      ${isActive ? 'bg-surface' : 'hover:bg-surface/30'}`}
                        >
                          <Icon size={14} className="text-muted flex-shrink-0" />
                          <span className="text-body text-text font-medium flex-1">{page.label}</span>
                          {isActive && (
                            <kbd className="text-caption font-mono bg-surface border border-white/[0.08] rounded px-1.5 py-0.5 flex-shrink-0 text-muted leading-none">↵</kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {results.os.length > 0 && (
                <div>
                  {showSectionHeaders && (
                    <p className="px-4 pt-3 pb-1 text-caption font-semibold text-muted uppercase tracking-[0.06em]">Ordens de Serviço</p>
                  )}
                  <div className="divide-y divide-white/[0.04]">
                    {results.os.map(os => {
                      const aging = (os._aging as number | undefined) ?? (os._agingAbertura as number | undefined)
                      const agCls = (aging ?? 0) >= 6 ? 'text-red' : (aging ?? 0) >= 3 ? 'text-yellow' : 'text-muted'
                      const globalIdx = navigableItems.findIndex(it => it.type === 'os' && it.data.numos === os.numos)
                      const isActive = globalIdx === activeIdx
                      return (
                        <button
                          key={os.numos as string}
                          onClick={() => selectItem({ type: 'os', data: os })}
                          onMouseEnter={() => setActiveIdx(globalIdx)}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors
                                      ${isActive ? 'bg-surface' : 'hover:bg-surface/30'}`}
                        >
                          <span className="font-mono text-label text-primary font-bold w-[68px] flex-shrink-0 pt-0.5">
                            {os.numos as string}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-body text-text font-semibold truncate max-w-[220px]">
                                {(os.nomecliente as string) || '—'}
                              </span>
                              <Badge variant={situacaoVariant(os.descsituacao as string)}>{os.descsituacao as string}</Badge>
                              {os._slaCritico && <Badge variant="red">Crítico</Badge>}
                            </div>
                            <p className="text-caption text-muted truncate">
                              {[os.nomedacidade, os.bairro, shortEquipe(os.nomedaequipe as string) || 'Sem equipe']
                                .filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          {aging != null && (
                            <span className={`text-caption font-mono font-bold flex-shrink-0 ${agCls}`}>{aging}d</span>
                          )}
                          {isActive && (
                            <kbd className="text-caption font-mono bg-surface border border-white/[0.08] rounded px-1.5 py-0.5 flex-shrink-0 self-center text-muted leading-none">
                              ↵
                            </kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <div className="px-4 py-2.5 border-t border-white/[0.08] flex items-center justify-between">
                    <span className="text-caption text-muted">
                      {results.os.length} resultado{results.os.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-caption text-muted/50">↑↓ para navegar</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <OSDrawer os={selectedOS} onClose={() => setSelectedOS(null)} />
    </>
  )
}
```

- [ ] **Step 2: Atualizar o hint do botão de busca em `src/components/layout/Navbar.tsx`**

Substituir:

```tsx
        <span className="text-caption flex-1 text-left hidden sm:block">Buscar OS, cliente…</span>
```

por:

```tsx
        <span className="text-caption flex-1 text-left hidden sm:block">Buscar OS ou página…</span>
```

(a `title="Busca global (Ctrl+K)"` do botão e o atalho de teclado continuam inalterados.)

- [ ] **Step 3: Rodar toda a suíte de testes**

Run: `npm test`
Expected: PASS — inclui os testes de `matchPages` (Task 3) e `visibleNavGroups` (Task 1), sem regressão em nenhum outro teste.

- [ ] **Step 4: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros em nenhum dos quatro.

- [ ] **Step 5: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true` — não usar outra porta).

No navegador, com o app carregado e autenticado:
1. Pressionar `Ctrl+K` (ou `⌘K`) — modal abre com a lista de páginas agrupada (Agora/Operar/Analisar/Infra & Campo), cores dos grupos batendo com a sidebar.
2. Digitar `"juniper"` — só a seção de páginas aparece (sem cabeçalho "Páginas", já que não há match de OS), mostrando a página Juniper.
3. Digitar um número de OS válido (7 dígitos) existente na base — só a seção de OS aparece, comportamento idêntico ao anterior.
4. Digitar algo que dê match em página e em OS ao mesmo tempo (ex.: `"os"` deve casar com o label de alguma página curta e com algum cliente/bairro) — confirmar que aparecem os dois cabeçalhos "Páginas" e "Ordens de Serviço".
5. Usar `↑`/`↓` para navegar entre os resultados mistos e `Enter` para selecionar uma página — confirmar que o app navega para a rota e o modal fecha.
6. Selecionar uma OS via clique — confirma que o `OSDrawer` abre normalmente (comportamento inalterado).
7. Pressionar `Esc` — modal fecha.
8. Se possível, logar como usuário `operador`/`viewer` (ou simular via devtools) e confirmar que só as páginas liberadas pelos módulos aparecem no `Ctrl+K` — mesma lista que já aparece na sidebar para esse papel.

Reportar o resultado de cada item antes de prosseguir. Se algo divergir do esperado, corrigir antes do commit.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/GlobalSearch.tsx src/components/layout/Navbar.tsx
git commit -m "feat(global-search): navegacao de paginas no Ctrl+K com resultados mistos"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (extração `lib/navigation.ts`) → Task 1. §3.2 (busca mista, estado vazio agrupado, seções com rótulo, navegação por página) → Tasks 3-4. §3.3 (hint do Navbar) → Task 4 Step 2. §5 (testes) → cobertos via testes unitários das funções puras (`visibleNavGroups`, `matchPages`) nas Tasks 1 e 3; os cenários de UI integrada (estado vazio agrupado, seções mistas, seleção navega/abre drawer) são cobertos via verificação manual no navegador (Task 4 Step 5) — o repositório não tem precedente de testes React Testing Library para componentes que dependem de `OSDataContext` + `react-router` + `react-query` simultaneamente (nenhum arquivo `Sidebar.test.tsx`/`GlobalSearch.test.tsx` existia antes deste plano), e a regra do projeto para mudança de UI (`CLAUDE.md`/`FRONTEND.md`) já exige verificação manual no navegador antes de reportar como concluído — construir essa infraestrutura de teste do zero está fora do escopo desta onda.

**Placeholders:** nenhum "TBD"/"depois eu vejo" — todo código é completo e literal em cada step.

**Consistência de tipos:** `NavLinkDef`/`NavGroup` definidos na Task 1 são usados com os mesmos nomes de campo (`to`, `label`, `icon`, `key`, `color`, `links`) em Tasks 2-4. `matchPages(groups: NavGroup[], query: string): NavLinkDef[]` definido na Task 3 é usado com a mesma assinatura na Task 4 (arquivo final já o inclui, idêntico).
