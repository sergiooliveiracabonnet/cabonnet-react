import { useRef, useState, useEffect, type ComponentType, type CSSProperties } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList,
  BarChart2, PieChart, MapPin, Layout,
  Zap, Monitor, LogOut, FileText, Map,
  Kanban, Users, Bell, ChevronRight, Briefcase,
  TrendingUp, Award, CalendarDays, Activity, Shield,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { useAuditStore } from '../../store/auditStore'
import { useOSDerived } from '../../contexts/OSDataContext'
import { api } from '../../lib/api'
import { LogoIcon } from '../ui/LogoIcon'

const ROLE_LABELS: Record<string, string> = {
  gestor:   'Gestor',
  operador: 'Operador',
  viewer:   'Viewer',
}

type StatusKey = 'loading' | 'error' | 'stale' | 'online'
const STATUS_CFG: Record<StatusKey, { color: string; dot: string; label: string; breathe: boolean }> = {
  loading: { color: 'text-primary', dot: 'bg-primary', label: 'Carregando',     breathe: false },
  error:   { color: 'text-red',     dot: 'bg-red',     label: 'Sem conexão',     breathe: false },
  stale:   { color: 'text-yellow',  dot: 'bg-yellow',  label: 'Desatualizado',   breathe: false },
  online:  { color: 'text-green',   dot: 'bg-green',   label: 'Online',          breathe: true  },
}

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

const groups: NavGroup[] = [
  {
    key: 'erp', label: 'ERP', color: '#c4b5fd',
    links: [
      { to: '/erp/ordens',        label: 'OS · Kanban',    icon: Kanban      },
      { to: '/erp/equipes',       label: 'Equipes',        icon: Users       },
      { to: '/erp/relatorios',    label: 'Relatórios',     icon: BarChart2   },
      { to: '/erp/alertas',       label: 'Alertas',        icon: Bell        },
      { to: '/erp/produtividade', label: 'Produtividade',  icon: TrendingUp  },
      { to: '/erp/qualidade',      label: 'Qualidade',      icon: Award       },
      { to: '/erp/justificativa',  label: 'Justificativa',  icon: FileText    },
      { to: '/erp/planner',        label: 'Planner',        icon: CalendarDays},
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
      { to: '/capacidade', label: 'Capacidade', icon: Activity  },
      { to: '/gerencial',  label: 'Gerencial',  icon: Briefcase },
      { to: '/fechamento', label: 'Fechamento', icon: FileText  },
    ],
  },
  {
    key: 'infra', label: 'Campo & Infra', color: '#fb923c',
    links: [
      { to: '/campo',      label: 'Campo',      icon: Layout  },
      { to: '/fornecedor', label: 'Fornecedor', icon: Shield  },
      { to: '/juniper',    label: 'Juniper',    icon: Zap     },
      { to: '/noc',        label: 'NOC',        icon: Monitor },
    ],
  },
]

// ─── NavItem ─────────────────────────────────────────────────────────────────

interface NavItemProps {
  to:          string
  label:       string
  icon:        ComponentType<{ size?: number; style?: CSSProperties }>
  sidebarOpen: boolean
  groupKey:    string
  groupColor:  string
}

interface Tip { top: number; left: number }

function NavItem({ to, label, icon: Icon, sidebarOpen, groupKey, groupColor }: NavItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)

  return (
    <div
      ref={ref}
      className="relative mx-2 my-px"
      onMouseEnter={() => {
        if (sidebarOpen || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        setTip({ top: r.top + r.height / 2, left: r.right + 10 })
      }}
      onMouseLeave={() => setTip(null)}
    >
      <NavLink
        to={to}
        end={to === '/'}
        className={({ isActive }) =>
          `nav-link-${groupKey} flex items-center gap-3 pl-3 pr-2.5 py-[7px] rounded-lg
           border-l-2 transition-colors duration-150 text-[12px] font-medium
           ${isActive ? 'active' : 'border-transparent text-muted hover:text-secondary'}`
        }
      >
        {({ isActive }) => (
          <>
            <Icon size={13} style={isActive ? { color: groupColor } : {}} />
            {sidebarOpen && (
              <span className="truncate flex-1 leading-none">{label}</span>
            )}
            {sidebarOpen && isActive && (
              <ChevronRight size={10} className="flex-shrink-0 opacity-40" style={{ color: groupColor }} />
            )}
          </>
        )}
      </NavLink>

      {/* Tooltip no modo collapsed */}
      {tip && (
        <div
          style={{ top: tip.top, left: tip.left }}
          className="fixed z-[201] -translate-y-1/2 pointer-events-none"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg shadow-lg
                          bg-elevated border border-white/[0.08]">
            <div className="w-[2px] h-3 rounded-full flex-shrink-0" style={{ background: groupColor }} />
            <span className="text-[11px] font-medium text-text whitespace-nowrap">{label}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { sidebarOpen } = useUIStore()
  const setUnauthed = useAuthStore(s => s.setUnauthed)
  const role        = useAuthStore(s => s.role)
  const logAudit    = useAuditStore(s => s.log)
  const { isLoading, error, dataUpdatedAt } = useOSDerived()

  // nowTs actualizado a cada minuto para que a badge de status reflicta o tempo real
  // Usamos useState com lazy initializer para não chamar Date.now() diretamente no render
  const [nowTs, setNowTs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const ageMs   = dataUpdatedAt > 0 ? nowTs - dataUpdatedAt : null
  const isError = !!error && !isLoading
  const isStale = !isError && ageMs !== null && ageMs > 5 * 60_000
  const isNew   = dataUpdatedAt === 0 && isLoading

  const statusKey: StatusKey =
    isError ? 'error' :
    isNew   ? 'loading' :
    isStale ? 'stale'  : 'online'
  const status = STATUS_CFG[statusKey]

  async function handleLogout() {
    logAudit('Logout', undefined, 'auth')
    try { await api.auth.logout() } catch { /* logout best-effort */ }
    setUnauthed()
  }

  return (
    <aside
      className={`fixed top-0 left-0 h-full z-sidebar flex flex-col
                  sidebar-premium transition-all duration-200 overflow-hidden select-none
                  ${sidebarOpen ? 'w-[224px]' : 'w-[52px]'}`}
    >
      {/* ── Logo / Branding ── */}
      <div className={`relative flex-shrink-0 flex items-center h-[56px]
                       border-b border-white/[0.08]
                       ${sidebarOpen ? 'gap-3 px-4' : 'justify-center'}`}>
        <div
          className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)',
            boxShadow:  '0 0 0 1px rgba(59,130,246,0.4), 0 2px 8px rgba(59,130,246,0.25)',
          }}
        >
          <LogoIcon className="w-[17px] h-[17px]" style={{ filter: 'brightness(0) invert(1)' }} />
        </div>
        {sidebarOpen && (
          <div className="flex flex-col leading-none min-w-0">
            <span className="font-headline font-bold text-[15px] tracking-wide text-text">
              CABONNET
            </span>
            <span className="text-[10px] font-medium text-muted mt-0.5">
              ISP Operations
            </span>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        {groups.map((group, gi) => (
          <div key={group.key} className={gi > 0 ? 'mt-1' : ''}>
            {sidebarOpen ? (
              <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
                <div
                  className="w-1 h-3 rounded-full flex-shrink-0"
                  style={{ background: group.color }}
                />
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.07em]"
                  style={{ color: group.color + 'aa' }}
                >
                  {group.label}
                </span>
              </div>
            ) : gi > 0 ? (
              <div className="flex justify-center py-2">
                <div className="w-1 h-1 rounded-full" style={{ background: group.color + '99' }} />
              </div>
            ) : (
              <div className="py-1.5" />
            )}

            <div className="space-y-px">
              {group.links.map(({ to, label, icon }) => (
                <NavItem
                  key={to}
                  to={to}
                  label={label}
                  icon={icon}
                  sidebarOpen={sidebarOpen}
                  groupKey={group.key}
                  groupColor={group.color}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Status ── */}
      {sidebarOpen && (
        <div className="flex-shrink-0 mx-2 mb-2 rounded-lg px-3 py-2 bg-card-high border border-white/[0.08]">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status.dot}${status.breathe ? ' breathe' : ''}`} />
            <span className={`text-[10px] font-semibold ${status.color}`}>{status.label}</span>
          </div>
          <p className="text-[10px] text-muted">Vale do Paraíba · SJC</p>
        </div>
      )}

      {/* ── User / Logout ── */}
      <div className="flex-shrink-0 px-2 pb-3 border-t border-white/[0.08] pt-2">
        {sidebarOpen ? (
          <div className="group flex items-center gap-2.5 rounded-lg px-3 py-2
                          bg-card-high border border-white/[0.08] hover:border-muted/30
                          transition-colors duration-150 cursor-default">
            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center
                            font-semibold text-[11px] bg-primary/20 border border-primary/30 text-primary">
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-text truncate leading-none">Admin</p>
              <p className="text-[10px] text-muted truncate leading-none mt-0.5">
                {ROLE_LABELS[role ?? ''] ?? 'Viewer'} · ISP Ops
              </p>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Sair"
              className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0
                         opacity-0 group-hover:opacity-100 transition-all duration-150
                         text-muted hover:text-red hover:bg-red/10"
            >
              <LogOut size={11} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold
                            bg-primary/20 border border-primary/30 text-primary">
              A
            </div>
            <button
              onClick={handleLogout}
              aria-label="Sair"
              className="w-6 h-6 rounded-md flex items-center justify-center
                         text-muted hover:text-red hover:bg-red/10 transition-colors duration-150"
            >
              <LogOut size={11} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
