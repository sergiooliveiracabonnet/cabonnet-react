import { useRef, useState, type ComponentType, type CSSProperties } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList,
  BarChart2, PieChart, MapPin, Layout,
  Zap, Monitor, LogOut, FileText, Map,
  Kanban, Users, Truck, Bell, Radio, ChevronRight, Briefcase,
  TrendingUp, Award, CalendarDays, Activity, Shield,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { LogoIcon } from '../ui/LogoIcon'

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
    key: 'erp', label: 'ERP', color: '#8b5cf6',
    links: [
      { to: '/erp/ordens',        label: 'OS · Kanban',    icon: Kanban      },
      { to: '/erp/equipes',       label: 'Equipes',        icon: Users       },
      { to: '/erp/dispatch',      label: 'Dispatch',       icon: Truck       },
      { to: '/erp/relatorios',    label: 'Relatórios',     icon: BarChart2   },
      { to: '/erp/alertas',       label: 'Alertas',        icon: Bell        },
      { to: '/erp/rede',          label: 'Rede',           icon: Radio       },
      { to: '/erp/produtividade', label: 'Produtividade',  icon: TrendingUp  },
      { to: '/erp/qualidade',     label: 'Qualidade',      icon: Award       },
      { to: '/erp/planner',       label: 'Planner',        icon: CalendarDays},
    ],
  },
  {
    key: 'ops', label: 'Operacional', color: '#00d2c8',
    links: [
      { to: '/',        label: 'Dashboard', icon: LayoutDashboard },
      { to: '/cidades', label: 'Cidades',   icon: MapPin          },
      { to: '/mapa',    label: 'Mapa',      icon: Map             },
      { to: '/ordens',  label: 'Ordens',    icon: ClipboardList   },
    ],
  },
  {
    key: 'anal', label: 'Análise', color: '#34d399',
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
        setTip({ top: r.top + r.height / 2, left: r.right + 12 })
      }}
      onMouseLeave={() => setTip(null)}
    >
      <NavLink
        to={to}
        end={to === '/'}
        className={({ isActive }) =>
          `nav-link-${groupKey} flex items-center gap-3 pl-3 pr-2.5 py-[7px] rounded-lg
           border-l-[2.5px] transition-all duration-150 text-[12px]
           ${isActive ? 'active' : 'border-transparent text-muted hover:text-secondary'}`
        }
      >
        {({ isActive }) => (
          <>
            <Icon
              size={13}
              style={isActive ? { color: groupColor } : {}}
            />
            {sidebarOpen && (
              <span className="truncate flex-1 leading-none">{label}</span>
            )}
            {sidebarOpen && isActive && (
              <ChevronRight size={10} className="flex-shrink-0 opacity-50" style={{ color: groupColor }} />
            )}
          </>
        )}
      </NavLink>

      {tip && (
        <div
          style={{ top: tip.top, left: tip.left }}
          className="fixed z-[201] -translate-y-1/2 pointer-events-none animate-pop-in"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg shadow-xl
                          border border-white/[0.10]"
               style={{ background: 'rgba(6,12,32,0.98)' }}>
            <div className="w-[2px] h-3.5 rounded-full flex-shrink-0"
                 style={{ background: groupColor }} />
            <span className="text-[11px] font-semibold text-text whitespace-nowrap">{label}</span>
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

  async function handleLogout() {
    try { await api.auth.logout() } catch { /* logout best-effort */ }
    setUnauthed()
  }

  return (
    <aside
      className={`fixed top-0 left-0 h-full z-sidebar flex flex-col
                  sidebar-premium border-r
                  transition-all duration-normal overflow-hidden select-none
                  ${sidebarOpen ? 'w-[232px]' : 'w-[52px]'}`}
      style={{ borderRightColor: 'rgba(24,144,255,0.12)' }}
    >
      {/* ── Logo / Branding ── */}
      <div className={`relative flex-shrink-0 flex items-center h-[60px]
                       ${sidebarOpen ? 'gap-3 px-4' : 'justify-center'}`}>
        {sidebarOpen && (
          <div className="absolute inset-0 opacity-20 pointer-events-none"
               style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(24,144,255,0.4) 0%, transparent 70%)' }} />
        )}
        <div className="relative w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
             style={{
               background: 'linear-gradient(135deg, #1890ff 0%, #00d2c8 100%)',
               boxShadow: '0 0 0 1px rgba(24,144,255,0.5), 0 0 20px rgba(24,144,255,0.35), 0 0 40px rgba(24,144,255,0.15)',
             }}>
          <LogoIcon className="w-[17px] h-[17px]" style={{ filter: 'brightness(0) invert(1)' }} />
        </div>
        {sidebarOpen && (
          <div className="relative flex flex-col leading-none min-w-0">
            <span className="font-headline font-bold text-[16px] tracking-[0.05em] text-white">CABONNET</span>
            <span className="text-[9px] font-bold uppercase tracking-[2.5px] mt-0.5"
                  style={{ color: 'rgba(24,144,255,0.7)' }}>ISP Operations</span>
          </div>
        )}
        <div className="absolute bottom-0 left-3 right-3 h-px"
             style={{ background: 'linear-gradient(90deg,transparent,rgba(24,144,255,0.20),transparent)' }} />
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        {groups.map((group, gi) => (
          <div key={group.key} className={gi > 0 ? 'mt-1' : ''}>
            {sidebarOpen ? (
              <div className="flex items-center gap-2.5 px-3 pt-3 pb-1.5">
                <div className="w-[3px] h-3 rounded-full flex-shrink-0"
                     style={{ background: group.color, boxShadow: `0 0 6px ${group.color}` }} />
                <span className="text-[9.5px] font-headline font-bold uppercase tracking-[2.2px]"
                      style={{ color: group.color + 'bb' }}>{group.label}</span>
                <div className="flex-1 h-px opacity-20 rounded-full"
                     style={{ background: group.color }} />
              </div>
            ) : gi > 0 ? (
              <div className="flex justify-center py-2">
                <div className="w-1.5 h-1.5 rounded-full"
                     style={{ background: group.color, boxShadow: `0 0 5px ${group.color}99` }} />
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

      {/* ── Status bar ── */}
      {sidebarOpen && (
        <div className="flex-shrink-0 mx-2 mb-2 rounded-lg px-3 py-2.5 border"
             style={{ background: 'rgba(24,144,255,0.05)', borderColor: 'rgba(24,144,255,0.14)' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0"
                  style={{ boxShadow: '0 0 6px #34d399' }} />
            <span className="text-[9.5px] font-bold uppercase tracking-[1.5px] text-green-400">Sistema Online</span>
          </div>
          <p className="text-[9px] text-muted/60">Vale do Paraíba · SJC</p>
        </div>
      )}

      {/* ── User / Logout ── */}
      <div className="flex-shrink-0 px-2 pb-3 relative">
        <div className="absolute top-0 left-3 right-3 h-px"
             style={{ background: 'linear-gradient(90deg,transparent,rgba(24,144,255,0.15),transparent)' }} />
        {sidebarOpen ? (
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 mt-2 border transition-all duration-fast group cursor-default"
               style={{ background: 'rgba(24,144,255,0.06)', borderColor: 'rgba(24,144,255,0.12)' }}>
            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-[11px]"
                 style={{ background: 'linear-gradient(135deg, rgba(24,144,255,0.3), rgba(0,210,200,0.2))', border: '1px solid rgba(24,144,255,0.35)', color: '#60a5fa' }}>
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-semibold text-text truncate leading-none mb-0.5">Admin</p>
              <p className="text-[9.5px] truncate leading-none" style={{ color: 'rgba(24,144,255,0.6)' }}>Cabonnet ISP</p>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Sair"
              className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0
                         opacity-0 group-hover:opacity-100 transition-all duration-fast
                         text-muted/60 hover:text-red-400 hover:bg-red-500/10"
            >
              <LogOut size={11} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 pt-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                 style={{ background: 'rgba(24,144,255,0.15)', border: '1px solid rgba(24,144,255,0.30)', color: '#60a5fa' }}>
              A
            </div>
            <button
              onClick={handleLogout}
              aria-label="Sair"
              className="w-6 h-6 rounded-md flex items-center justify-center
                         text-muted/50 hover:text-red-400 hover:bg-red-500/10 transition-all duration-fast"
            >
              <LogOut size={11} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
