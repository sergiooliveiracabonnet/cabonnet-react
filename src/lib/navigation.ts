import { useMemo, type ComponentType, type CSSProperties } from 'react'
import {
  LayoutDashboard, ClipboardList,
  BarChart2, PieChart, MapPin,
  Zap, Monitor, FileText, Map,
  Bell, Award, CalendarDays, Shield, Siren, Medal, Users, Wrench,
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
      { to: '/erp/bi-gestao-tecnica', label: 'BI Técnico', icon: Wrench   },
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
