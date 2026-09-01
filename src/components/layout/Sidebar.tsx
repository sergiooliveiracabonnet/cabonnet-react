import { useRef, useState, useEffect, type ComponentType, type CSSProperties } from 'react'
import { NavLink } from 'react-router-dom'
import { CaretRight, SignOut } from '@phosphor-icons/react'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { useAuditStore } from '../../store/auditStore'
import { useOSDerived } from '../../contexts/OSDataContext'
import { api } from '../../lib/api'
import { LogoIcon } from '../ui/LogoIcon'
import { useVisibleNavGroups } from '../../lib/navigation'

const ROLE_LABELS: Record<string, string> = {
  gestor:   'Gestor',
  operador: 'Operador',
  viewer:   'Viewer',
  fornecedor: 'Fornecedor',
}

type StatusKey = 'loading' | 'error' | 'stale' | 'online'
const STATUS_CFG: Record<StatusKey, { color: string; dot: string; label: string; breathe: boolean }> = {
  loading: { color: 'text-primary', dot: 'bg-primary', label: 'Carregando',     breathe: false },
  error:   { color: 'text-red',     dot: 'bg-red',     label: 'Sem conexão',     breathe: false },
  stale:   { color: 'text-yellow',  dot: 'bg-yellow',  label: 'Desatualizado',   breathe: false },
  online:  { color: 'text-green',   dot: 'bg-green',   label: 'Online',          breathe: true  },
}

// ─── NavItem ─────────────────────────────────────────────────────────────────

interface NavItemProps {
  to:          string
  label:       string
  icon:        ComponentType<{ size?: number; style?: CSSProperties }>
  sidebarOpen: boolean
  groupKey:    string
  groupColor:  string
  onNavigate:  () => void
}

interface Tip { top: number; left: number }

function NavItem({ to, label, icon: Icon, sidebarOpen, groupKey, groupColor, onNavigate }: NavItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)

  return (
    <div
      ref={ref}
      className="relative mx-2.5 my-0.5"
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
        onClick={onNavigate}
        className={({ isActive }) =>
          `nav-link-${groupKey} flex min-h-11 items-center gap-3 rounded-lg border py-3 pl-3 pr-2.5
           md:min-h-0 md:py-2
           transition-colors duration-150 text-label font-medium
           ${isActive ? 'active' : 'border-transparent text-muted hover:text-text'}`
        }
      >
        {({ isActive }) => (
          <>
            <Icon size={16} style={isActive ? { color: groupColor } : {}} />
            {sidebarOpen && (
              <span className="truncate flex-1 leading-none">{label}</span>
            )}
            {sidebarOpen && isActive && (
              <CaretRight size={10} className="flex-shrink-0 opacity-40" style={{ color: groupColor }} />
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
            <span className="text-caption font-medium text-text whitespace-nowrap">{label}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { sidebarOpen, setSidebar } = useUIStore()
  const setUnauthed = useAuthStore(s => s.setUnauthed)
  const role        = useAuthStore(s => s.role)
  const logAudit    = useAuditStore(s => s.log)
  const { isLoading, error, dataUpdatedAt } = useOSDerived()

  const groups = useVisibleNavGroups()

  // nowTs actualizado a cada minuto para que a badge de status reflicta o tempo real
  // Usamos useState com lazy initializer para não chamar Date.now() diretamente no render
  const [nowTs, setNowTs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!sidebarOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebar(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen, setSidebar])

  const closeAfterMobileNavigation = () => {
    if (window.innerWidth < 768) setSidebar(false)
  }

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
      aria-label="Navegação principal"
      className={`sidebar-premium fixed left-0 top-0 z-[400] flex h-full w-[min(88vw,300px)]
                  select-none flex-col overflow-hidden transition-[width,transform] duration-200 md:z-sidebar
                  ${sidebarOpen
                    ? 'translate-x-0 md:w-[248px]'
                    : '-translate-x-full md:w-[64px] md:translate-x-0'}`}
    >
      {/* ── Logo / Branding ── */}
      <div className={`relative flex-shrink-0 flex items-center h-[64px]
                       border-b border-border
                       ${sidebarOpen ? 'gap-3 px-4' : 'justify-center'}`}>
        <div
          className="brand-mark w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
          style={{
            background: 'linear-gradient(145deg, rgb(var(--c-primary)) 0%, rgb(var(--c-primary-dark)) 100%)',
            boxShadow:  '0 0 0 1px rgba(96,165,250,0.28), 0 8px 24px rgba(29,78,216,0.24)',
          }}
        >
          <LogoIcon className="w-[17px] h-[17px]" style={{ filter: 'brightness(0) invert(1)' }} />
        </div>
        {sidebarOpen && (
          <div className="flex flex-col leading-none min-w-0">
            <span className="font-headline font-extrabold text-title tracking-[0.08em] text-text">
              CABONNET
            </span>
            <span className="text-caption font-medium text-muted mt-0.5">
              Central de operações
            </span>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
        {groups.map((group, gi) => (
          <div key={group.key} className={gi > 0 ? 'mt-1' : ''}>
            {sidebarOpen ? (
              <div className="flex items-center gap-2 px-4 pt-4 pb-1.5">
                <div
                  className="w-1 h-1 rounded-full flex-shrink-0 bg-primary"
                />
                <span
                  className="text-caption font-semibold uppercase tracking-[0.07em]"
                  style={{ color: 'rgb(var(--c-muted))' }}
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
                  onNavigate={closeAfterMobileNavigation}
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
            <span className={`text-caption font-semibold ${status.color}`}>{status.label}</span>
          </div>
          <p className="text-caption text-muted">Vale do Paraíba · SJC</p>
        </div>
      )}

      {/* ── User / Logout ── */}
      <div className="flex-shrink-0 px-2 pb-3 border-t border-white/[0.08] pt-2">
        {sidebarOpen ? (
          <div className="group flex items-center gap-2.5 rounded-lg px-3 py-2
                          bg-card-high border border-white/[0.08] hover:border-muted/30
                          transition-colors duration-150 cursor-default">
            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center
                            font-semibold text-caption bg-primary/20 border border-primary/30 text-primary">
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-label font-semibold text-text truncate leading-none">Admin</p>
              <p className="text-caption text-muted truncate leading-none mt-0.5">
                {ROLE_LABELS[role ?? ''] ?? 'Viewer'} · ISP Ops
              </p>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Sair"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md md:h-6 md:w-6
                         opacity-0 group-hover:opacity-100 transition-all duration-150
                         text-muted hover:text-red hover:bg-red/10"
            >
              <SignOut size={11} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-caption font-semibold
                            bg-primary/20 border border-primary/30 text-primary">
              A
            </div>
            <button
              onClick={handleLogout}
              aria-label="Sair"
              className="w-6 h-6 rounded-md flex items-center justify-center
                         text-muted hover:text-red hover:bg-red/10 transition-colors duration-150"
            >
              <SignOut size={11} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
